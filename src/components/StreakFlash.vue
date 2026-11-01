<template>
  <div class="streak-flash-slot">
    <transition name="streak">
      <div v-if="label" class="streak-flash">
        <span class="streak-spark">✨</span>
        <span class="streak-label">{{ label }}</span>
        <span class="streak-count">{{ count }} 连对！</span>
      </div>
    </transition>
  </div>
</template>

<script setup>
// 连对激励的一条闪光条：选择、完形共用同一份样式与动画
defineProps({
  label: { type: String, default: '' },
  count: { type: Number, default: 0 }
})
</script>

<style scoped>
.streak-flash-slot { min-height: 0; }
.streak-flash {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 14px;
  border-radius: 9999px;
  background: linear-gradient(90deg, #FFFBEB, #FEF3C7);
  border: 1px solid #FCD34D;
  box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5);
  animation: streak-glow 1.1s ease-out infinite;
  height: 40px;
}
.streak-spark { font-size: 16px; animation: streak-twinkle 0.9s ease-in-out infinite; }
.streak-label { font-size: 17px; font-weight: 800; color: #D97706; letter-spacing: 0.5px; }
.streak-count { font-size: 13px; color: #B45309; }
@keyframes streak-glow {
  0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.55); }
  70% { box-shadow: 0 0 0 12px rgba(245, 158, 11, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}
@keyframes streak-twinkle {
  0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
  50% { transform: scale(1.35) rotate(18deg); opacity: 0.75; }
}
.streak-enter-active { transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); }
/* 离场时停掉无限循环的光晕动画，否则 Vue 会把动画时长当成离场时长，淡出拖到 1.1 秒 */
.streak-leave-active { transition: all 0.2s ease-in; animation: none; }
.streak-enter-from { opacity: 0; transform: scale(0.7); }
.streak-leave-to { opacity: 0; transform: scale(0.9); }
</style>
