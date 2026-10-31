/**
 * trae-tamer · 三级校验的核心判定（预防 → 自检 → 人工确认）
 *
 * 与 dsh-tamer「自动打回」路线的本质区别：
 *   - 不拦截、不重生成：模型在**发出最终回复之前**自己调 tamer_finalize，
 *     得到 pass 才收尾；得到 warn 就先补来源/补归档再回复；
 *   - 客观信息由模型在 tamer_preflight 里**显式声明**（语义判断），
 *     不再靠脆弱的客户端正则去猜用户每句话（dsh 的 FastAPI/fastboot 误切档根因）；
 *   - 「查不到可靠来源」是协议允许的诚实结果，判定为 **pass**（dsh 会把它打回，属于设计缺陷）；
 *   - warn 会写进状态、点亮状态栏徽标（琥珀色），最终是否放行由主人决定——没有静默死循环。
 *
 * 本文件全是纯函数，方便单测；状态持久化在 state.js / mcp-server.mjs。
 */

/** 命中即认为回复在讲客观事实（仅严格档做回复正文兜底扫描用）。 */
export const DEFAULT_OBJECTIVE_WORDS = [
  '引脚', 'datasheet', '数据手册', '规格书', '规格', '参数', '标准', '规范',
  '政策', '法规', '行情', '价格', '股价', '论文', 'paper', 'GPIO', '寄存器',
  '官方', '汇率', '固件', '版本号', '说明文档', 'spec',
]

/** 回复里出现这些字样，视为已给出处线索。 */
export const DEFAULT_SOURCE_INDICATORS = [
  '信息来源', '来源：', '来源:', '参考来源', '参考文献', '参考链接', '参考资料',
  '出处', '引用来源', 'http://', 'https://', 'www.', '[1]',
]

/** 明确表达「查不到」的诚实声明——协议要求如此，判合规。 */
export const NOT_FOUND_INDICATORS = [
  '未找到可靠来源',
  '没有找到可靠来源',
  '未能找到可靠来源',
  '查不到可靠来源',
  '暂无可靠来源',
  '未找到官方来源',
  'no reliable source found',
]

export function objectiveIn(text, words = DEFAULT_OBJECTIVE_WORDS) {
  if (typeof text !== 'string' || !text) return false
  const low = text.toLowerCase()
  return words.some((w) => low.includes(String(w).toLowerCase()))
}

export function sourced(text, indicators = DEFAULT_SOURCE_INDICATORS) {
  if (typeof text !== 'string' || !text) return false
  const low = text.toLowerCase()
  return indicators.some((k) => low.includes(String(k).toLowerCase()))
}

export function saysNotFound(text, indicators = NOT_FOUND_INDICATORS) {
  if (typeof text !== 'string' || !text) return false
  const low = text.toLowerCase()
  return indicators.some((k) => low.includes(k.toLowerCase()))
}

/**
 * 开工自检（L1/L2 之间）。模型在接到任务时调用，声明本轮是否涉及客观信息。
 * @returns {{objective: boolean, guidance: string}}
 */
export function runPreflight({ objective = false, task = '', mode = 'standard' } = {}) {
  const declared = objective === true
  if (!declared) {
    return {
      objective: false,
      guidance: '本轮按非客观信息任务处理：正常完成即可。若中途发现其实涉及客观事实（硬件/标准/政策/行情/论文等），请补调一次 tamer_preflight(objective=true)。',
    }
  }
  const strict = mode === 'strict'
  return {
    objective: true,
    guidance: [
      '本轮涉及客观信息，按协议执行：',
      '1. 只用官方/可靠来源（优先 WebSearch/WebFetch 取一手资料）；',
      '2. 正文结论就近标注来源；',
      '3. 重要结论用 tamer_archive 归档到留痕仓库；',
      '4. 发出最终回复前必须调用 tamer_finalize 自检；',
      strict
        ? '5. 当前为严格档：需要 ≥2 个方案与末尾「信息来源」清单。'
        : '5. 查不到可靠来源时，明确写「未找到可靠来源」，不要编造或用相近内容顶替。',
    ].join('\n'),
  }
}

/**
 * 交付自检。
 * @param {object} input
 * @param {boolean} input.declaredObjective - preflight 声明
 * @param {number}   input.archivedCount    - 本轮已归档条数（tamer_archive 调用计数）
 * @param {string}   [input.replyText]      - 即将发出的回复全文（可选）
 * @param {boolean}  [input.saidNotFound]   - 模型显式声明已写明「未找到可靠来源」
 * @param {'fast'|'standard'|'strict'} input.mode
 * @returns {{status:'skip'|'pass'|'warn', code: string, reason: string, action?: string}}
 */
export function evaluateFinalize(input) {
  const {
    declaredObjective = false,
    archivedCount = 0,
    replyText = '',
    saidNotFound = false,
    mode = 'standard',
  } = input

  if (mode === 'fast') {
    return { status: 'skip', code: 'fast-mode', reason: '快速档不做来源自检' }
  }

  // 严格档兜底：模型声明「非客观」，但回复正文明显在讲规格/数据手册等——
  // 只在严格档启用（标准档完全信任声明，避免「参数」类误伤）。
  const backstopHit = mode === 'strict' && !declaredObjective && objectiveIn(replyText)
  const objective = declaredObjective === true || backstopHit

  if (!objective) {
    return { status: 'pass', code: 'non-objective', reason: '非客观信息任务，无需来源清单' }
  }

  if (backstopHit) {
    return {
      status: 'warn',
      code: 'backstop-objective',
      reason: 'preflight 声明为非客观任务，但回复正文涉及客观信息关键词（规格/数据手册/标准等）',
      action: '请补调 tamer_preflight(objective=true)，检索可靠来源、在回复末尾列「信息来源」后重新 finalize；若确认不涉及，请在回复中说明依据。',
    }
  }

  if (archivedCount > 0) {
    return { status: 'pass', code: 'archived', reason: `本轮已归档 ${archivedCount} 条来源` }
  }
  if (sourced(replyText)) {
    return { status: 'pass', code: 'sources-in-reply', reason: '回复中已包含来源链接或出处标注' }
  }
  if (saidNotFound === true || saysNotFound(replyText)) {
    return { status: 'pass', code: 'honest-not-found', reason: '已诚实声明未找到可靠来源（协议允许）' }
  }

  return {
    status: 'warn',
    code: 'missing-sources',
    reason: '本轮涉及客观信息，但未见归档、回复中也没有来源链接或「未找到可靠来源」声明',
    action: '在发出最终回复前：①用可靠来源核实并在末尾列「信息来源」清单，重要结论调 tamer_archive 归档；或②明确写「未找到可靠来源」。补齐后重新调用 tamer_finalize。',
  }
}
