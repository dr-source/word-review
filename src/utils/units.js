/**
 * 按单元给词表分组。八上词本从 PDF 里带了 unit（1–8），
 * 没有 unit 的词本（中考 688 / 中考 2000）就统一落到最后一张「未分单元」表。
 */

export function unitLabel(unit) {
  const n = String(unit ?? '').trim()
  return n ? `Unit ${n}` : '未分单元'
}

/** rows → [{ key, label, unit, rows }]，单元号升序，未分单元的排最后 */
export function groupByUnit(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const unit = String(row?.unit ?? '').trim()
    const key = unit || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  }
  const groups = [...map.entries()]
    .map(([unit, list]) => ({
      key: unit || 'none',
      unit,
      label: unitLabel(unit),
      rows: list
    }))
    .sort((a, b) => {
      if (!a.unit) return 1
      if (!b.unit) return -1
      const na = Number(a.unit)
      const nb = Number(b.unit)
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
      if (Number.isFinite(na) && !Number.isFinite(nb)) return -1
      if (!Number.isFinite(na) && Number.isFinite(nb)) return 1
      return a.unit.localeCompare(b.unit, 'zh-CN')
    })
  return groups
}

/**
 * 单元切换：传 'all'（或空）看全部，传某组 key 只看那一组。
 * key 对不上（比如换了词本、任务重排后这个单元没词了）就退回全部，别给用户一张空表。
 */
export function pickUnitGroup(groups, key) {
  const list = groups || []
  if (!key || key === 'all') return list
  const hit = list.filter(g => g.key === key)
  return hit.length ? hit : list
}
