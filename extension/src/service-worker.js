import { apiRequest, getConfig } from './api-client.js';

let active = null;
let queue = [];
let paused = false;
let bulkMode = false;
let finishing = false;
let stoppedRecordIds = new Set();
const ports = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function broadcast(message) { ports.forEach(port => port.postMessage(message)); }

chrome.runtime.onConnect.addListener(port => { ports.add(port); port.onDisconnect.addListener(() => ports.delete(port)); port.onMessage.addListener(handleMessage); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { handleMessage(message).then(sendResponse).catch(error => sendResponse({ error: error.message })); return true; });
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function loadQueue() { const config = await getConfig(); if (!config.profileId || !config.phoneFieldKey) throw new Error('Set a CRM profile and phone field in extension options.'); queue = await apiRequest(`/profiles/${config.profileId}/extension/queue?phoneFieldKey=${encodeURIComponent(config.phoneFieldKey)}&limit=100`); broadcast({ type: 'state', queue, active, paused }); return queue; }
async function handleMessage(message) {
  if (message.type === 'getState') return { queue, active, paused, queueRunning: bulkMode, stoppedRecordIds: [...stoppedRecordIds] };
  if (message.type === 'loadQueue') return { queue: await loadQueue(), active, paused };
  if (message.type === 'pause' || message.type === 'resume') { paused = message.type === 'pause' ? true : false; broadcast({ type: 'state', queue, active, paused, queueRunning: bulkMode }); return { paused }; }
  if (message.type === 'stop') {
    const config = await getConfig();
    const dialedRecordIds = [...stoppedRecordIds, ...(active ? [active.id] : [])];
    if (active?.session?.id) await apiRequest(`/profiles/${config.profileId}/extension/sessions/${active.session.id}/abort`, { method: 'POST', body: JSON.stringify({ reason: 'Bulk dialing stopped by user' }) }).catch(() => {});
    queue = []; paused = true; bulkMode = false; active = null;
    broadcast({ type: 'state', queue, active, paused, queueRunning: false, stopped: true, dialedRecordIds });
    return { stopped: true, dialedRecordIds };
  }
  if (message.type === 'markCovered') { const config = await getConfig(); const recordIds = [...new Set([...(stoppedRecordIds || []), ...(message.recordIds || [])])]; const result = await apiRequest(`/profiles/${config.profileId}/extension/queue/covered`, { method: 'POST', body: JSON.stringify({ recordIds }) }); stoppedRecordIds = new Set(); return result; }
  if (message.type === 'callNext') return callNext();
  if (message.type === 'bulkDial') { paused = false; bulkMode = true; if (!queue.length) await loadQueue(); broadcast({ type: 'state', queue, active, paused, queueRunning: true }); return callNext(); }
  if (message.type === 'hangup') { return sendToVoice({ type: 'hangup' }); }
  if (message.type === 'hangupHotkey') { if (!active || finishing) return { ok: true }; active = { ...active, ended: true }; broadcast({ type: 'state', queue, active, paused, queueRunning: bulkMode }); if (bulkMode) return finishDisposition('No Answer', 'Ended with B hotkey'); return { ok: true }; }
  if (message.type === 'disposition') return finishDisposition(message.outcome, message.notes);
  if (message.type === 'voiceEvent') { if (active?.session?.id) await apiRequest(`/profiles/${active.profileId}/extension/sessions/${active.session.id}/events`, { method: 'POST', body: JSON.stringify({ event: message.event, metadata: message.metadata || {} }) }); if ((message.event === 'hangup' || message.event === 'failed') && active && !finishing) { active = { ...active, ended: true }; broadcast({ type: 'state', queue, active, paused, queueRunning: bulkMode }); if (bulkMode) return finishDisposition(message.event === 'failed' ? 'Skipped' : 'No Answer', message.metadata?.message || 'Automatic bulk disposition'); } return { ok: true }; }
  return { error: 'Unknown extension command' };
}
async function getVoiceTab() { const tabs = await chrome.tabs.query({ url: 'https://voice.google.com/*' }); if (!tabs.length) throw new Error('Open Google Voice in a Chrome tab first.'); return tabs.find(tab => tab.active) || tabs[0]; }
async function sendToVoice(message) { const tab = await getVoiceTab(); try { const response = await chrome.tabs.sendMessage(tab.id, message); if (response?.error) throw new Error(response.error); return response; } catch (error) { if (error.message?.includes('Receiving end does not exist')) throw new Error('Google Voice extension script is not loaded. Reload the Google Voice tab after reloading the extension.'); throw error; } }
async function callNext() {
  if (paused || active) throw new Error(active ? 'A call is already active.' : 'Queue is paused.');
  if (!queue.length) await loadQueue();
  const next = queue.shift(); if (!next) throw new Error('The queue is empty.');
  const config = await getConfig(); const idempotencyKey = crypto.randomUUID(); const claim = await apiRequest(`/profiles/${config.profileId}/extension/queue/claim`, { method: 'POST', body: JSON.stringify({ recordId: next.id, phoneFieldKey: config.phoneFieldKey, idempotencyKey }) });
  const session = await apiRequest(`/profiles/${config.profileId}/extension/sessions`, { method: 'POST', body: JSON.stringify({ recordId: next.id, phoneFieldKey: config.phoneFieldKey, phoneNumber: claim.phoneNumber, idempotencyKey }) });
  stoppedRecordIds.add(next.id);
  active = { ...next, profileId: config.profileId, session, bulk: bulkMode }; broadcast({ type: 'state', queue, active, paused, queueRunning: bulkMode });
  try { await sendToVoice({ type: 'dial', phoneNumber: claim.phoneNumber, sessionId: session.id }); } catch (error) { await apiRequest(`/profiles/${config.profileId}/extension/sessions/${session.id}/abort`, { method: 'POST', body: JSON.stringify({ reason: error.message }) }).catch(() => {}); active = null; broadcast({ type: 'state', queue, active, paused }); throw error; }
  return active;
}
async function finishDisposition(outcome, notes) { if (!active || finishing) return { duplicate: true }; finishing = true; try { const result = await apiRequest(`/profiles/${active.profileId}/extension/sessions/${active.session.id}/disposition`, { method: 'POST', body: JSON.stringify({ outcome, notes }) }); active = null; broadcast({ type: 'state', queue, active, paused, queueRunning: bulkMode && Boolean(queue.length) }); if (bulkMode && !paused && queue.length) await callNext(); return result; } finally { finishing = false; } }
