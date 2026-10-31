# AI驯服工具 · 队友徽标

状态栏徽标读取 `~/.trae-tamer/heartbeat.json`（由 trae-tamer MCP Server 每 5 秒写入），三态含义：

| 状态 | 含义 | 处理 |
|---|---|---|
| $(eye-closed) 队友离线（灰） | MCP 未连接或心跳过期 | 到 Trae「设置 → MCP」检查 trae-tamer 条目 |
| $(eye-watch) 队友·标准（绿） | MCP 在线，显示当前档位 | 正常工作 |
| $(eye-watch) 队友·严格 $(warning)（琥珀底） | 有未消除的来源警示 | 补齐「信息来源」/归档后重新 `tamer_finalize` |

完整文档见插件仓库 `trae-tamer/README.md`（安装步骤、工具说明、卸载方式）。

本扩展不联网、不执行命令、不读写其他文件，只读心跳 JSON。
