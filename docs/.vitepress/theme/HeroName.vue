<template>
  <h1 class="custom-hero-name">
    <span class="std">Standard</span> <span class="plus">Plus</span>
  </h1>
</template>

<style scoped>
.custom-hero-name {
  font-size: 48px;
  font-weight: 700;
  line-height: 1.2;
}
.std {
  color: #2956d4;
}
.plus {
  color: #e8550a;
}

@media (min-width: 640px) {
  .custom-hero-name {
    font-size: 56px;
  }
}
@media (min-width: 960px) {
  .custom-hero-name {
    font-size: 64px;
  }
}
</style>
