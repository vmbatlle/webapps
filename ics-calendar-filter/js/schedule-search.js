/**
 * Schedule Search Dialog — queries a backend proxy (server/app.py locally, or a
 * deployed Cloudflare Worker in production) which replicates the SIA/PDS
 * "Consulta Pública de Horarios" flow to fetch an ICS directly, instead of
 * requiring a manual download from the external site.
 */

const API_BASE_STORAGE_KEY = 'scheduleApiBase';

function getApiBase() {
  return (localStorage.getItem(API_BASE_STORAGE_KEY) || '').replace(/\/+$/, '');
}

function setApiBase(value) {
  localStorage.setItem(API_BASE_STORAGE_KEY, value.trim().replace(/\/+$/, ''));
}

function apiUrl(path) {
  const base = getApiBase();
  // No base configured means same-origin (e.g. local dev server serving both).
  return base ? `${base}${path}` : path;
}

let searchConfigLoaded = false;

function openSearchDialog() {
  document.getElementById('search-dialog').showModal();
  document.getElementById('search-api-base').value = getApiBase();
  showSearchError('');
  if (!searchConfigLoaded) {
    initSearchDialog();
  }
}

function saveApiBaseAndRetry() {
  setApiBase(document.getElementById('search-api-base').value);
  searchConfigLoaded = false;
  initSearchDialog();
}

function showSearchError(message) {
  const el = document.getElementById('search-error');
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
  } else {
    el.classList.remove('hidden');
    el.textContent = message;
  }
}

function setSelectOptions(selectEl, options) {
  selectEl.innerHTML = '';
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    if (opt.selected) el.selected = true;
    selectEl.appendChild(el);
  });
}

function setCheckboxOptions(containerEl, options, namePrefix) {
  containerEl.innerHTML = '';
  options.forEach(opt => {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-2 hover:bg-gray-50 rounded px-1 py-0.5 cursor-pointer';
    label.innerHTML = `<input type="checkbox" data-${namePrefix} value="${opt.value}" checked class="rounded text-indigo-600"> <span>${opt.label}</span>`;
    containerEl.appendChild(label);
  });
}

function getCheckedValues(containerEl, dataAttr) {
  return Array.from(containerEl.querySelectorAll(`input[data-${dataAttr}]:checked`)).map(cb => cb.value);
}

async function initSearchDialog() {
  try {
    const configRes = await fetch(apiUrl('/api/config'));
    if (!configRes.ok) throw new Error('status ' + configRes.status);
    const config = await configRes.json();
    setSelectOptions(document.getElementById('search-anio'), config.anios);
    searchConfigLoaded = true;

    document.getElementById('search-anio').onchange = () => refreshScheduleOptions();
    document.getElementById('search-plan').onchange = () => refreshScheduleOptions({ keepPlan: true });
    document.getElementById('search-curso').onchange = () => refreshScheduleOptions({ keepPlan: true, keepCurso: true });
    document.getElementById('search-trimestre').onchange = () => refreshScheduleOptions({ keepPlan: true, keepCurso: true, keepTrimestre: true });

    await refreshScheduleOptions();
  } catch (err) {
    showSearchError('No se pudo conectar con el backend en "' + (getApiBase() || '(mismo origen)') + '". Comprueba la URL del Worker/servidor abajo y guarda de nuevo.');
  }
}

async function refreshScheduleOptions(opts = {}) {
  const anio = document.getElementById('search-anio').value;
  const planSel = document.getElementById('search-plan');
  const cursoSel = document.getElementById('search-curso');
  const trimestreSel = document.getElementById('search-trimestre');

  const params = new URLSearchParams({ anio, centro: '110' });
  if (opts.keepPlan && planSel.value) params.set('plan', planSel.value);
  if (opts.keepCurso && cursoSel.value) params.set('curso', cursoSel.value);
  if (opts.keepTrimestre && trimestreSel.value) params.set('trimestre', trimestreSel.value);

  showSearchError('');
  try {
    const res = await fetch(apiUrl(`/api/opciones?${params.toString()}`));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al consultar las opciones');

    setSelectOptions(planSel, data.planes);
    setSelectOptions(cursoSel, data.cursos);
    setSelectOptions(trimestreSel, data.trimestres);
    setCheckboxOptions(document.getElementById('search-asignaturas'), data.asignaturas, 'asignatura');
    setCheckboxOptions(document.getElementById('search-grupos'), data.grupos, 'grupo');
  } catch (err) {
    showSearchError(err.message);
  }
}

async function submitScheduleSearch() {
  const btn = document.getElementById('search-submit-btn');
  const label = document.getElementById('search-submit-label');
  const asignaturas = getCheckedValues(document.getElementById('search-asignaturas'), 'asignatura');
  const grupos = getCheckedValues(document.getElementById('search-grupos'), 'grupo');

  if (asignaturas.length === 0 || grupos.length === 0) {
    showSearchError('Selecciona al menos una asignatura y un grupo.');
    return;
  }

  showSearchError('');
  btn.disabled = true;
  label.textContent = 'Cargando...';

  try {
    const res = await fetch(apiUrl('/api/horario'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anio: document.getElementById('search-anio').value,
        centro: '110',
        plan: document.getElementById('search-plan').value,
        curso: document.getElementById('search-curso').value,
        trimestre: document.getElementById('search-trimestre').value,
        asignaturas,
        grupos
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo obtener el horario');
    }

    const icsText = await res.text();
    parseICSContent(icsText);
    document.getElementById('search-dialog').close();
  } catch (err) {
    showSearchError(err.message);
  } finally {
    btn.disabled = false;
    label.textContent = 'Cargar horario';
  }
}
