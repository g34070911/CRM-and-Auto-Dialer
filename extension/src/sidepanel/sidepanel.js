const $ = id => document.getElementById(id);
const port = chrome.runtime.connect({ name: 'sidepanel' });
let state = { queue: [], active: null, paused: false, queueRunning: false, stopped: false };
let loading = false;
const outcomes = ['Connected', 'No Answer', 'Busy', 'Voicemail', 'Interested', 'Do Not Call', 'Skipped'];

function render() {
  $('status').textContent = loading ? 'Loading queue...' : state.active ? `Active: ${state.active.phone_value || state.active.id}` : state.paused ? 'Paused' : `Ready - ${state.queue.length} queued`;
  $('queue').replaceChildren(...state.queue.slice(0, 10).map(item => { const row = document.createElement('div'); row.textContent = item.phone_value || 'Invalid number'; return row; }));
  $('disposition').hidden = !state.active?.ended || Boolean(state.active?.bulk);
  $('pause').textContent = state.paused ? 'Resume' : 'Pause';
  $('bulk').textContent = state.queueRunning ? 'Bulk Dialing' : 'Bulk Dial';
  $('bulk').disabled = Boolean(state.active) || state.queueRunning;
  $('load').disabled = loading;
  $('load').classList.toggle('loading', loading);
  $('covered').hidden = !state.stopped || !state.dialedRecordIds?.length;
}

port.onMessage.addListener(message => { if (message.type === 'state') { state = message; render(); } });
async function send(type, extra = {}) { const response = await chrome.runtime.sendMessage({ type, ...extra }); if (response?.error) $('status').textContent = response.error; return response; }
for (const [id, type] of [['bulk','bulkDial'],['next','callNext'],['pause','pause'],['hangup','hangup']]) $(id).onclick = () => send(type);
$('stop').onclick = async () => { const response = await send('stop'); state = { ...state, active: null, queue: [], paused: true, queueRunning: false, stopped: true, dialedRecordIds: response?.dialedRecordIds || [] }; render(); };
$('covered').onclick = async () => { await send('markCovered', { recordIds: state.dialedRecordIds }); state = { ...state, stopped: false, dialedRecordIds: [] }; render(); };
$('load').onclick = async () => { loading = true; render(); try { const response = await send('loadQueue'); if (response) state = response; } finally { loading = false; render(); } };
$('outcomes').innerHTML = outcomes.map(outcome => `<button data-outcome="${outcome}">${outcome}</button>`).join('');
document.querySelectorAll('[data-outcome]').forEach(button => button.onclick = () => send('disposition', { outcome: button.dataset.outcome, notes: $('notes').value }));
send('getState').then(result => { state = result; render(); });
