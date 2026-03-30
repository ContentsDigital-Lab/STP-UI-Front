<template>
  <div class="role-grid">
    <div v-for="role in roles" :key="role.name" class="role-card" :style="{ '--accent': role.color }">
      <div class="role-name">{{ role.name }}</div>
      <div class="role-desc">{{ role.desc }}</div>
      <ul class="role-perms">
        <li v-for="perm in role.perms" :key="perm">{{ perm }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
defineProps({
  roles: { type: Array, required: true }
})
</script>

<style scoped>
.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
  margin: 1.25rem 0;
}
.role-card {
  padding: 1.15rem 1.25rem;
  background: var(--vp-c-bg-soft);
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  border-top: 3px solid var(--accent, #2956d4);
}
.role-name {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
  margin-bottom: 0.35rem;
}
.role-desc {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.6rem;
  line-height: 1.5;
}
.role-perms {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  line-height: 1.85;
}
</style>
