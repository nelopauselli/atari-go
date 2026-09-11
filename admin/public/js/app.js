import { createApp, ref, onMounted } from 'vue';
import { route, navigate } from './router.js';
import { api } from './services/api.js';
import EntityListView from './views/EntityListView.js';

const App = {
  name: 'App',
  components: { EntityListView },
  setup() {
    const entities = ref([]);

    onMounted(async () => {
      entities.value = await api.getEntities();
      if (!route.entity && entities.value[0]) navigate(entities.value[0].key);
    });

    return { route, entities, navigate };
  },
  template: `
    <aside class="sidebar">
      <div class="sidebar__title">⚙️ Atari-Go Admin</div>
      <div
        v-for="e in entities"
        :key="e.key"
        class="sidebar__item"
        :class="{ 'sidebar__item--active': route.entity===e.key }"
        @click="navigate(e.key)"
      >{{ e.label }}</div>
    </aside>

    <EntityListView v-if="route.entity" :key="route.entity" :entity-key="route.entity" />
  `,
};

createApp(App).mount('#app');
