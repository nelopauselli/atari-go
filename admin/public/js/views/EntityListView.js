import { ref, reactive, computed, watch, onMounted } from 'vue';
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
  if (field.type === 'list') return value.length ? value.join(', ') : '-';
  return value;
}

const IMAGE_MAX_SIZE = 128;

// Lee un archivo de imagen y lo reduce (manteniendo proporción) para guardarlo como data URL liviana.
function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, IMAGE_MAX_SIZE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

function emptyForm(fields) {
  const form = {};
  for (const field of fields) {
    if (field.readonly) continue;
    if (field.default !== undefined) form[field.name] = field.default;
    else form[field.name] = field.type === 'boolean' ? false : '';
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

    // Los campos password no se listan (el backend nunca los devuelve).
    const listFields = computed(() => (meta.value ? meta.value.fields.filter((f) => f.type !== 'password') : []));

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
        if (field.type === 'ref') values[key] = raw && raw._id ? raw._id : raw ?? '';
        else if (field.type === 'list') values[key] = (raw || []).join('\n');
        else if (field.type === 'password') values[key] = '';
        else values[key] = raw ?? (field.type === 'boolean' ? false : '');
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

    async function onImageSelected(field, event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        form.value[field.name] = await readImageAsDataUrl(file);
      } catch (err) {
        error.value = err.message;
      }
      event.target.value = '';
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
      meta, listFields, rows, refOptions, showForm, editingId, form, error, loading,
      formatValue, openCreate, openEdit, save, remove, onImageSelected,
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
        <div class="empty-state">Sin registros todav&iacute;a.</div>
      </div>

      <div class="card" v-else>
        <table>
          <thead>
            <tr>
              <th v-for="f in listFields" :key="f.name">{{ f.label }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row._id">
              <td v-for="f in listFields" :key="f.name">
                <img v-if="f.type==='image' && row[f.name]" :src="row[f.name]" class="thumb" alt="" />
                <template v-else>{{ formatValue(f, row) }}</template>
              </td>
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
                <option value="" :disabled="f.required">{{ f.required ? 'Seleccionar...' : '(ninguna)' }}</option>
                <option v-for="opt in (refOptions[f.name]||[])" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
              </select>

              <select v-else-if="f.type==='enum'" v-model="form[f.name]">
                <option value="" disabled>Seleccionar...</option>
                <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>

              <input v-else-if="f.type==='boolean'" type="checkbox" v-model="form[f.name]" />
              <input v-else-if="f.type==='number'" type="number" v-model.number="form[f.name]" />
              <input v-else-if="f.type==='color'" type="color" v-model="form[f.name]" />
              <input v-else-if="f.type==='password'" type="password" autocomplete="new-password" v-model="form[f.name]"
                :placeholder="editingId ? 'Dejar vacío para conservar la actual' : ''" />
              <textarea v-else-if="f.type==='list'" rows="6" v-model="form[f.name]" placeholder="Uno por línea"></textarea>
              <div v-else-if="f.type==='image'" class="image-field">
                <img v-if="form[f.name]" :src="form[f.name]" class="thumb thumb--lg" alt="" />
                <input type="file" accept="image/*" @change="onImageSelected(f, $event)" />
                <button v-if="form[f.name]" type="button" class="btn btn--outline btn--sm" @click="form[f.name]=''">Quitar</button>
              </div>
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
