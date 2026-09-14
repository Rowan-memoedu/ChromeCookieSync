import {
  buildSnapshot,
  readCurrentProfile,
  safeReceipt,
  snapshotFilename
} from "./sync-core.js";

const syncButton = document.getElementById("sync");
const statusElement = document.getElementById("status");
const liveStatus = document.getElementById("live-status");
const toggle = document.getElementById("toggle-live");
const syncNow = document.getElementById("sync-now");
let liveEnabled = false;
function renderLive(state) {
  liveEnabled = state.enabled === true;
  toggle.textContent = liveEnabled ? "暂停持续同步" : "启用持续同步";
  syncNow.disabled = !liveEnabled;
  const status = state.syncStatus;
  liveStatus.textContent = !liveEnabled ? "持续同步已暂停；手动导出仍可使用。" : status?.state === "synchronized"
    ? `已同步 ${status.cookieCount} 条 Cookie；${new Date(status.at).toLocaleString()}。\n浏览器有变化时更新，并每分钟自动重试。`
    : `等待恢复连接，将自动重试。${status?.error ? `\n原因：${status.error}` : ""}`;
}
async function liveAction(message) {
  toggle.disabled = true; syncNow.disabled = true;
  try { renderLive(await chrome.runtime.sendMessage(message)); }
  catch { liveStatus.textContent = "无法连接同步扩展后台，请在 Chrome 扩展管理页重新加载。"; }
  finally { toggle.disabled = false; syncNow.disabled = !liveEnabled; }
}
toggle.addEventListener("click", () => { void liveAction({ type: "cookie-sync-enable", enabled: !liveEnabled }); });
syncNow.addEventListener("click", () => { void liveAction({ type: "cookie-sync-now" }); });
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && (changes.syncStatus || changes.enabled)) void liveAction({ type: "cookie-sync-status" }); });
void liveAction({ type: "cookie-sync-status" });

function downloadSnapshot(snapshot) {
  const text = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = snapshotFilename(snapshot);
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function failureMessage(error) {
  const code = String(error?.message || error || "");
  if (code.includes("permission")) return "同步失败：Chrome 未授予全部网站 Cookie 访问权限。";
  if (code.includes("download")) return "同步失败：Chrome 未能保存本地文件。";
  return "同步失败；没有生成新的 Cookie 文件。";
}

syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  statusElement.textContent = "正在读取并保存…";
  try {
    const { cookies, storeIds } = await readCurrentProfile(chrome.cookies);
    const snapshot = buildSnapshot(cookies, { storeIds });
    downloadSnapshot(snapshot);
    const receipt = safeReceipt(snapshot);
    statusElement.textContent = [
      "已保存到本机下载目录。",
      `总条数：${receipt.cookieCount}；域数：${receipt.domainCount}`,
      `会话：${receipt.sessionCount}；分区：${receipt.partitionedCount}`,
      "这是敏感凭据文件，请勿上传或提交。"
    ].join("\n");
  } catch (error) {
    statusElement.textContent = failureMessage(error);
  } finally {
    syncButton.disabled = false;
  }
});
