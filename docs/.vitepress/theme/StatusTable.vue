<template>
  <div class="status-grid">
    <div v-for="s in statuses" :key="s.label" class="status-item">
      <div class="status-dot" :style="{ background: s.color }"></div>
      <div class="status-info">
        <div class="status-label">{{ s.label }}</div>
        <div class="status-desc">{{ s.desc }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  statuses: {
    type: Array,
    required: true
  }
})
</script>

<style scoped>
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.6rem;
  margin: 1.5rem 0;
}
.status-item {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  background: var(--vp-c-bg-soft);
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  transition: border-color 0.2s;
}
.status-item:hover {
  border-color: var(--vp-c-brand-1);
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.status-label {
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--vp-c-text-1);
}
.status-desc {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  margin-top: 0.1rem;
  line-height: 1.4;
}
</style>
