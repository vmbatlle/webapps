/**
 * Schedule Search Dialog — queries a Cloudflare Worker backend which replicates the SIA/PDS
 * "Consulta Pública de Horarios" flow to fetch an ICS directly, instead of
 * requiring a manual download from the external site.
 */

const API_BASE = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  ? 'http://localhost:8787'
  : 'https://api.vmbatlle.com';

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

let searchConfigLoaded = false;

function openSearchDialog() {
  document.getElementById('search-dialog').showModal();
  showSearchError('');
  renderSelectedSubjects();
  if (!searchConfigLoaded) {
    initSearchDialog();
  }
}

let searchMode = 'asignatura';

function setSearchMode(mode) {
  searchMode = mode;
  const isPlan = mode === 'plan';
  document.getElementById('search-panel-plan').classList.toggle('hidden', !isPlan);
  document.getElementById('search-panel-asignatura').classList.toggle('hidden', isPlan);
  const active = ['bg-indigo-600', 'text-white'];
  const inactive = ['bg-white', 'text-indigo-600'];
  const planBtn = document.getElementById('search-mode-plan');
  const asigBtn = document.getElementById('search-mode-asignatura');
  planBtn.classList.remove(...(isPlan ? inactive : active));
  planBtn.classList.add(...(isPlan ? active : inactive));
  asigBtn.classList.remove(...(isPlan ? active : inactive));
  asigBtn.classList.add(...(isPlan ? inactive : active));
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

function normalizeSearchText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function setCheckboxOptions(containerEl, options, namePrefix) {
  containerEl.innerHTML = '';
  options.forEach(opt => {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-2 hover:bg-gray-50 rounded px-1 py-0.5 cursor-pointer';
    label.dataset.search = normalizeSearchText(`${opt.value} ${opt.label}`);
    label.innerHTML = `<input type="checkbox" data-${namePrefix} value="${opt.value}" checked class="rounded text-indigo-600"> <span>${opt.label}</span>`;
    containerEl.appendChild(label);
  });
}

function filterAsignaturas() {
  const term = normalizeSearchText(document.getElementById('search-asignaturas-filter').value.trim());
  document.querySelectorAll('#search-asignaturas label').forEach(label => {
    label.classList.toggle('hidden', !!term && !label.dataset.search.includes(term));
  });
}

function getCheckedValues(containerEl, dataAttr) {
  return Array.from(containerEl.querySelectorAll(`input[data-${dataAttr}]:checked`)).map(cb => cb.value);
}

async function initSearchDialog() {
  try {
    const currentYear = new Date().getFullYear();
    const configRes = await fetch(apiUrl(`/api/config?year=${currentYear}`));
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
    showSearchError('No se pudo conectar con el backend. Comprueba que el servicio está disponible e inténtalo de nuevo.');
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
    document.getElementById('search-asignaturas-filter').value = '';
    setCheckboxOptions(document.getElementById('search-asignaturas'), data.asignaturas, 'asignatura');
    setCheckboxOptions(document.getElementById('search-grupos'), data.grupos, 'grupo');
  } catch (err) {
    showSearchError(err.message);
  }
}

const selectedSubjects = [];
let asignaturaQueryTimer = null;
let asignaturaQuerySeq = 0;

function onAsignaturaQueryInput() {
  clearTimeout(asignaturaQueryTimer);
  asignaturaQueryTimer = setTimeout(runAsignaturaSearch, 300);
}

async function runAsignaturaSearch() {
  const resultsEl = document.getElementById('search-asignatura-results');
  const query = document.getElementById('search-asignatura-query').value.trim();
  const anio = document.getElementById('search-anio').value;
  if (query.length < 2) {
    resultsEl.classList.add('hidden');
    return;
  }
  if (!anio) {
    showSearchError('Todavía no se ha cargado la configuración. Inténtalo de nuevo en unos segundos.');
    return;
  }

  const seq = ++asignaturaQuerySeq;
  showSearchError('');
  try {
    const params = new URLSearchParams({ anio, q: query, limit: '20' });
    const res = await fetch(apiUrl(`/api/buscar-asignaturas?${params}`));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al buscar asignaturas');
    if (seq !== asignaturaQuerySeq) return;
    renderAsignaturaResults(data);
  } catch (err) {
    if (seq === asignaturaQuerySeq) showSearchError(err.message);
  }
}

function renderAsignaturaResults({ total, asignaturas }) {
  const resultsEl = document.getElementById('search-asignatura-results');
  resultsEl.innerHTML = '';
  resultsEl.classList.remove('hidden');

  if (asignaturas.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'px-3 py-2 text-gray-500';
    empty.textContent = 'Sin resultados';
    resultsEl.appendChild(empty);
    return;
  }

  asignaturas.forEach(subject => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'block w-full text-left px-3 py-1.5 hover:bg-indigo-50';
    btn.textContent = subject.label.startsWith(subject.value) ? subject.label : `${subject.value} - ${subject.label}`;
    btn.onclick = () => addAsignatura(subject);
    resultsEl.appendChild(btn);
  });

  if (total > asignaturas.length) {
    const more = document.createElement('div');
    more.className = 'px-3 py-1.5 text-xs text-gray-400';
    more.textContent = `Mostrando ${asignaturas.length} de ${total}. Afina la búsqueda para ver más.`;
    resultsEl.appendChild(more);
  }
}

