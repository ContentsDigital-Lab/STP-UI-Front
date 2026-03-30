<template>
  <div class="flow-wrapper">
    <div v-for="(item, i) in items" :key="i" class="flow-item">
      <div class="flow-box">
        <span class="flow-num">{{ i + 1 }}</span>
        <span class="flow-label">{{ item.label }}</span>
      </div>
      <svg v-if="i < items.length - 1" class="flow-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    required: true
  }
})
</script>

<style scoped>
.flow-wrapper {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 1.25rem 0;
  padding: 1.25rem;
  background: var(--vp-c-bg-soft);
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
}
.flow-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.flow-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  transition: border-color 0.2s;
}
.flow-box:hover {
  border-color: var(--vp-c-brand-1);
}
.flow-num {
  width: 1.4rem;
  height: 1.4rem;
  background: var(--vp-c-brand-1);
  color: #fff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}
.flow-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}
.flow-arrow {
  color: var(--vp-c-text-3);
  flex-shrink: 0;
  opacity: 0.4;
}
</style>
