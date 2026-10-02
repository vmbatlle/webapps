/**
 * Application State & UI Controller
 */

const COLOR_PALETTE = [
  '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#D97706', '#A855F7', '#E11D48', '#0284C7'
];

let parsedHeader = [];
let parsedFooter = [];
let allEvents = [];
let filteredEvents = [];
let courseMetaData = {}; 
let calendar = null;
let selectedDateStr = new Date().toISOString().split('T')[0];
let expandedCourseKey = null;
let dotGroups = null;
const mobileQuery = window.matchMedia('(max-width: 639px)');

// Groups events by day and colour so mobile view can show one "Nx" dot per group.
function getDotGroup(event) {
  if (!dotGroups) {
    dotGroups = new Map();
    calendar.getEvents().forEach(ev => {
      const key = `${ev.startStr.split('T')[0]}|${ev.backgroundColor}`;
      const g = dotGroups.get(key);
      if (g) g.count++;
      else dotGroups.set(key, { first: ev.id, count: 1 });
    });
  }
  return dotGroups.get(`${event.startStr.split('T')[0]}|${event.backgroundColor}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const calendarEl = document.getElementById('calendar');
  calendar = new FullCalendar.Calendar(calendarEl, {
    locale: 'es',
    firstDay: 1,
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: ''
    },
    buttonText: {
      today: 'Hoy'
    },
    eventTimeFormat: {
      hour: 'numeric',
      minute: '2-digit',
      meridiem: 'narrow',
      omitZeroMinute: true
    },
    height: 440,
    eventsSet: () => { dotGroups = null; },
    eventClassNames: (arg) => {
      if (!mobileQuery.matches) return [];
      return getDotGroup(arg.event).first !== arg.event.id ? ['dot-dup'] : [];
    },
    datesSet: () => {
      highlightSelectedDay(selectedDateStr);
    },
    dateClick: (info) => {
      selectedDateStr = info.dateStr;
      renderDaySchedule(info.dateStr);
    },
    eventClick: (info) => {
      selectedDateStr = info.event.startStr.split('T')[0];
      renderDaySchedule(selectedDateStr);
    }
  });
  calendar.render();
  mobileQuery.addEventListener('change', () => calendar.rerenderEvents());
  highlightSelectedDay(selectedDateStr);
});

function highlightSelectedDay(dateStr) {
  document.querySelectorAll('.fc-daygrid-day.selected-day').forEach(el => {
    el.classList.remove('selected-day');
  });
  if (!dateStr) return;
  const cell = document.querySelector(`.fc-daygrid-day[data-date="${dateStr}"]`);
  if (cell) {
    cell.classList.add('selected-day');
  }
}

function getCourseColor(index) {
  if (index < COLOR_PALETTE.length) return COLOR_PALETTE[index];
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue}, 70%, 45%)`;
}

function sanitizeId(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function toLocalDateString(dateObj) {
  if (!dateObj) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toLocalTimeString(dateObj) {
  if (!dateObj) return '';
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => parseICSContent(e.target.result);
  reader.readAsText(file);
}

function pairKey(kind, group) {
  return `${kind}\u0000${group}`;
}

function buildFilterUI() {
  const container = document.getElementById('filter-container');
  container.innerHTML = '';

  const active = Object.keys(courseMetaData).filter(k => !courseMetaData[k].removed).sort();
  const removed = Object.keys(courseMetaData).filter(k => courseMetaData[k].removed).sort();

  if (active.length) {
    const hint = document.createElement('p');
    hint.className = "text-gray-400 text-xs text-center";
    hint.textContent = "Pulsa en cada asignatura para filtrar.";
    container.appendChild(hint);
  }

  active.concat(removed).forEach((ckey) => {
    container.appendChild(buildCourseRow(ckey));
  });
}

function buildCourseRow(ckey) {
  const course = courseMetaData[ckey];
  const isRemoved = !!course.removed;
  const isExpanded = !isRemoved && expandedCourseKey === ckey;

  const item = document.createElement('div');
  item.className = "course-item bg-gray-50 border border-gray-200 rounded-lg overflow-hidden transition-opacity" + (isRemoved ? " opacity-50" : "");
  item.dataset.course = ckey;

  const header = document.createElement('div');
  header.className = "flex items-center justify-between gap-2 p-2.5" + (isRemoved ? "" : " cursor-pointer hover:bg-gray-100");
  if (!isRemoved) {
    header.addEventListener('click', () => toggleCourseExpand(ckey));
  }

  const titleLeft = document.createElement('div');
  titleLeft.className = "flex items-center gap-2 overflow-hidden";

  if (!isRemoved) {
    const chevron = document.createElement('span');
    chevron.className = "course-chevron text-gray-400 flex-shrink-0" + (isExpanded ? " expanded" : "");
    titleLeft.appendChild(chevron);
  }

  const colorDot = document.createElement('span');
  colorDot.className = "w-3 h-3 rounded-full flex-shrink-0 inline-block";
  colorDot.style.backgroundColor = course.color;

  const titleText = document.createElement('h3');
  titleText.className = "font-bold text-gray-800 text-xs uppercase tracking-wide truncate";
  titleText.innerText = ckey;

  titleLeft.appendChild(colorDot);
  titleLeft.appendChild(titleText);

  const titleRight = document.createElement('div');
  titleRight.className = "flex items-center gap-2 flex-shrink-0";

  const badge = document.createElement('span');
  badge.id = `badge-${sanitizeId(ckey)}`;
  badge.className = "text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 whitespace-nowrap";
  badge.innerText = "0 (0h)";
  titleRight.appendChild(badge);

  const removeBtn = document.createElement('button');
  removeBtn.type = "button";
  removeBtn.title = isRemoved ? "Volver a añadir la asignatura" : "Quitar la asignatura";
  removeBtn.className = "w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold transition " +
    (isRemoved ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200");
  removeBtn.innerText = isRemoved ? "+" : "×";
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCourseRemoved(ckey);
  });
  titleRight.appendChild(removeBtn);

  header.appendChild(titleLeft);
  header.appendChild(titleRight);
  item.appendChild(header);

  if (!isRemoved) {
    const body = document.createElement('div');
    body.className = "course-body p-2.5 pt-0 space-y-1.5 border-t border-gray-200" + (isExpanded ? "" : " hidden");

    const kindLabel = document.createElement('div');
    kindLabel.className = "text-xs font-semibold text-gray-600 mt-2";
    kindLabel.innerText = "Tipo de docencia y grupos:";
    body.appendChild(kindLabel);

    Array.from(course.kindGroups.keys()).sort().forEach(kind => {
      body.appendChild(buildKindGroupNode(ckey, kind));
    });

    item.appendChild(body);
  }

  return item;
}

function buildKindGroupNode(ckey, kind) {
  const groups = Array.from(courseMetaData[ckey].kindGroups.get(kind))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const wrapper = document.createElement('div');
  wrapper.className = "bg-white border border-gray-200 rounded";

  const parentRow = document.createElement('label');
  parentRow.className = "flex items-center justify-between text-xs cursor-pointer hover:bg-gray-100 p-1.5 rounded gap-2";

  const parentLeft = document.createElement('div');
  parentLeft.className = "flex items-center gap-2 overflow-hidden";

  const parentCb = document.createElement('input');
  parentCb.type = "checkbox";
  parentCb.checked = true;
  parentCb.className = "rounded text-indigo-600 kind-checkbox";

  const parentSpan = document.createElement('span');
  parentSpan.className = "truncate font-medium";
  parentSpan.innerText = kind;

  parentLeft.appendChild(parentCb);
  parentLeft.appendChild(parentSpan);

  const kindBadge = document.createElement('span');
  kindBadge.id = `kind-badge-${sanitizeId(ckey)}-${sanitizeId(kind)}`;
  kindBadge.className = "text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 flex-shrink-0 whitespace-nowrap";
  kindBadge.innerText = "0 (0h)";

  parentRow.appendChild(parentLeft);
  parentRow.appendChild(kindBadge);
  wrapper.appendChild(parentRow);

  const childContainer = document.createElement('div');
  childContainer.className = "flex flex-wrap gap-1.5 px-1.5 pb-1.5";

  const leafCheckboxes = [];
  groups.forEach(grp => {
    const grpLabel = document.createElement('label');
    grpLabel.className = "flex items-center gap-1 text-xs bg-gray-50 border px-2 py-1 rounded cursor-pointer hover:bg-indigo-50";

    const leafCb = document.createElement('input');
    leafCb.type = "checkbox";
    leafCb.checked = true;
    leafCb.className = "rounded text-indigo-600 leaf-checkbox";
    leafCb.dataset.course = ckey;
    leafCb.dataset.kind = kind;
    leafCb.dataset.group = grp;

    grpLabel.appendChild(leafCb);
    grpLabel.appendChild(document.createTextNode(` Gr. ${grp}`));
    childContainer.appendChild(grpLabel);
    leafCheckboxes.push(leafCb);

    leafCb.addEventListener('change', () => {
      updateKindCheckboxState(parentCb, leafCheckboxes);
      applyFilters();
    });
  });

  parentCb.addEventListener('change', () => {
    leafCheckboxes.forEach(cb => cb.checked = parentCb.checked);
    parentCb.indeterminate = false;
    applyFilters();
  });

  wrapper.appendChild(childContainer);
  return wrapper;
}

function updateKindCheckboxState(parentCb, leafCheckboxes) {
  const checkedCount = leafCheckboxes.filter(cb => cb.checked).length;
  parentCb.checked = checkedCount === leafCheckboxes.length;
  parentCb.indeterminate = checkedCount > 0 && checkedCount < leafCheckboxes.length;
}

function toggleCourseExpand(ckey) {
  expandedCourseKey = expandedCourseKey === ckey ? null : ckey;
  document.querySelectorAll('.course-item').forEach(item => {
    const body = item.querySelector('.course-body');
    const chevron = item.querySelector('.course-chevron');
    if (!body) return;
    const isExpanded = item.dataset.course === expandedCourseKey;
    body.classList.toggle('hidden', !isExpanded);
    if (chevron) chevron.classList.toggle('expanded', isExpanded);
  });
}

function toggleCourseRemoved(ckey) {
  const course = courseMetaData[ckey];
  course.removed = !course.removed;
  if (course.removed && expandedCourseKey === ckey) {
    expandedCourseKey = null;
  }
  buildFilterUI();
  applyFilters();
}

function applyFilters() {
  const activeFilters = {};

  document.querySelectorAll('#filter-container input.leaf-checkbox').forEach(cb => {
    const ckey = cb.dataset.course;
    if (courseMetaData[ckey]?.removed) return;

    if (!activeFilters[ckey]) activeFilters[ckey] = new Set();
    if (cb.checked) activeFilters[ckey].add(pairKey(cb.dataset.kind, cb.dataset.group));
  });

  filteredEvents = allEvents.filter(ev => {
    if (!ev.meta.valid) return false;
    if (courseMetaData[ev.meta.courseKey]?.removed) return false;
    const courseFilter = activeFilters[ev.meta.courseKey];
    if (!courseFilter) return false;
    return courseFilter.has(pairKey(ev.meta.kind, ev.meta.group));
  });

  const courseStats = {};
  const courseKindStats = {};

  Object.keys(courseMetaData).forEach(ckey => {
    courseStats[ckey] = { count: 0, hours: 0 };
    courseKindStats[ckey] = {};
    courseMetaData[ckey].kinds.forEach(k => courseKindStats[ckey][k] = { count: 0, hours: 0 });
  });

  filteredEvents.forEach(ev => {
    if (ev.meta.valid && courseStats.hasOwnProperty(ev.meta.courseKey)) {
      const hrs = ev.durationHours || 0;
      courseStats[ev.meta.courseKey].count++;
      courseStats[ev.meta.courseKey].hours += hrs;

      if (courseKindStats[ev.meta.courseKey] && courseKindStats[ev.meta.courseKey][ev.meta.kind]) {
        courseKindStats[ev.meta.courseKey][ev.meta.kind].count++;
        courseKindStats[ev.meta.courseKey][ev.meta.kind].hours += hrs;
      }
    }
  });

  Object.keys(courseStats).forEach(ckey => {
    const st = courseStats[ckey];
    const roundHours = Math.round(st.hours);
    const badgeEl = document.getElementById(`badge-${sanitizeId(ckey)}`);
    if (badgeEl) {
      badgeEl.innerText = `${st.count} (${roundHours}h)`;
      badgeEl.title = `${st.count} eventos con un total de ${roundHours} horas`;
    }

    if (courseKindStats[ckey]) {
      Object.keys(courseKindStats[ckey]).forEach(kind => {
        const kSt = courseKindStats[ckey][kind];
        const kRoundHours = Math.round(kSt.hours);
        const kBadge = document.getElementById(`kind-badge-${sanitizeId(ckey)}-${sanitizeId(kind)}`);
        if (kBadge) {
          kBadge.innerText = `${kSt.count} (${kRoundHours}h)`;
          kBadge.title = `${kSt.count} eventos con un total de ${kRoundHours} horas`;
        }
      });
    }
  });

  updateStatistics();
  updateCalendar();
  renderDaySchedule(selectedDateStr);
}

function updateStatistics() {
  let totalHours = 0;
  const kindHoursMap = {};

  filteredEvents.forEach(ev => {
    if (ev.durationHours) {
      totalHours += ev.durationHours;
      const kindName = ev.meta.kind;
      kindHoursMap[kindName] = (kindHoursMap[kindName] || 0) + ev.durationHours;
    }
  });

  document.getElementById('stat-total-hours').innerText = `${Math.round(totalHours)} h`;

  const breakdownContainer = document.getElementById('stat-kinds-breakdown');
  breakdownContainer.innerHTML = '';

  const kindKeys = Object.keys(kindHoursMap).sort();
  if (kindKeys.length === 0) {
    breakdownContainer.innerHTML = `<span class="text-xs text-gray-400">Sin clases en los filtros seleccionados.</span>`;
    return;
  }

  kindKeys.forEach(kind => {
    const hrs = Math.round(kindHoursMap[kind]);
    const pill = document.createElement('span');
    pill.className = "inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-md font-medium text-gray-700 shadow-2xs";
    pill.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-500"></span> ${kind}: <strong class="text-indigo-900">${hrs}h</strong>`;
    breakdownContainer.appendChild(pill);
  });
}

function updateCalendar() {
  calendar.removeAllEvents();
  const fcEvents = filteredEvents.map((ev, i) => {
    const color = courseMetaData[ev.meta.courseKey]?.color || '#2563EB';
    return {
      id: String(i),
      title: `${ev.meta.name} (Gr. ${ev.meta.group})`,
      start: ev.startDateObj || ev.startDateStr,
      end: ev.endDateObj || ev.endDateStr,
      allDay: ev.isAllDay,
      color: color,
      borderColor: color
    };
  });
  calendar.addEventSource(fcEvents);
}

function renderDaySchedule(dateStr) {
  highlightSelectedDay(dateStr);

  const tbody = document.getElementById('schedule-tbody');
  tbody.innerHTML = '';

  document.getElementById('selected-date-title').innerText = `Horario del día ${dateStr}`;

  const matches = filteredEvents.filter(ev => ev.startDateStr === dateStr);

  if (matches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">No hay eventos programados para este día.</td></tr>`;
    return;
  }

  matches.forEach(ev => {
    const row = document.createElement('tr');
    row.className = "hover:bg-gray-50 text-gray-700";

    const courseColor = courseMetaData[ev.meta.courseKey]?.color || '#4B5563';
    row.innerHTML = `
      <td class="p-2 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">${ev.timeDisplay}</td>
      <td class="p-2 font-medium">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 inline-block" style="background-color: ${courseColor}"></span>
          <span>${ev.meta.courseKey}</span>
        </div>
      </td>
      <td class="p-2 whitespace-nowrap min-w-[130px]">
        <span class="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-1 rounded-full inline-block">Grupo ${ev.meta.group}</span>
      </td>
      <td class="p-2 whitespace-nowrap">${ev.meta.kind}</td>
      <td class="p-2 text-gray-500">${ev.location || '-'}</td>
    `;
    tbody.appendChild(row);
  });
}