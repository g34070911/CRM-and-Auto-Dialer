import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { assertProfileOwnership } from '../utils/helpers.js';
import { normalizePhone } from '../utils/phone.js';
import crypto from 'node:crypto';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const MAX_CALLS_PER_HOUR = Number(process.env.MAX_CALLS_PER_HOUR || 100);
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function newToken() { return crypto.randomBytes(32).toString('base64url'); }

router.get('/profiles', async (req, res, next) => {
  try { await assertProfileOwnership(req.params.profileId, req.user.company_id); const { rows } = await query('SELECT * FROM dialer_profiles WHERE company_id=$1 AND profile_id=$2 ORDER BY is_default DESC, created_at DESC', [req.user.company_id, req.params.profileId]); res.json(rows); } catch (err) { next(err); }
});
router.post('/pairings', async (req, res, next) => { try { const token = newToken(); const { label = 'Desktop Agent' } = req.body; const { rows } = await query('INSERT INTO agent_pairings(company_id,user_id,token_hash,label) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,label) DO UPDATE SET token_hash=EXCLUDED.token_hash, revoked_at=NULL RETURNING id,label,created_at', [req.user.company_id, req.user.user_id, hashToken(token), label]); res.status(201).json({ ...rows[0], token }); } catch (err) { next(err); } });
router.get('/pairings', async (req, res, next) => { try { const { rows }=await query('SELECT id,label,revoked_at,last_seen_at,created_at FROM agent_pairings WHERE company_id=$1 AND user_id=$2 ORDER BY created_at DESC',[req.user.company_id,req.user.user_id]); res.json(rows); } catch(err){next(err);} });
router.post('/pairings/:pairingId/revoke', async (req,res,next)=>{try{const {rows}=await query('UPDATE agent_pairings SET revoked_at=now() WHERE id=$1 AND company_id=$2 AND user_id=$3 RETURNING id,revoked_at',[req.params.pairingId,req.user.company_id,req.user.user_id]);if(!rows.length)return res.status(404).json({error:'Pairing not found'});res.json(rows[0]);}catch(err){next(err);}});
router.get('/do-not-call', async (req, res, next) => { try { const { rows } = await query('SELECT id,phone_number,reason,created_at FROM do_not_call_numbers WHERE company_id=$1 ORDER BY created_at DESC', [req.user.company_id]); res.json(rows); } catch (err) { next(err); } });
router.post('/do-not-call', async (req, res, next) => { try { const normalized = normalizePhone(req.body.phoneNumber); if (!normalized.valid) return res.status(400).json({ error: 'A valid phone number is required' }); const { rows } = await query('INSERT INTO do_not_call_numbers(company_id,phone_number,reason) VALUES($1,$2,$3) ON CONFLICT(company_id,phone_number) DO UPDATE SET reason=EXCLUDED.reason RETURNING *', [req.user.company_id, normalized.e164, req.body.reason || null]); res.status(201).json(rows[0]); } catch (err) { next(err); } });
router.delete('/do-not-call/:numberId', async (req, res, next) => { try { const { rows } = await query('DELETE FROM do_not_call_numbers WHERE id=$1 AND company_id=$2 RETURNING id', [req.params.numberId, req.user.company_id]); if (!rows.length) return res.status(404).json({ error: 'Number not found' }); res.status(204).send(); } catch (err) { next(err); } });
router.post('/profiles', async (req, res, next) => {
  try { await assertProfileOwnership(req.params.profileId, req.user.company_id); const { name, config } = req.body; if (!name || !config?.coordinates) return res.status(400).json({ error: 'name and calibration coordinates are required' }); const { rows } = await query('INSERT INTO dialer_profiles(company_id,profile_id,name,config,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.user.company_id, req.params.profileId, name, JSON.stringify(config), req.user.user_id]); res.status(201).json(rows[0]); } catch (err) { next(err); }
});
router.patch('/profiles/:dialerProfileId', async (req, res, next) => { try { await assertProfileOwnership(req.params.profileId, req.user.company_id); const { name, config } = req.body; const { rows } = await query('UPDATE dialer_profiles SET name=COALESCE($1,name), config=COALESCE($2,config), updated_at=now() WHERE id=$3 AND company_id=$4 AND profile_id=$5 RETURNING *', [name || null, config ? JSON.stringify(config) : null, req.params.dialerProfileId, req.user.company_id, req.params.profileId]); if (!rows.length) return res.status(404).json({ error: 'Dialer profile not found' }); res.json(rows[0]); } catch (err) { next(err); } });
router.post('/sessions', async (req, res, next) => {
  try {
    await assertProfileOwnership(req.params.profileId, req.user.company_id);
    const { recordId, phoneFieldKey, phoneNumber } = req.body;
    const normalized = normalizePhone(phoneNumber);
    if (!recordId || !phoneFieldKey || !normalized.valid) return res.status(400).json({ error: 'A valid phone number and record are required' });
    const record = await query('SELECT id FROM records WHERE id=$1 AND profile_id=$2', [recordId, req.params.profileId]);
    if (!record.rows.length) return res.status(404).json({ error: 'Record not found in this profile' });
    const dnc = await query('SELECT id FROM do_not_call_numbers WHERE company_id=$1 AND phone_number=$2', [req.user.company_id, normalized.e164]);
    if (dnc.rows.length) return res.status(409).json({ error: 'This number is on the do-not-call list' });
    const recent = await query("SELECT COUNT(*)::int AS count FROM call_sessions WHERE company_id=$1 AND user_id=$2 AND started_at >= now() - interval '1 hour'", [req.user.company_id, req.user.user_id]);
    if (recent.rows[0].count >= MAX_CALLS_PER_HOUR) return res.status(429).json({ error: 'Hourly dialing cap reached' });
    const { rows } = await query('INSERT INTO call_sessions(company_id,profile_id,record_id,user_id,phone_field_key,phone_number) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [req.user.company_id, req.params.profileId, recordId, req.user.user_id, phoneFieldKey, normalized.e164]); res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});
router.post('/sessions/:sessionId/end', async (req, res, next) => {
  try { const { outcome, notes } = req.body; if (!['Connected','No Answer','Busy','Voicemail','Skipped'].includes(outcome)) return res.status(400).json({ error: 'Invalid call outcome' }); const { rows } = await query('SELECT * FROM call_sessions WHERE id=$1 AND company_id=$2 AND profile_id=$3', [req.params.sessionId, req.user.company_id, req.params.profileId]); if (!rows.length) return res.status(404).json({ error: 'Call session not found' }); const session=rows[0]; const ended=new Date(); const duration=Math.max(0, Math.floor((ended-new Date(session.started_at))/1000)); const updated=await query("UPDATE call_sessions SET status='ended', outcome=$1, ended_at=$2, duration_seconds=$3 WHERE id=$4 AND status <> 'ended' RETURNING *", [outcome, ended, duration, session.id]); if (!updated.rows.length) return res.json(session); const activity=await query('INSERT INTO call_activities(call_session_id,company_id,profile_id,record_id,user_id,outcome,notes,started_at,ended_at,duration_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(call_session_id) DO NOTHING RETURNING *', [session.id, session.company_id, session.profile_id, session.record_id, session.user_id, outcome, notes || null, session.started_at, ended, duration]); res.json({ ...updated.rows[0], activity: activity.rows[0] || null }); } catch (err) { next(err); }
});
router.get('/records/:recordId/activities', async (req, res, next) => { try { await assertProfileOwnership(req.params.profileId, req.user.company_id); const { rows }=await query('SELECT * FROM call_activities WHERE record_id=$1 AND profile_id=$2 ORDER BY created_at DESC', [req.params.recordId, req.params.profileId]); res.json(rows); } catch(err){next(err);} });
export default router;
