<template>
  <div class="info-card" :class="variant">
    <div class="card-content">
      <div class="card-title" v-if="title">{{ title }}</div>
      <div class="card-body"><slot /></div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: String,
  variant: {
    type: String,
    default: 'default'
  }
})
</script>

<style scoped>
.info-card {
  padding: 1rem 1.25rem;
  margin: 0.5rem 0;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  border-left: 3px solid var(--vp-c-divider);
  transition: border-color 0.2s;
}
.info-card:hover {
  border-color: var(--vp-c-brand-1);
  border-left-color: var(--vp-c-brand-1);
}
.info-card.blue { border-left-color: #2956d4; }
.info-card.orange { border-left-color: #e8550a; }
.info-card.green { border-left-color: #16a34a; }
.info-card.red { border-left-color: #dc2626; }
.card-title {
  font-weight: 650;
  font-size: 0.9rem;
  margin-bottom: 0.3rem;
  color: var(--vp-c-text-1);
}
.card-body {
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
  line-height: 1.65;
}
.card-body :deep(p) { margin: 0; }
.card-body :deep(ul) { margin: 0.25rem 0 0; padding-left: 1.1rem; }
.card-body :deep(li) { margin: 0.15rem 0; }
</style>
