import { ref, reactive, computed, watch, onMounted } from 'vue';
import { api } from '../services/api.js';

function refLabel(value) {
  if (!value) return '-';
  if (typeof value === 'object') return value.name || value.nickname || value._id;
  return value;
}

// Campos con `showIf` ({ campo: valor }) solo aplican cuando el registro cumple esa condición.
function isApplicable(field, values) {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([key, expected]) => values[key] === expected);
}

function formatValue(field, row) {
  const value = row[field.name];
  if (value === null || value === undefined || value === '' || !isApplicable(field, row)) return '-';
  if (field.type === 'ref') return refLabel(value);
  if (field.type === 'refs') return value.length ? value.map(refLabel).join(', ') : '-';
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'date') return new Date(value).toLocaleString();
  if (field.type === 'list') return value.length ? value.join(', ') : '-';
  if (field.type === 'items') return value.length ? value.map((item) => item.name).join(', ') : '-';
  return value;
}

function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const COLOR_LABELS = { black: 'Negras', white: 'Blancas' };
const STATUS_LABELS = { finished: 'Terminada', aborted: 'Abortada' };
const REASON_LABELS = {
  capture: 'Captura', resign: 'Abandono', timeout: 'Tiempo', abandoned: 'Desconexión', 'no-moves': 'Sin jugadas',
};

