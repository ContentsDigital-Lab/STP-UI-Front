import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import type { Theme } from 'vitepress'
import HeroName from './HeroName.vue'
import Steps from './Steps.vue'
import Flow from './Flow.vue'
import Card from './Card.vue'
import RoleTable from './RoleTable.vue'
import StatusTable from './StatusTable.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-info-before': () => h(HeroName),
    })
  },
  enhanceApp({ app }) {
    app.component('Steps', Steps)
    app.component('Flow', Flow)
    app.component('Card', Card)
    app.component('RoleTable', RoleTable)
    app.component('StatusTable', StatusTable)
  },
} satisfies Theme
