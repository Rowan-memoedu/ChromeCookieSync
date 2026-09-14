# Chrome Cookie Sync

Chrome 官方 Cookie API 的本地凭据同步工具。当前活动源码迁自工作区中的 `04 Projects/Chrome Cookie Sync`；旧目录只保留历史取证用途。

手动导出继续独立运行。自动同步使用渐进阅读的本机凭据接口，保持浏览器中的更新、过期与退出一致。真实凭据只进入专用应用数据目录，不进入源码、日志或 Git。

## 使用

在 Chrome 的扩展管理页加载 `D:\Projects\ChromeCookieSync\extension`，打开“Chrome Cookie 本地同步”，点“启用持续同步”。当前普通 Profile 的 HTTP/HTTPS Cookie 会使用浏览器官方 API 读取；没有写入网站 Cookie、content script 或网页抓取操作。

- Cookie 变动合并约 1.5 秒后推送；每分钟补同步，连接失败后自动重试。
- 服务接收方固定为 `http://127.0.0.1:37829`。先检查合同兼容性，再传输；重定向和非环回接收方被拒绝。
- 扩展 ID 固定为 `kkhdelnhoaagpbmgicmdljmplodkioop`，由 manifest 的公开公钥确定。公钥不含私钥或任何用户凭据。
- 接收方把版本化 JSON 原子写入 `D:\AppData\ProgressiveReading\BrowserAuth\chrome-current.json`，目录仅当前用户和 SYSTEM 可访问。每个 Cookie 按目标网站匹配；不会把全量 Cookie 发给任意网页。
- 开关和脱敏状态保存到 Chrome storage，Cookie 不保存到扩展 storage。暂停后不再同步；接收方超过 15 分钟未收到更新会标记失联。Chrome 中失效的登录需要按网站要求重新登录。
- 不开启自动模式时，手动导出仍可使用，保存到 Chrome 下载目录。

权限沿用 `cookies`、HTTP/HTTPS 网站权限，新增 `storage` 和 `alarms`；未添加 debugger、nativeMessaging 或浏览器管理权限。只同步当前普通 Profile，不承诺跨 Profile 或无痕窗口统一。

## 证据和边界

`npm test`：9 项合成测试，包括 Cookie 属性、显式启停、离线恢复、后台唤醒恢复闹钟、退出清除、同步期间变化与隐私保护。

配套服务真实 HTTP 合成验收：`D:\Artifacts\ProgressiveReading\web-import\fixture-gs6rMc\cookie-live-acceptance.json`。它使用本项目同步核心，核验受保护网页导入与正式文件哈希、服务新进程恢复、退出及热更新，不读取真实 Chrome Cookie。

2026-09-14 当前真实 Chrome 自动化入口报 `nodeRepl.fetch request failed`，尚未加载此版本或启用持续同步；上述合成验收不能替代实际网站登录与知乎专栏 Canary。

旧 `DIAGNOSIS.md` 和 `SNAPSHOT-CONTRACT.md` 保留历史合同。v1 JSON 字段不变；自动模式新增持久接收方，手动下载依然可独立使用。工作区旧目录未删除或覆盖，不再作为新版本开发根。

依据：[Chrome Cookie API](https://developer.chrome.com/docs/extensions/reference/api/cookies)、[Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)。
