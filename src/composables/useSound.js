/**
 * 答题音效：用 Web Audio 现场合成，不依赖任何音频文件，也不占体积。
 * 静音开关记在学生设置里（settings.sound）。
 */
import { getSettings, saveSettings } from '../utils/profile'

const BASE = 523.25 // C5

let ctx = null

function audioCtx() {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  try {
    if (!ctx) ctx = new Ctor()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

/** 没有真实点击（比如自测脚本 el.click()）时不发声，避免 Autoplay 警告刷屏 */
function allowed() {
  try {
    if (getSettings().sound === false) return false
    const activation = navigator.userActivation
    if (activation && activation.hasBeenActive === false) return false
    return true
  } catch {
    return false
  }
}

function semitone(n) {
  return BASE * Math.pow(2, n / 12)
}

/** 顺序播放一串半音偏移，例如 [0, 4, 7] 就是大三和弦往上走 */
function playSequence(steps, { gap = 0.09, dur = 0.2, type = 'triangle', gain = 0.11 } = {}) {
  const ac = audioCtx()
  if (!ac) return
  const t0 = ac.currentTime + 0.01
  steps.forEach((n, i) => {
    const start = t0 + i * gap
    const osc = ac.createOscillator()
    const amp = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(semitone(n), start)
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.linearRampToValueAtTime(gain, start + 0.015)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(amp).connect(ac.destination)
    osc.start(start)
    osc.stop(start + dur + 0.03)
  })
}

/** 答对：连对越多音高越高，第 8 连对之后不再升，免得越来越尖 */
export function playCorrect(step = 0) {
  if (!allowed()) return
  const lift = Math.min(Math.max(Number(step) || 0, 0), 7)
  playSequence([0 + lift, 4 + lift, 7 + lift], { gap: 0.07, dur: 0.22, gain: 0.1 })
  playSequence([12 + lift], { gap: 0, dur: 0.3, type: 'sine', gain: 0.05 })
}

/** 答错：往下掉的两个音，短促不刺耳 */
export function playWrong() {
  if (!allowed()) return
  playSequence([7, 3], { gap: 0.11, dur: 0.24, type: 'sawtooth', gain: 0.06 })
}

/** 连对档位音效：Good 三连音，Perfect 一路冲到高八度 */
export function playStreak(tierIndex = 0) {
  if (!allowed()) return
  const index = Math.max(0, Math.min(Number(tierIndex) || 0, 6))
  const ladders = [
    [0, 4, 7],
    [0, 4, 7, 12],
    [0, 2, 4, 7, 12],
    [0, 4, 7, 12, 16],
    [0, 4, 7, 12, 16, 19],
    [0, 4, 7, 12, 16, 19, 24],
    [0, 2, 4, 7, 9, 12, 16, 19, 24]
  ]
  playSequence(ladders[index], { gap: 0.06, dur: 0.26, type: 'triangle', gain: 0.09 })
  playSequence([24, 31], { gap: 0.08, dur: 0.34, type: 'sine', gain: 0.05 })
}

/** 完成一天任务 / 交卷：上行琶音当烟花的声音 */
export function playFinish() {
  if (!allowed()) return
  playSequence([0, 4, 7, 12, 16, 19, 24], { gap: 0.08, dur: 0.32, type: 'triangle', gain: 0.1 })
  playSequence([12, 19, 26], { gap: 0.12, dur: 0.5, type: 'sine', gain: 0.05 })
}

export function isSoundOn() {
  try {
    return getSettings().sound !== false
  } catch {
    return true
  }
}

export function setSoundOn(on) {
  try {
    saveSettings({ sound: !!on })
  } catch { /* 存不进去也不影响播放 */ }
  return isSoundOn()
}

export function useSound() {
  return { playCorrect, playWrong, playStreak, playFinish, isSoundOn, setSoundOn }
}
