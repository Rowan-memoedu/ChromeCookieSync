# Chrome Cookie 本地凭据快照合同 v1

本页的下载位置与文件名描述适用于手动导出。1.1.0 的持续同步沿用同一 JSON 合同，通过本机接收方更新固定凭据文件，详见 README；不通过下载目录轮询。

## 文件与位置

- 默认位置：Chrome 当前配置的下载目录；若 Chrome 启用了“下载前询问保存位置”，由 Chrome 显示保存对话框。
- 文件名：`chrome-cookie-snapshot-v1-<UTC ISO 时间>-<完整 snapshotId>.json`。
- `snapshotId` 每次生成，文件名不会主动覆盖旧快照；若外部产生极端同名冲突，Chrome 下载器仍会采用自己的防覆盖重命名规则。
- 文件包含真实 Cookie 名称和值，是本地敏感凭据文件。

## 根对象

```json
{
  "schema": "local.chrome-cookie-snapshot",
  "schemaVersion": 1,
  "sensitivity": "local_sensitive_credential",
  "snapshotId": "<UUID>",
  "generatedAt": "<UTC ISO-8601>",
  "producer": {
    "name": "chrome-cookie-sync-extension",
    "version": "1.0.0",
    "api": "chrome.cookies.getAll",
    "partitionQuery": "all_partition_keys"
  },
  "profile": {
    "browser": "Google Chrome",
    "scope": "current_regular_profile",
    "storeIds": ["0"]
  },
  "cookies": []
}
```

Chrome Cookie API 不暴露当前 Profile 的人类名称或磁盘路径，因此 v1 只声明真实可核验的普通 Profile 范围和 API 返回的 `storeId`，不猜测名称。

## Cookie 条目

每一条必须显式包含：

- `name: string`
- `value: string`
- `domain: string`
- `hostOnly: boolean`
- `path: string`
- `secure: boolean`
- `httpOnly: boolean`
- `sameSite: no_restriction | lax | strict | unspecified`
- `session: boolean`
- `expirationDate: number | null`；会话 Cookie 固定为 `null`
- `storeId: string`
- `partitionKey: null | object`；对象保留 `topLevelSite` 与 `hasCrossSiteAncestor`（若 Chrome 返回）

v1 不生成 Netscape `cookies.txt`，因为该格式不能无损表达 SameSite、storeId 与完整分区键。

## 消费者读取

Node.js 消费者可直接导入只读解析器：

```js
import { readFile } from "node:fs/promises";
import { parseSnapshot } from "./lib/snapshot-reader.mjs";

const snapshot = parseSnapshot(await readFile(snapshotPath, "utf8"));
```

只做安全汇总验证时运行：

```powershell
npm run check-snapshot -- "C:\absolute\path\to\snapshot.json"
```

该命令不打印 Cookie 名称、值或域列表。任何后续消费者必须先按 `schema + schemaVersion` 分派，再使用 `domain/hostOnly/path/secure/expirationDate/partitionKey` 实现自己的请求匹配；不得把整份 Cookie 无条件发送给任意站点。
