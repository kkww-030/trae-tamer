import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runPreflight, evaluateFinalize, sourced, saysNotFound, objectiveIn,
} from '../src/censor.js'

test('preflight：非客观任务只给轻提示', () => {
  const r = runPreflight({ objective: false })
  assert.equal(r.objective, false)
  assert.match(r.guidance, /非客观/)
})

test('preflight：客观任务给出检索-归档-finalize 四步指引；严格档含 ≥2 方案', () => {
  const r = runPreflight({ objective: true, mode: 'standard' })
  assert.equal(r.objective, true)
  assert.match(r.guidance, /tamer_archive/)
  assert.match(r.guidance, /tamer_finalize/)
  const strict = runPreflight({ objective: true, mode: 'strict' })
  assert.match(strict.guidance, /≥2/)
})

test('finalize：快速档始终 skip', () => {
  assert.equal(evaluateFinalize({ mode: 'fast', declaredObjective: true }).status, 'skip')
})

test('finalize：非客观任务 pass', () => {
  assert.equal(evaluateFinalize({ declaredObjective: false, replyText: '帮我重构这个函数' }).status, 'pass')
})

const objectiveBase = { declaredObjective: true }

test('finalize：已归档 → pass', () => {
  const v = evaluateFinalize({ ...objectiveBase, archivedCount: 2, replyText: '结论...' })
  assert.equal(v.status, 'pass')
  assert.equal(v.code, 'archived')
})

test('finalize：回复含链接/来源标注 → pass', () => {
  assert.equal(evaluateFinalize({ ...objectiveBase, replyText: '见 https://st.com/rm' }).status, 'pass')
  assert.equal(evaluateFinalize({ ...objectiveBase, replyText: '参考资料：数据手册' }).status, 'pass')
})

test('finalize：诚实声明查不到 → pass（修正 dsh 的设计缺陷）', () => {
  const v = evaluateFinalize({ ...objectiveBase, replyText: '该时序参数未找到可靠来源。' })
  assert.equal(v.status, 'pass')
  assert.equal(v.code, 'honest-not-found')
  assert.equal(evaluateFinalize({ ...objectiveBase, saidNotFound: true, replyText: '...' }).status, 'pass')
})

test('finalize：客观任务什么来源都没有 → warn 且给补救动作', () => {
  const v = evaluateFinalize({ ...objectiveBase, replyText: '这个芯片支持 3.3V 供电。' })
  assert.equal(v.status, 'warn')
  assert.equal(v.code, 'missing-sources')
  assert.ok(v.action && v.action.includes('信息来源'))
})

test('finalize：严格档回复正文兜底——声明非客观却在讲规格 → warn', () => {
  const v = evaluateFinalize({ declaredObjective: false, mode: 'strict', replyText: '根据该芯片数据手册的规格参数...' })
  assert.equal(v.status, 'warn')
  assert.equal(v.code, 'backstop-objective')
  // 标准档不做此兜底，信任声明
  assert.equal(
    evaluateFinalize({ declaredObjective: false, mode: 'standard', replyText: '规格如下' }).status,
    'pass',
  )
})

test('指示词边界', () => {
  assert.equal(sourced('http://x'), true)
  assert.equal(sourced(''), false)
  assert.equal(saysNotFound('我查了，未找到可靠来源'), true)
  assert.equal(objectiveIn('fastboot 刷机'), false)
  assert.equal(objectiveIn('查下 GPIO 配置'), true)
})
