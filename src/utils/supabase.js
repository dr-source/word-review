import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client = null
let clientReady = false

if (supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey)
    clientReady = true
  } catch (e) {
    console.warn('Supabase 客户端初始化失败:', e)
  }
}

export const supabase = client
export const isSupabaseReady = clientReady

/** 个人学习进度 key（localStorage） */
const PROGRESS_KEY = 'word_personal_progress'

export function getPersonalProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') } catch { return {} }
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
