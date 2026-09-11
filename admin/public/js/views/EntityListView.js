import { ref, reactive, watch, onMounted } from 'vue';
import { api } from '../services/api.js';

function refLabel(value) {
  if (!value) return '-';
  if (typeof value === 'object') return value.name || value.nickname || value._id;
  return value;
}

function formatValue(field, row) {
  const value = row[field.name];
  if (value === null || value === undefined || value === '') return '-';
  if (field.type === 'ref') return refLabel(value);
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'date') return new Date(value).toLocaleString();
  return value;
}

function emptyForm(fields) {
  const form = {};
  for (const field of fields) {
    if (field.readonly) continue;
    form[field.name] = field.type === 'boolean' ? false : '';
  }
  return form;
}

export default {
  name: 'EntityListView',
  props: { entityKey: { type: String, required: true } },
  setup(props) {
    const meta = ref(null);
    const rows = ref([]);
    const refOptions = reactive({});
    const showForm = ref(false);
    const editingId = ref(null);
    const form = ref({});
    const error = ref('');
    const loading = ref(false);

    async function load() {
      loading.value = true;
      error.value = '';
      try {
        meta.value = await api.getMeta(props.entityKey);
        rows.value = await api.getList(props.entityKey);
        for (const field of meta.value.fields) {
          if (field.type === 'ref' && !refOptions[field.name]) {
            const options = await api.getList(field.ref);
            refOptions[field.name] = options.map((o) => ({ id: o._id, label: o.name || o.nickname || o._id }));
          }
        }
      } catch (err) {
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    }

    watch(() => props.entityKey, load);
    onMounted(load);

    function openCreate() {
      editingId.value = null;
      form.value = emptyForm(meta.value.fields);
      error.value = '';
      showForm.value = true;
    }

    function openEdit(row) {
      editingId.value = row._id;
      const values = emptyForm(meta.value.fields);
      for (const key of Object.keys(values)) {
        const field = meta.value.fields.find((f) => f.name === key);
        const raw = row[key];
        values[key] = field.type === 'ref' ? (raw && raw._id ? raw._id : raw) : raw ?? (field.type === 'boolean' ? false : '');
      }
      form.value = values;
      error.value = '';
      showForm.value = true;
    }

    async function save() {
      error.value = '';
      try {
        if (editingId.value) {
          await api.update(props.entityKey, editingId.value, form.value);
        } else {
          await api.create(props.entityKey, form.value);
        }
        showForm.value = false;
        await load();
      } catch (err) {
        error.value = err.message;
      }
    }

    async function remove(row) {
      if (!window.confirm('¿Eliminar este registro?')) return;
      try {
        await api.remove(props.entityKey, row._id);
        await load();
      } catch (err) {
        error.value = err.message;
      }
    }

    return {
      meta, rows, refOptions, showForm, editingId, form, error, loading,
      formatValue, openCreate, openEdit, save, remove,
    };
  },
  template: `
    <main v-if="meta">
      <div class="toolbar">
        <h2>{{ meta.label }}</h2>
        <button v-if="!meta.readonly" class="btn" @click="openCreate">+ Nuevo</button>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>

      <div class="card" v-if="!loading && rows.length===0">
        <div class="empty-state">Sin registros todavía.</div>
      </div>

      <div class="card" v-else>
        <table>
          <thead>
            <tr>
              <th v-for="f in meta.fields" :key="f.name">{{ f.label }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row._id">
              <td v-for="f in meta.fields" :key="f.name">{{ formatValue(f, row) }}</td>
              <td class="actions">
                <button v-if="!meta.readonly" class="btn btn--outline btn--sm" @click="openEdit(row)">Editar</button>
                <button class="btn btn--danger btn--sm" @click="remove(row)">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="showForm" class="modal-backdrop" @click.self="showForm=false">
        <div class="modal">
          <h2>{{ editingId ? 'Editar' : 'Nuevo' }} — {{ meta.label }}</h2>
          <p v-if="error" class="error-text">{{ error }}</p>

          <template v-for="f in meta.fields" :key="f.name">
            <div class="field" v-if="!f.readonly">
              <label>{{ f.label }}</label>

              <select v-if="f.type==='ref'" v-model="form[f.name]">
                <option value="" disabled>Seleccionar...</option>
                <option v-for="opt in (refOptions[f.name]||[])" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
              </select>

              <select v-else-if="f.type==='enum'" v-model="form[f.name]">
                <option value="" disabled>Seleccionar...</option>
                <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>

              <input v-else-if="f.type==='boolean'" type="checkbox" v-model="form[f.name]" />
              <input v-else-if="f.type==='number'" type="number" v-model.number="form[f.name]" />
              <input v-else-if="f.type==='color'" type="color" v-model="form[f.name]" />
              <input v-else type="text" v-model="form[f.name]" />
            </div>
          </template>

          <div class="toolbar">
            <button class="btn btn--outline" @click="showForm=false">Cancelar</button>
            <button class="btn" @click="save">Guardar</button>
          </div>
        </div>
      </div>
    </main>
  `,
};
