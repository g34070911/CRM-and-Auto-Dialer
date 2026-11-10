import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { assertProfileOwnership } from '../utils/helpers.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
const OUTCOMES = ['Connected', 'No Answer', 'Busy', 'Voicemail', 'Interested', 'Do Not Call', 'Skipped'];
function rawDialValue(value) { const raw = String(value ?? '').trim(); const digits = raw.replace(/\D/g, ''); return { raw, digits, valid: digits.length >= 7 && digits.length <= 15 }; }

async function ensureCoveredField(client, profileId) {
  const existing = await client.query("SELECT id FROM fields WHERE profile_id=$1 AND key='covered'", [profileId]);
  if (existing.rows.length) return existing.rows[0];
  const inserted = await client.query(`INSERT INTO fields(profile_id,key,label,type,order_index)
    VALUES($1,'covered','Covered','boolean',(SELECT COALESCE(MAX(order_index),-1)+1 FROM fields WHERE profile_id=$1)) RETURNING id`, [profileId]);
  return inserted.rows[0];
}

router.get('/queue', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { phoneFieldKey, limit = 25 } = req.query;
    if (!phoneFieldKey) return res.status(400).json({ error: 'phoneFieldKey is required' });
    const { rows } = await query(`SELECT r.id, r.data, r.status, r.tags, r.row_order, $1::text AS phone_field_key,
      r.data->>$1 AS phone_value FROM records r WHERE r.profile_id=$2
      AND COALESCE(r.data->>'covered','false') <> 'true' AND r.id NOT IN
      (SELECT record_id FROM extension_queue_claims WHERE profile_id=$2 AND user_id=$3 AND status='claimed')
      ORDER BY r.row_order NULLS LAST, r.created_at LIMIT $4`, [phoneFieldKey, req.params.profileId, req.user.user_id, Math.min(100, Number(limit))]);
    res.json(rows.map(record => {
      const phone = rawDialValue(record.phone_value);
      return { ...record, normalized_phone: phone.valid ? phone.digits : null, dial_value: phone.raw };
    }).filter(record => record.dial_value && record.normalized_phone));
  } catch (err) { next(err); }
});

