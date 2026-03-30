<template>
  <div class="steps-container">
    <slot />
  </div>
</template>

<style scoped>
.steps-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1.5rem 0;
}
.steps-container :deep(.step) {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.15rem 1.25rem;
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  transition: border-color 0.25s, box-shadow 0.25s;
}
.steps-container :deep(.step:hover) {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 12px rgba(41, 86, 212, 0.06);
}
.steps-container :deep(.step::before) {
  content: attr(data-step);
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  background: var(--vp-c-brand-1);
  color: #fff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  margin-top: 1px;
}
.steps-container :deep(.step h4) {
  margin: 0 0 0.3rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.steps-container :deep(.step p) {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.88rem;
  line-height: 1.6;
}
</style>