async function addAsignatura(subject) {
  if (selectedSubjects.some(s => s.value === subject.value)) return;
  const anio = document.getElementById('search-anio').value;
  showSearchError('');
  try {
    const params = new URLSearchParams({ anio, asignatura: subject.value });
    const res = await fetch(apiUrl(`/api/asignatura-detalle?${params}`));
    const detail = await res.json();
    if (!res.ok) throw new Error(detail.error || 'No se pudo consultar la asignatura');
    selectedSubjects.push({
      value: subject.value,
      label: subject.label,
      detail,
      periodo: detail.periodos[0]?.value ?? '',
      grupo: detail.grupos[0]?.value ?? ''
    });
    document.getElementById('search-asignatura-query').value = '';
    document.getElementById('search-asignatura-results').classList.add('hidden');
    renderSelectedSubjects();
  } catch (err) {
    showSearchError(err.message);
  }
}

function renderSelectedSubjects() {
  const container = document.getElementById('search-asignatura-selected');
  container.innerHTML = '';
  if (selectedSubjects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-gray-400';
    empty.textContent = 'Aún no has añadido ninguna asignatura.';
    container.appendChild(empty);
    return;
  }

  selectedSubjects.forEach((subject, index) => {
    const row = document.createElement('div');
    row.className = 'border border-gray-200 rounded-lg p-2 text-sm';

    const header = document.createElement('div');
    header.className = 'flex justify-between items-start gap-2';
    const title = document.createElement('span');
    title.className = 'font-medium';
    title.textContent = subject.label;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-gray-400 hover:text-red-600 leading-none';
    remove.setAttribute('aria-label', 'Quitar asignatura');
    remove.textContent = '×';
    remove.onclick = () => {
      selectedSubjects.splice(index, 1);
      renderSelectedSubjects();
    };
    header.append(title, remove);

    const selects = document.createElement('div');
    selects.className = 'grid grid-cols-2 gap-2 mt-1.5';
    [['periodos', 'periodo'], ['grupos', 'grupo']].forEach(([listKey, field]) => {
      const select = document.createElement('select');
      select.className = 'border border-gray-300 rounded px-2 py-1 text-xs';
      setSelectOptions(select, subject.detail[listKey].map(o => ({
        value: o.value,
        label: o.label,
        selected: o.value === subject[field]
      })));
      select.onchange = () => { subject[field] = select.value; };
      selects.appendChild(select);
    });

    row.append(header, selects);
    container.appendChild(row);
  });
}

function optionLabel(list, value) {
  return list.find(o => o.value === value)?.label || '';
}

async function submitAsignaturaSearch() {
  if (selectedSubjects.length === 0) {
    showSearchError('Añade al menos una asignatura.');
    return null;
  }
  const res = await fetch(apiUrl('/api/horario-asignaturas'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      anio: document.getElementById('search-anio').value,
      selections: selectedSubjects.map(s => ({
        asignatura: s.value,
        asignaturaDesc: s.label,
        centro: s.detail.centro,
        plan: s.detail.plan,
        estudio: s.detail.estudio,
        periodo: s.periodo,
        periodoDesc: optionLabel(s.detail.periodos, s.periodo),
        grupo: s.grupo,
        grupoDesc: optionLabel(s.detail.grupos, s.grupo)
      }))
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo obtener el horario');
  }
  return res.text();
}

async function submitScheduleSearch() {
  const btn = document.getElementById('search-submit-btn');
  const label = document.getElementById('search-submit-label');

  if (searchMode === 'asignatura') {
    showSearchError('');
    btn.disabled = true;
    label.textContent = 'Cargando...';
    try {
      const icsText = await submitAsignaturaSearch();
      if (icsText) {
        parseICSContent(icsText);
        document.getElementById('search-dialog').close();
      }
    } catch (err) {
      showSearchError(err.message);
    } finally {
      btn.disabled = false;
      label.textContent = 'Cargar horario';
    }
    return;
  }

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
