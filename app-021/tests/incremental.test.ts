import { describe, expect, it } from 'vitest'
import { generateMissingWeeks, generatePlan, regenerateFrom, regenerateSingleWeek } from '../src/lib/engine'
import { computeFairness, weekHardViolations } from '../src/lib/fairness'
import { defaultStudents, makeClass, randomClass } from './helpers'

// 增量生成（从某周起重排 / 补齐缺失周 / 只重生成某周）必须把已生成周次的
// 累计位置分、前排次数、同桌次数带进历史，排出来的结果要与一次生成整学期一致。

describe('增量生成 == 一次生成整学期', () => {
  it('补齐：先 10 周后补到 20 周，全部 20 周逐周一致（含已生成的前 10 周）', () => {
    const cls10 = makeClass({ rows: 5, cols: 8, weeks: 10, seed: 42 })
    cls10.assignments = generatePlan(cls10)
    const cls20 = { ...cls10, weeks: 20 }
    const full = generatePlan(cls20)
    const patched = generateMissingWeeks(cls20)
    expect(patched).toHaveLength(20)
    for (let w = 1; w <= 20; w++) expect(patched[w - 1].map).toEqual(full[w - 1].map)
  })

  it('不同总周数下，相同周次本身也一致（生成目标与 cls.weeks 无关）', () => {
    const a = generatePlan(makeClass({ rows: 5, cols: 8, weeks: 8, seed: 7 }))
    const b = generatePlan(makeClass({ rows: 5, cols: 8, weeks: 16, seed: 7 }))
    for (let w = 1; w <= 8; w++) expect(a[w - 1].map).toEqual(b[w - 1].map)
  })

  it('从第 N 周起重排（多个切点）：切点起逐周一致，切点前不变', () => {
    const cls = makeClass({ rows: 5, cols: 8, weeks: 20, seed: 42 })
    cls.assignments = generatePlan(cls)
    const snapshot = cls.assignments
    for (const cut of [1, 2, 7, 11, 20]) {
      const re = regenerateFrom(
        { ...cls, assignments: cls.assignments.map((a) => ({ ...a, map: { ...a.map }, score: { ...a.score } })) },
        cut,
      )
      for (let w = cut; w <= 20; w++) expect(re[w - 1].map).toEqual(snapshot[w - 1].map)
      for (let w = 1; w < cut; w++) expect(re[w - 1].map).toEqual(snapshot[w - 1].map)
    }
  })

  it('只重生成某一周（首/中/末）：结果与一次生成的同周一致', () => {
    const cls = makeClass({ rows: 5, cols: 8, weeks: 12, seed: 42 })
    cls.assignments = generatePlan(cls)
    for (const w of [1, 2, 6, 12]) {
      const single = regenerateSingleWeek(cls, w)
      expect(single.map).toEqual(cls.assignments[w - 1].map)
    }
  })

  it('含空位（30 人 / 40 座）补齐一致', () => {
    const cls = makeClass({ rows: 5, cols: 8, weeks: 6, seed: 9 })
    cls.students = defaultStudents(30)
    cls.assignments = generatePlan(cls)
    const full = generatePlan({ ...cls, weeks: 12 })
    const patched = generateMissingWeeks({ ...cls, weeks: 12 })
    for (let w = 1; w <= 12; w++) expect(patched[w - 1].map).toEqual(full[w - 1].map)
  })

  it('小组围坐模式补齐一致', () => {
    const cls = makeClass({ rows: 4, cols: 6, weeks: 6, seed: 3, mode: 'groups' })
    cls.assignments = generatePlan(cls)
    const full = generatePlan({ ...cls, weeks: 10 })
    const patched = generateMissingWeeks({ ...cls, weeks: 10 })
    for (let w = 1; w <= 10; w++) expect(patched[w - 1].map).toEqual(full[w - 1].map)
  })

  it('100 组随机复杂配置：从半程重排 == 一次生成，且硬约束为 0', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const cls = randomClass(seed)
      cls.assignments = generatePlan(cls)
      const full = cls.assignments
      const cut = 10
      const re = regenerateFrom(
        { ...cls, assignments: cls.assignments.map((a) => ({ ...a, map: { ...a.map }, score: { ...a.score } })) },
        cut,
      )
      for (let w = cut; w <= 20; w++) expect(re[w - 1].map).toEqual(full[w - 1].map)
      for (const asg of re) expect(weekHardViolations(cls, asg.week, asg.map)).toHaveLength(0)
    }
  })

  it('补齐后公平性报告与一次生成完全一致（含每人最高同桌次数）', () => {
    const cls = makeClass({ rows: 5, cols: 8, weeks: 10, seed: 42, frontRows: 3 })
    cls.assignments = generatePlan(cls)
    const fullCls = { ...cls, weeks: 20, assignments: generatePlan({ ...cls, weeks: 20 }) }
    const patchedCls = { ...cls, weeks: 20, assignments: generateMissingWeeks({ ...cls, weeks: 20 }) }
    const rf = computeFairness(fullCls)
    const rp = computeFairness(patchedCls)
    expect(rp.frontRowsRange).toBe(rf.frontRowsRange)
    expect(rp.variance).toBeCloseTo(rf.variance, 10)
    expect(rp.deskmateOverLimit).toEqual(rf.deskmateOverLimit)
    expect(rp.rows.map((r) => r.frontRowsCount)).toEqual(rf.rows.map((r) => r.frontRowsCount))
    expect(rp.rows.map((r) => r.totalScore)).toEqual(rf.rows.map((r) => r.totalScore))
    expect(rp.rows.map((r) => r.maxDeskmateRepeat)).toEqual(rf.rows.map((r) => r.maxDeskmateRepeat))
  })

  it('多次连续补齐（8→12→20）仍与一次生成一致', () => {
    const c8 = makeClass({ rows: 4, cols: 6, weeks: 8, seed: 13 })
    c8.assignments = generatePlan(c8)
    const c12 = { ...c8, weeks: 12 }
    c12.assignments = generateMissingWeeks(c12)
    const c20 = { ...c12, weeks: 20 }
    c20.assignments = generateMissingWeeks(c20)
    const full = generatePlan({ ...c8, weeks: 20 })
    expect(c20.assignments).toHaveLength(20)
    for (let w = 1; w <= 20; w++) expect(c20.assignments[w - 1].map).toEqual(full[w - 1].map)
  })
})
