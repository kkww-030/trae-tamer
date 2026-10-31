# trae-tamer · AI驯服工具（Trae 插件）

> 把「AI驯服工具」做成 Trae 的 **AI 队友**：协议全局生效、三档显式切换、外部记忆库互通、
> 客观信息「开工自检 → 交付自检」、留痕归档，以及一个看得见队友是否在线的状态栏徽标。

- 事实源与 [dsh-tamer](../dsh-tamer) 同源（`core/协议注入模板.txt`）
- 零第三方依赖（MCP Server 与 VSIX 扩展只用 Node/VS Code 稳定 API）
- 40 个单元测试，含真实子进程 stdio 端到端验证

---

## 它由四块组成

| 部件 | 位置 | 作用 | 强度 |
|---|---|---|---|
| 全局规则 | `~/.trae-cn/user_rules/tamer-队友规则.md` | 协议 + 工具工作流，每场对话自动在场 | 提醒级 |
| 全局技能 | `<全局技能目录>/tamer-teammate/SKILL.md` | 客观信息任务的检索/归档/交付 SOP，AI 按需加载 | 引导级 |
| MCP Server | `src/mcp-server.mjs`（stdio） | 8 个工具：自检/留痕/记忆/档位/状态 | 执行级（工作流门禁） |
| 状态栏徽标 | VSIX 扩展 | 三态显示在线/档位/来源警示 | 可观测 |

### 8 个 MCP 工具

| 工具 | 何时调用 |
|---|---|
| `tamer_preflight` | **开工**：声明本轮是否涉及客观信息，拿到来源工作流指引 |
| `tamer_finalize` | **交付前**：校验来源合规；warn 必须补齐后重检，不许带 warn 收尾 |
| `tamer_archive` | 重要可靠结论归档到本项目 `留痕仓库/`（格式同 `tracing/archive.py`），可选复制原文 |
| `tamer_remember` / `tamer_forget` / `tamer_memory_list` | 管理本项目 `记忆库/约定.md`，跨会话生效 |
| `tamer_mode_set` | 显式切档 fast/standard/strict（仅主人明确要求时） |
| `tamer_status` | 查档位、开工声明、未消除警示、记忆库条数与路径 |

### 为什么是「自检」而不是 dsh 的「自动打回」

dsh-tamer 用关键词判定后自动 steer 重做，存在四个结构性问题：靠猜会误伤（FastAPI/fastboot
曾静默关掉校验）、全量重生成费 token、可能死循环、决策权不在主人。trae-tamer 改为
**预防 → 自检 → 人工确认**：

1. **预防**：规则始终在场；客观任务先 preflight，模型显式声明（语义判断，不用客户端正则猜）；
2. **自检**：finalize 在最终回复前给出 pass/warn，只多一步工具调用，不重跑整轮；
3. **人工确认**：warn 点亮状态栏琥珀色，主人可见、可一句话要求补来源——没有静默重生成。

两条刻意修正的判定：

- **「未找到可靠来源」= pass**：协议本就要求查不到就明说；dsh 会把这种诚实回答打回，是设计缺陷；
- **档位只能显式切换**：普通句子里出现 fast/strict 字样绝不可能换档（杜绝 dsh 的 FastAPI 事故）。

### 诚实边界（必须知道）

- 这是**工作流级约束，不是流量级拦截**：Trae 没有开放对话拦截/重写 API，规则/技能/MCP 都摸不到
  模型回复。真正的「硬拦截打回」只有马鞍网关路线（把模型端点指向 `saddle.py`）——见 `../saddle/`。
- 模型若完全不调用工具，插件无法强制（与 dsh 同属执行级以下）。徽标变灰/琥珀是给主人的信号。
- 全局技能目录官方文档在 `~/.trae/skills` 与 `~/.trae-cn/skills` 之间存在版本差异，安装器默认
  后者；若技能不出现，一行命令换到前者（见下）。

---

## 安装（一次性，约 3 分钟）

### 自动部分：跑安装器