router.post('/queue/next', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { recordId, phoneFieldKey, idempotencyKey } = req.body;
    if (!recordId || !phoneFieldKey || !idempotencyKey) return res.status(400).json({ error: 'recordId, phoneFieldKey, and idempotencyKey are required' });
    await client.query('BEGIN');
    const prior = await client.query('SELECT * FROM call_sessions WHERE user_id=$1 AND idempotency_key=$2', [req.user.user_id, idempotencyKey]);
    if (prior.rows.length) { await client.query('COMMIT'); return res.json({ session: prior.rows[0], phoneNumber: prior.rows[0].phone_number }); }
    const record = await client.query("SELECT id,data FROM records WHERE id=$1 AND profile_id=$2 AND COALESCE(data->>'covered','false') <> 'true' FOR UPDATE", [recordId, req.params.profileId]);
    if (!record.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Record is missing or already covered' }); }
    const dialValue = rawDialValue(record.rows[0].data?.[phoneFieldKey]);
    if (!dialValue.valid) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Record has no dialable phone number' }); }
    const dnc = await client.query("SELECT 1 FROM do_not_call_numbers WHERE company_id=$1 AND regexp_replace(phone_number,'\\D','','g')=$2", [req.user.company_id, dialValue.digits]);
    if (dnc.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Number is on the do-not-call list' }); }
    const recent = await client.query("SELECT COUNT(*)::int AS count FROM call_sessions WHERE company_id=$1 AND user_id=$2 AND started_at >= now()-interval '1 hour'", [req.user.company_id, req.user.user_id]);
    if (recent.rows[0].count >= Number(process.env.MAX_CALLS_PER_HOUR || 100)) { await client.query('ROLLBACK'); return res.status(429).json({ error: 'Hourly dialing cap reached' }); }
    const claim = await client.query(`INSERT INTO extension_queue_claims(company_id,profile_id,record_id,user_id)
      SELECT $1,$2,$3,$4 WHERE NOT EXISTS (SELECT 1 FROM extension_queue_claims WHERE profile_id=$2 AND record_id=$3 AND user_id=$4 AND status='claimed') RETURNING *`,
      [req.user.company_id, req.params.profileId, recordId, req.user.user_id]);
    if (!claim.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Record is already claimed' }); }
    const session = await client.query(`INSERT INTO call_sessions(company_id,profile_id,record_id,user_id,phone_field_key,phone_number,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [req.user.company_id, req.params.profileId, recordId, req.user.user_id, phoneFieldKey, dialValue.raw, idempotencyKey]);
    await client.query('COMMIT');
    res.status(201).json({ session: session.rows[0], claim: claim.rows[0], phoneNumber: dialValue.raw });
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); } finally { client.release(); }
});

router.post('/queue/covered', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const recordIds = [...new Set(Array.isArray(req.body.recordIds) ? req.body.recordIds : [])];
    if (!recordIds.length) return res.status(400).json({ error: 'recordIds are required' });
    await client.query('BEGIN');
    await ensureCoveredField(client, req.params.profileId);
    const result = await client.query("UPDATE records SET data=jsonb_set(COALESCE(data,'{}'::jsonb),'{covered}','true'::jsonb,true),updated_at=now() WHERE profile_id=$1 AND id=ANY($2::uuid[]) RETURNING id", [req.params.profileId, recordIds]);
    await client.query("UPDATE extension_queue_claims SET status='finished',finished_at=now() WHERE profile_id=$1 AND record_id=ANY($2::uuid[]) AND user_id=$3 AND status='claimed'", [req.params.profileId, recordIds, req.user.user_id]);
    await client.query('COMMIT');
    res.json({ covered: result.rows.map(row => row.id), count: result.rowCount });
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); } finally { client.release(); }
});

router.post('/queue/claim', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { recordId, phoneFieldKey, idempotencyKey } = req.body;
    if (!recordId || !phoneFieldKey || !idempotencyKey) return res.status(400).json({ error: 'recordId, phoneFieldKey, and idempotencyKey are required' });
    await client.query('BEGIN');
    const record = await client.query('SELECT id,data FROM records WHERE id=$1 AND profile_id=$2 FOR UPDATE', [recordId, req.params.profileId]);
    if (!record.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Record not found' }); }
    const rawPhone = String(record.rows[0].data?.[phoneFieldKey] ?? '').trim();
    const dialValue = rawDialValue(rawPhone);
    if (!dialValue.valid) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Record has no dialable phone number' }); }
    const dnc = await client.query("SELECT 1 FROM do_not_call_numbers WHERE company_id=$1 AND regexp_replace(phone_number,'\\D','','g')=$2", [req.user.company_id, dialValue.digits]);
    if (dnc.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Number is on the do-not-call list' }); }
    const claim = await client.query(`INSERT INTO extension_queue_claims(company_id,profile_id,record_id,user_id)
      SELECT $1,$2,$3,$4 WHERE NOT EXISTS (
        SELECT 1 FROM extension_queue_claims WHERE profile_id=$2 AND record_id=$3 AND user_id=$4 AND status='claimed'
      ) RETURNING *`, [req.user.company_id, req.params.profileId, recordId, req.user.user_id]);
    if (!claim.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Record is already claimed' }); }
    await client.query('COMMIT'); res.status(201).json({ ...claim.rows[0], phoneNumber: rawPhone, normalizedPhone: dialValue.digits, phoneFieldKey, idempotencyKey });
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); } finally { client.release(); }
});

router.post('/sessions', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { recordId, phoneFieldKey, phoneNumber, idempotencyKey } = req.body;
    if (idempotencyKey) { const existing = await query('SELECT * FROM call_sessions WHERE user_id=$1 AND idempotency_key=$2', [req.user.user_id, idempotencyKey]); if (existing.rows.length) return res.json(existing.rows[0]); }
    const dialValue = rawDialValue(phoneNumber); if (!dialValue.valid) return res.status(400).json({ error: 'Invalid phone number' });
    const record = await query('SELECT id FROM records WHERE id=$1 AND profile_id=$2', [recordId, req.params.profileId]); if (!record.rows.length) return res.status(404).json({ error: 'Record not found' });
    const dnc = await query("SELECT 1 FROM do_not_call_numbers WHERE company_id=$1 AND regexp_replace(phone_number,'\\D','','g')=$2", [req.user.company_id, dialValue.digits]); if (dnc.rows.length) return res.status(409).json({ error: 'Number is on the do-not-call list' });
    const recent = await query("SELECT COUNT(*)::int AS count FROM call_sessions WHERE company_id=$1 AND user_id=$2 AND started_at >= now()-interval '1 hour'", [req.user.company_id, req.user.user_id]); if (recent.rows[0].count >= Number(process.env.MAX_CALLS_PER_HOUR || 100)) return res.status(429).json({ error: 'Hourly dialing cap reached' });
    const { rows } = await query('INSERT INTO call_sessions(company_id,profile_id,record_id,user_id,phone_field_key,phone_number,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [req.user.company_id, req.params.profileId, recordId, req.user.user_id, phoneFieldKey, dialValue.raw, idempotencyKey || null]); res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});
router.post('/sessions/:sessionId/events', async (req, res, next) => { try { const { event, metadata = {} } = req.body; if (!['ringing','connected','failed','hangup','tab_closed'].includes(event)) return res.status(400).json({ error: 'Invalid event' }); const { rows } = await query('INSERT INTO call_session_events(call_session_id,event,metadata) SELECT id,$1,$2 FROM call_sessions WHERE id=$3 AND user_id=$4 ON CONFLICT DO NOTHING RETURNING *', [event, JSON.stringify(metadata), req.params.sessionId, req.user.user_id]); res.status(201).json(rows[0] || { duplicate: true }); } catch(err){next(err);} });
router.post('/sessions/:sessionId/abort', async (req, res, next) => { try { const { reason = 'Google Voice automation failed' } = req.body; const { rows } = await query("UPDATE call_sessions SET status='failed',outcome='Skipped',ended_at=COALESCE(ended_at,now()),duration_seconds=COALESCE(duration_seconds,EXTRACT(EPOCH FROM (now()-started_at))::int) WHERE id=$1 AND user_id=$2 AND status <> 'ended' RETURNING *", [req.params.sessionId, req.user.user_id]); if (!rows.length) return res.status(404).json({ error: 'Session not found' }); const session = rows[0]; await query("UPDATE extension_queue_claims SET status='finished',finished_at=now() WHERE record_id=$1 AND user_id=$2 AND status='claimed'", [session.record_id, session.user_id]); await query('INSERT INTO call_session_events(call_session_id,event,metadata) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [session.id, 'failed', JSON.stringify({ reason })]); res.json(session); } catch (err) { next(err); } });
router.post('/sessions/:sessionId/disposition', async (req, res, next) => { try { const { outcome, notes }=req.body; if(!OUTCOMES.includes(outcome))return res.status(400).json({error:'Invalid disposition'}); const { rows }=await query("UPDATE call_sessions SET outcome=$1,status='ended',ended_at=COALESCE(ended_at,now()),duration_seconds=COALESCE(duration_seconds,EXTRACT(EPOCH FROM (COALESCE(ended_at,now())-started_at))::int) WHERE id=$2 AND user_id=$3 RETURNING *",[outcome,req.params.sessionId,req.user.user_id]); if(!rows.length)return res.status(404).json({error:'Session not found'}); const s=rows[0]; const activity=await query('INSERT INTO call_activities(call_session_id,company_id,profile_id,record_id,user_id,outcome,notes,started_at,ended_at,duration_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(call_session_id) DO NOTHING RETURNING *',[s.id,s.company_id,s.profile_id,s.record_id,s.user_id,outcome,notes||null,s.started_at,s.ended_at,s.duration_seconds||0]); await query("UPDATE extension_queue_claims SET status='finished',finished_at=now() WHERE record_id=$1 AND user_id=$2 AND status='claimed'",[s.record_id,s.user_id]); res.json({session:s,activity:activity.rows[0]||null}); }catch(err){next(err);} });
export default router;
