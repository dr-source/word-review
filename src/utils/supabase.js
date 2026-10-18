import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client = null
let clientReady = false

const isPlaceholder = (value) => !value || /your-project|your-anon-key|example/i.test(value)

if (supabaseUrl && supabaseAnonKey && !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseAnonKey)) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey)
    clientReady = true
  } catch (e) {
    console.warn('Supabase 客户端初始化失败:', e)
  }
}

export const supabase = client
export const isSupabaseReady = clientReady

