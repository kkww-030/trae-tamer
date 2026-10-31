---
name: tamer-teammate
description: AI驯服工具的「客观信息任务」工作流——硬件选型、芯片引脚/寄存器、标准规范、政策法规、行情价格、论文结论等需要可核验来源的任务。当任务涉及任何客观事实、需要查证资料或引用出处时加载。
---

# tamer-teammate · AI 队友的客观信息工作流

## 什么时候加载本技能

任务答案不能只靠模型记忆、必须建立在**可核验来源**上时，包括但不限于：

- 硬件：芯片引脚/寄存器/电气参数、数据手册、选型与替代料
- 标准规范：国标/行标、通信协议、API 规范
- 政策法规、合规要求
- 行情、价格、汇率、版本号/固件发布等时效性信息
- 论文结论、官方文档中的具体数字

纯闲聊、代码风格、重构建议等不涉及客观事实的任务，**不要**走本流程。

## 铁律

1. 动手检索前先调 `tamer_preflight`；发最终回复前必须过 `tamer_finalize`。
2. 只用官方或可靠来源：官方手册/官网/标准原文/权威论文 > 可靠二手转述；论坛帖、AI 生成内容、无出处的“业内常识”**不算来源**。
3. 查不到可靠来源时，明确写「未找到可靠来源」，绝不编造链接或数据——这会通过自检，编造不会。
4. 重要结论用 `tamer_archive` 留痕，格式与项目里 `tracing/archive.py` 一致。
5. 带 warn 收尾 = 任务没做完。

## 标准流程

```
1. 复述「目标 + 验收标准」，信息不清先澄清（必要时先问再动手）
2. tamer_preflight(objective=true, task="<一句话>")
3. WebSearch / WebFetch 取一手来源 → 正文就近标注（名称 + 链接）
4. 重要结论：tamer_archive(project, subject, source, link, note[, save_file])
5. 回复末尾整理「信息来源」清单（每条：名称 + 链接 + 对应结论）
   查不到的：单列「未找到可靠来源：<具体是哪条结论>」
6. tamer_finalize(reply_text=<即将发出的全文>)
   ├─ status=pass → 发送
   └─ status=warn → 按 action 补齐后重新 finalize，再发送
```

## 严格档附加要求

主人切到 strict（`tamer_mode_set(mode="strict")` 或明说「严格模式」）时：

- 先给完整可行性判断，再给 ≥2 个方案（含推荐项与代价）；
- 末尾必须有「信息来源」集合，多个来源冲突时并列并说明差异；
- 回复正文若涉及规格/数据手册等客观内容，即使 preflight 漏声明，finalize 也会兜底拦下。

## 示例

**输入**：「STM32F103C8 的 PA0 能容忍 5V 吗？」

1. `tamer_preflight({objective:true, task:"STM32F103 PA0 5V 容忍"})`
2. 检索 ST 官方数据手册（DS5319）的 GPIO 章节
3. `tamer_archive({project:"硬件项目", subject:"STM32F103 FT 引脚 5V 容忍",
   source:"ST RM0008 / DS5319", link:"https://www.st.com/...", note:"PA0 为 FT 引脚"})`
4. 回复给出结论（FT 引脚可 5V 耐受的条件），末尾：

   ```
   信息来源
   - [1] ST 官方数据手册 DS5319《STM32F103x8/xB》— https://www.st.com/resource/en/datasheet/stm32f103c8.pdf
         对应结论：PA0 属于 FT（5V 容忍）引脚及耐受条件
   ```
5. `tamer_finalize({reply_text:"<上面的完整回复>"})` → pass → 发送

## 与其他工具的边界

- 本技能只规定**怎么查证与交付**；检索用内置 WebSearch/WebFetch，不依赖特定 MCP。
- 长期偏好（如“优先本地网络方案”）用 `tamer_remember` 写入项目记忆库，不要每次重复声明。
- 徽标灰色表示 MCP 未连接：此时工具会调用失败，要在回复里提醒主人检查 MCP，而不是假装已归档。
