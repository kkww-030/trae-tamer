/**
 * trae-tamer · 三档分级
 *
 * 与 dsh-tamer 的关键差异（修正设计）：
 *   **不做自由文本关键词猜测**。dsh 版曾用 /fast|strict|standard/ 正则扫每条用户消息，
 *   导致「用 FastAPI 写接口」「fastboot 刷机」被静默切成快速档、来源校验随之关闭。
 *   这里档位只能通过两种显式方式改变：
 *     1. 模型调用 tamer_mode_set 工具（参数必须是合法档位或整句精确别名）；
 *     2. 用户在对话里明确说「严格模式」——由模型识别后**主动调工具**切换（模型语义判断，
 *        而不是脆弱的客户端正则）。
 *   普通句子里偶然出现 fast/strict/standard 字样绝不可能改变档位。
 */

export const MODES = ['fast', 'standard', 'strict']

/** 档位 → 一句话说明（注入规则、状态展示用）。 */
export const MODE_HINT = {
  fast: '快速：直接答，不强求多方案与来源明细',
  standard: '标准：澄清 + 1~2 方案 + 关键来源',
  strict: '严格：完整可行性 → ≥2 方案 → 来源链接 + 末尾来源集合 → 迭代',
}

/** 档位参数 → 规范值（只接受整串精确匹配，绝不做子串匹配）。 */
export const MODE_ALIAS = {
  fast: ['fast', '快速', '快速模式', '快'],
  standard: ['standard', '标准', '标准模式', '默认', '默认档'],
  strict: ['strict', '严格', '严格模式'],
}

/**
 * 把工具参数解析成档位：先枚举名，再整串精确匹配别名。
 * @param {string} value
 * @returns {'fast'|'standard'|'strict'|null}
 */
export function parseModeArg(value) {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (!v) return null
  if (MODES.includes(v)) return /** @type {any} */ (v)
  for (const [mode, aliases] of Object.entries(MODE_ALIAS)) {
    if (aliases.includes(v)) return /** @type {any} */ (mode)
  }
  return null
}

/** 归一化任意输入为合法档位，非法则返回 fallback。 */
export function normalizeMode(value, fallback = 'standard') {
  return MODES.includes(value) ? value : fallback
}

/** 档位说明，非法档位回落到标准档文案。 */
export function modeHint(mode) {
  return MODE_HINT[normalizeMode(mode)] ?? MODE_HINT.standard
}