// Fecha en hora local, en un formato que las planillas reconocen como fecha.
function csvDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// CSV con ';' (lo que espera Excel en configuración regional en español) y BOM para que respete los acentos.
function matchesToCsv(room, players) {
  const institutionOf = new Map((players || []).map((p) => [p._id, p.institution || '']));
  const header = [
    'Sala', 'Tablero', 'Tamaño', 'Piedras para ganar', 'Reloj', 'Regla de Ko', 'Estado',
    'Negras', 'Institución negras', 'Equipo negras', 'Blancas', 'Institución blancas', 'Equipo blancas',
    'Ganador', 'Jugador ganador', 'Institución ganador', 'Equipo ganador', 'Motivo',
    'Capturadas por negras', 'Capturadas por blancas', 'Jugadas', 'Inicio', 'Fin',
  ];
  const lines = [header];
  for (const m of room.matches) {
    const byColor = Object.fromEntries((m.players || []).map((p) => [p.color, p]));
    const black = byColor.black || {};
    const white = byColor.white || {};
    const winnerColor = m.result && m.result.winnerColor;
    const winner = winnerColor ? byColor[winnerColor] || {} : {};
    lines.push([
      room.name, m.boardNumber, m.boardSize, m.stonesToWin, m.clockType, m.koRuleEnabled ? 'Sí' : 'No',
      STATUS_LABELS[m.status] || m.status,
      black.nickname, institutionOf.get(black.player), black.teamName,
      white.nickname, institutionOf.get(white.player), white.teamName,
      COLOR_LABELS[winnerColor] || '', winner.nickname, institutionOf.get(winner.player), winner.teamName,
      REASON_LABELS[m.result && m.result.reason] || (m.result && m.result.reason) || '',
      m.capturedByBlack, m.capturedByWhite, (m.moves || []).length, csvDate(m.startedAt), csvDate(m.endedAt),
    ]);
  }
  return `﻿${lines.map((cols) => cols.map(csvCell).join(';')).join('\r\n')}\r\n`;
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
    else if (field.type === 'refs' || field.type === 'items') form[field.name] = [];
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
    const notice = ref('');
    const loading = ref(false);

    async function load() {
      loading.value = true;
      error.value = '';
      notice.value = '';
      try {
        meta.value = await api.getMeta(props.entityKey);
        rows.value = await api.getList(props.entityKey);
        for (const field of meta.value.fields) {
          if ((field.type === 'ref' || field.type === 'refs') && !refOptions[field.name]) {
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
        else if (field.type === 'refs') values[key] = (raw || []).map((v) => (v && v._id ? v._id : v));
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

    // `target` es el objeto que recibe la imagen: el form o un ítem de un campo `items`.
    async function onImageSelected(field, event, target = form.value) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        target[field.name] = await readImageAsDataUrl(file);
      } catch (err) {
        error.value = err.message;
      }
      event.target.value = '';
    }

    function addItem(field) {
      const item = {};
      for (const sub of field.fields) item[sub.name] = '';
      form.value[field.name].push(item);
    }

    function removeItem(field, index) {
      form.value[field.name].splice(index, 1);
    }

    // Sin `row` exporta toda la entidad; con `row`, solo ese registro.
    async function exportJson(row) {
      error.value = '';
      try {
        const data = row ? await api.exportOne(props.entityKey, row._id) : await api.exportAll(props.entityKey);
        const slug = row ? `-${String(row.name || row._id).replace(/[\\/:*?"<>|\s]+/g, '_')}` : '';
        download(JSON.stringify(data, null, 2), 'application/json',
          `${props.entityKey}${slug}-${new Date().toISOString().slice(0, 10)}.json`);
      } catch (err) {
        error.value = err.message;
      }
    }

    // Historial de partidas (terminadas/abortadas) de una sala, en CSV separado por ';'.
    async function exportMatchesCsv(row) {
      error.value = '';
      try {
        const data = await api.exportOne(props.entityKey, row._id);
        const room = data.items[0];
        const slug = String(row.name || row._id).replace(/[\\/:*?"<>|\s]+/g, '_');
        download(matchesToCsv(room, data.players), 'text/csv;charset=utf-8',
          `partidas-${slug}-${new Date().toISOString().slice(0, 10)}.csv`);
      } catch (err) {
        error.value = err.message;
      }
    }

    async function importJson(event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      error.value = '';
      try {
        let payload;
        try {
          payload = JSON.parse(await file.text());
        } catch {
          throw new Error('El archivo no es un JSON válido');
        }
        const result = await api.importAll(props.entityKey, payload);
        await load();
        notice.value = `Importación: ${result.created} creados, ${result.updated} actualizados`
          + (result.matches !== undefined ? `, ${result.matches} partidas.` : '.');
        if (result.errors.length) error.value = `Errores: ${result.errors.join(' · ')}`;
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
      meta, listFields, rows, refOptions, showForm, editingId, form, error, notice, loading,
      exportJson, exportMatchesCsv, importJson, formatValue, isApplicable, openCreate, openEdit, save, remove, onImageSelected, addItem, removeItem,
    };
  },
  template: `
    <main v-if="meta">
      <div class="toolbar">
        <h2>{{ meta.label }}</h2>
        <div class="toolbar-actions">
          <template v-if="meta.exportable">
            <button v-if="meta.exportScope==='all'" class="btn btn--outline" @click="exportJson()">Exportar JSON</button>
            <label class="btn btn--outline file-btn">
              Importar JSON
              <input type="file" accept="application/json,.json" @change="importJson" />
            </label>
          </template>
          <button v-if="!meta.readonly" class="btn" @click="openCreate">+ Nuevo</button>
        </div>
      </div>

      <p v-if="notice" class="notice-text">{{ notice }}</p>
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
                <button v-if="meta.exportScope==='item'" class="btn btn--outline btn--sm" @click="exportJson(row)">Exportar</button>
                <button v-if="entityKey==='rooms'" class="btn btn--outline btn--sm" @click="exportMatchesCsv(row)">Partidas CSV</button>
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
            <div class="field" v-if="!f.readonly && isApplicable(f, form)">
              <label>{{ f.label }}</label>

              <select v-if="f.type==='ref'" v-model="form[f.name]">
                <option value="" :disabled="f.required">{{ f.required ? 'Seleccionar...' : '(ninguna)' }}</option>
                <option v-for="opt in (refOptions[f.name]||[])" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
              </select>

              <div v-else-if="f.type==='refs'" class="checkbox-list">
                <label v-for="opt in (refOptions[f.name]||[])" :key="opt.id">
                  <input type="checkbox" :value="opt.id" v-model="form[f.name]" /> {{ opt.label }}
                </label>
                <span v-if="!(refOptions[f.name]||[]).length" class="muted">Sin opciones cargadas</span>
              </div>

              <div v-else-if="f.type==='items'" class="items-field">
                <div v-for="(item, i) in form[f.name]" :key="item._id || i" class="item-row">
                  <template v-for="sub in f.fields" :key="sub.name">
                    <div v-if="sub.type==='image'" class="image-field">
                      <img v-if="item[sub.name]" :src="item[sub.name]" class="thumb" alt="" />
                      <label class="btn btn--outline btn--sm file-btn">
                        {{ item[sub.name] ? 'Cambiar' : sub.label }}
                        <input type="file" accept="image/*" @change="onImageSelected(sub, $event, item)" />
                      </label>
                      <button v-if="item[sub.name]" type="button" class="btn btn--outline btn--sm" @click="item[sub.name]=''">Quitar</button>
                    </div>
                    <input v-else type="text" v-model="item[sub.name]" :placeholder="sub.label" />
                  </template>
                  <button type="button" class="btn btn--danger btn--sm" @click="removeItem(f, i)">&times;</button>
                </div>
                <span v-if="!form[f.name].length" class="muted">Sin {{ f.label.toLowerCase() }} todav&iacute;a</span>
                <div><button type="button" class="btn btn--outline btn--sm" @click="addItem(f)">+ Agregar {{ f.itemLabel || 'ítem' }}</button></div>
              </div>

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
