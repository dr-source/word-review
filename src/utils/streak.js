/** 连对激励：3 题起给称号，9 题及以上 Perfect */
export const STREAK_TIERS = [
  { at: 3, label: 'Good' },
  { at: 4, label: 'Great' },
  { at: 5, label: 'Brilliant' },
  { at: 6, label: 'Wonderful' },
  { at: 7, label: 'Fantastic' },
  { at: 8, label: 'Excellent' },
  { at: 9, label: 'Perfect' }
]

/** 当前连对数对应的档位；不够 3 连对返回 null */
export function streakTier(count) {
  const n = Number(count) || 0
  let hit = null
  for (const tier of STREAK_TIERS) {
    if (n >= tier.at) hit = tier
  }
  return hit
}

export function streakLabel(count) {
  const tier = streakTier(count)
  return tier ? tier.label : ''
}
