import { createLiveSync, SYNC_ALARM } from "./live-sync.js";

const sync = createLiveSync(chrome);
chrome.cookies.onChanged.addListener(() => sync.changed());
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === SYNC_ALARM) void sync.sync(); });
chrome.runtime.onStartup.addListener(() => { void sync.start(); });
chrome.runtime.onInstalled.addListener(() => { void sync.start(); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  let operation;
  if (message?.type === "cookie-sync-status") operation = sync.settings();
  else if (message?.type === "cookie-sync-enable") operation = sync.setEnabled(message.enabled === true);
  else if (message?.type === "cookie-sync-now") operation = sync.sync().then(sync.settings);
  else return false;
  operation.then(respond, () => respond({ error: "cookie_sync_worker_unavailable" }));
  return true;
});
// Recreate a lost alarm whenever Chrome wakes this worker; settings survive termination.
void sync.start();