```powershell
cd D:\AI驯服工具\trae-tamer
.\安装_全局.ps1
```

它会：跑 40 个测试 → 装全局规则 → 装全局技能 → 生成 MCP JSON → 打包 VSIX。
（只重打包不测试：`-SkipTests`；指定技能目录：`-SkillDir "$env:USERPROFILE\.trae\skills"`）

### 手动部分（Trae 未开放自动化接口，约 1 分钟）

1. **加 MCP**：Trae 设置 → MCP → 添加 → 手动添加，粘贴 `dist/mcp-config.json` 的内容：

   ```json
   {
     "mcpServers": {
       "trae-tamer": {
         "command": "node",
         "args": ["D:\\AI驯服工具\\trae-tamer\\src\\mcp-server.mjs"]
       }
     }
   }
   ```

   服务器直接跑仓库里的文件，没有复制安装，改完源码重启 MCP 即生效。
2. **装徽标**：扩展面板右上角「…」→ 从 VSIX 安装 → 选 `dist\trae-tamer-badge-0.1.0.vsix`。
3. **重启 Trae**。

### 验证（逐条）

| 检查 | 期望 |
|---|---|
| 状态栏 | 右侧出现 `队友·标准`（绿色眼形图标） |
| 工具 | 任意对话里 AI 能列出 8 个 `tamer_*` 工具；让它调 `tamer_status` 有中文回执 |
| 规则 | 新建一个**不相关文件夹**的项目，问客观问题时 AI 先调 `tamer_preflight` |
| 自检闭环 | 问「STM32F103 的 PA0 能 5V 吗」不给来源 → finalize warn（徽标琥珀）；补来源/归档后 pass（转绿） |
| 留痕 | `tamer_archive` 落盘到该项目 `留痕仓库/<project>/来源登记_*.md` |
| 记忆 | `tamer_remember "xxx"` 写入该项目 `记忆库/约定.md` |

徽标灰色 = MCP 没连上（检查 JSON 与 node 是否在 PATH）；点击徽标有排查提示。

### 项目根（root）说明

MCP 是全局一个进程，记忆库/留痕仓库按项目隔离。AI 在每个新项目**第一次**调工具时传
`root=<工作区根绝对路径>`，服务会记住；`tamer_status` 可核对路径是否属于当前项目。

---

## 卸载

```powershell
.\卸载_全局.ps1            # 删全局规则 + 两个候选技能目录
.\卸载_全局.ps1 -PurgeData # 再删 ~/.trae-tamer（每项目档位/心跳）
```

再手动移除：Trae 设置 → MCP 里的 trae-tamer 条目；扩展面板卸载徽标。
**项目里的 `记忆库/`、`留痕仓库/` 永远不会被卸载脚本删除。**

---

## 开发与自检

```powershell
npm test               # 40 个单元测试
node scripts/check.mjs # 语法/清单/漂移/交付物/测试 五项自检
.\scripts\pack-vsix.ps1 # 只重打 VSIX
```

改协议（唯一入口是 `../core/协议注入模板.txt`）后：

```powershell
node scripts/gen-protocol.mjs   # 更新 src/protocol.js
node scripts/gen-rules.mjs      # 更新 rules/tamer-队友规则.md
.\安装_全局.ps1 -SkipTests      # 重新装规则 + 重打 VSIX
```

### 目录

```
trae-tamer/
├── src/            # 零依赖运行时：mcp-server / censor / archive / memory / modes / state / paths / heartbeat
├── tests/          # node --test（40）
├── rules/          # 全局规则（生成产物，事实源 = core/协议注入模板.txt）
├── skills/tamer-teammate/SKILL.md
├── vscode-extension/  # 徽标扩展（打进 VSIX）
├── scripts/        # 生成器 / 自检 / VSIX 打包
├── 安装_全局.ps1 / 卸载_全局.ps1
└── dist/           # mcp-config.json + *.vsix（gitignore）
```

运行数据：`~/.trae-tamer/heartbeat.json`（徽标读）、`~/.trae-tamer/workspaces/*.json`（每项目档位/状态）。
