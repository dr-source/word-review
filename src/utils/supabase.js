import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase 未配置，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

/** 个人学习进度 key（localStorage） */
const PROGRESS_KEY = 'word_personal_progress'

export function getPersonalProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')
  } catch { return {} }
}

export function savePersonalProgress(wordId, data) {
  const progress = getPersonalProgress()
  progress[wordId] = { ...(progress[wordId] || {}), ...data }
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
}

export function removePersonalProgress(wordId) {
  const progress = getPersonalProgress()
  delete progress[wordId]
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
}
