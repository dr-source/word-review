<template>
  <canvas v-if="active" ref="canvasRef" class="fireworks-canvas" aria-hidden="true"></canvas>
</template>

<script setup>
/**
 * 完成一天任务时的烟花特效：全屏 canvas、只有光效不挡点击，约 4 秒后自动收场。
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  active: { type: Boolean, default: false },
  duration: { type: Number, default: 4200 }
})

const COLORS = ['#4A6CF7', '#F59E0B', '#22C55E', '#EF4444', '#A855F7', '#06B6D4', '#F472B6']

const canvasRef = ref(null)
let raf = 0
let stopTimer = 0
let particles = []
let width = 0
let height = 0
let ctx = null
let lastBurst = 0
let elapsed = 0
let lastFrame = 0

function sizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ratio = window.devicePixelRatio || 1
  width = window.innerWidth
  height = window.innerHeight
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx = canvas.getContext('2d')
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
}

function burst(x, y) {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const count = 46 + Math.floor(Math.random() * 26)
  const speed = 2.2 + Math.random() * 2.6
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.12
    const v = speed * (0.55 + Math.random() * 0.75)
    particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 1,
      decay: 0.012 + Math.random() * 0.012,
      color: Math.random() < 0.28 ? '#FFFFFF' : color,
      radius: 1.4 + Math.random() * 1.8
    })
  }
}

function frame(now) {
  if (!ctx) return
  const delta = lastFrame ? Math.min(now - lastFrame, 48) : 16
  lastFrame = now
  elapsed += delta

  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'

  if (elapsed - lastBurst > 420 && elapsed < props.duration - 900) {
    lastBurst = elapsed
    burst(width * (0.18 + Math.random() * 0.64), height * (0.16 + Math.random() * 0.42))
  }

  for (const p of particles) {
    p.vy += 0.045 * (delta / 16)
    p.vx *= 0.985
    p.x += p.vx * (delta / 16)
    p.y += p.vy * (delta / 16)
    p.life -= p.decay * (delta / 16)
    if (p.life <= 0) continue
    ctx.globalAlpha = Math.max(0, p.life)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  particles = particles.filter(p => p.life > 0)

  raf = requestAnimationFrame(frame)
}

function start() {
  stop()
  nextTick(() => {
    if (!props.active) return
    sizeCanvas()
    particles = []
    elapsed = 0
    lastBurst = -1000
    lastFrame = 0
    // 开场先来两发，用户立刻看到东西
    burst(width * 0.3, height * 0.32)
    burst(width * 0.7, height * 0.26)
    raf = requestAnimationFrame(frame)
    stopTimer = window.setTimeout(stop, Math.max(600, props.duration))
  })
}

function stop() {
  if (raf) cancelAnimationFrame(raf)
  if (stopTimer) clearTimeout(stopTimer)
  raf = 0
  stopTimer = 0
  particles = []
  elapsed = 0
  lastFrame = 0
  if (ctx) ctx.clearRect(0, 0, width, height)
}

watch(() => props.active, (on) => { if (on) start(); else stop() })
onMounted(() => {
  window.addEventListener('resize', sizeCanvas)
  if (props.active) start()
})
onUnmounted(() => {
  window.removeEventListener('resize', sizeCanvas)
  stop()
})
</script>

<style scoped>
.fireworks-canvas {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 3000;
}
</style>
