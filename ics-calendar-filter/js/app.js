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

document.addEventListener('DOMContentLoaded', () => {
  const calendarEl = document.getElementById('calendar');
  calendar = new FullCalendar.Calendar(calendarEl, {
    locale: 'es',
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

function buildFilterUI() {
  const container = document.getElementById('filter-container');
  container.innerHTML = '';

  const sortedCourses = Object.keys(courseMetaData).sort();

  sortedCourses.forEach((ckey) => {
    const course = courseMetaData[ckey];
    const card = document.createElement('div');
    card.className = "p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2";

    const titleRow = document.createElement('div');
    titleRow.className = "flex items-center justify-between border-b pb-1.5 gap-2";

    const titleLeft = document.createElement('div');
    titleLeft.className = "flex items-center gap-2 overflow-hidden";

    const colorDot = document.createElement('span');
    colorDot.className = "w-3 h-3 rounded-full flex-shrink-0 inline-block";
    colorDot.style.backgroundColor = course.color;

    const titleText = document.createElement('h3');
    titleText.className = "font-bold text-gray-800 text-xs uppercase tracking-wide truncate";
    titleText.innerText = ckey;

    titleLeft.appendChild(colorDot);
    titleLeft.appendChild(titleText);

    const badge = document.createElement('span');
    badge.id = `badge-${sanitizeId(ckey)}`;
    badge.className = "text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 flex-shrink-0 whitespace-nowrap";
    badge.innerText = "0 (0h)";

    titleRow.appendChild(titleLeft);
    titleRow.appendChild(badge);
    card.appendChild(titleRow);

    const grpLabel = document.createElement('div');
    grpLabel.className = "text-xs font-semibold text-gray-600 mt-1";
    grpLabel.innerText = "Grupos:";
    card.appendChild(grpLabel);

    const grpContainer = document.createElement('div');
    grpContainer.className = "flex flex-wrap gap-1.5";

    Array.from(course.groups).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).forEach(grp => {
      const badgeLabel = document.createElement('label');
      badgeLabel.className = "flex items-center gap-1 text-xs bg-white border px-2 py-1 rounded cursor-pointer hover:bg-indigo-50";
      badgeLabel.innerHTML = `<input type="checkbox" data-course="${ckey}" data-type="groups" data-val="${grp}" checked class="rounded text-indigo-600"> Gr. ${grp}`;
      grpContainer.appendChild(badgeLabel);
    });
    card.appendChild(grpContainer);

    const kindLabel = document.createElement('div');
    kindLabel.className = "text-xs font-semibold text-gray-600 mt-1";
    kindLabel.innerText = "Tipo de docencia:";
    card.appendChild(kindLabel);

    const kindContainer = document.createElement('div');
    kindContainer.className = "flex flex-col gap-1";

    Array.from(course.kinds).sort().forEach(kind => {
      const row = document.createElement('label');
      row.className = "flex items-center justify-between text-xs cursor-pointer hover:bg-gray-100 p-1 rounded transition gap-2";
      
      const leftDiv = document.createElement('div');
      leftDiv.className = "flex items-center gap-2 overflow-hidden";
      leftDiv.innerHTML = `<input type="checkbox" data-course="${ckey}" data-type="kinds" data-val="${kind}" checked class="rounded text-indigo-600"> <span class="truncate">${kind}</span>`;

      const kindBadge = document.createElement('span');
      kindBadge.id = `kind-badge-${sanitizeId(ckey)}-${sanitizeId(kind)}`;
      kindBadge.className = "text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 flex-shrink-0 whitespace-nowrap";
      kindBadge.innerText = "0 (0h)";

      row.appendChild(leftDiv);
      row.appendChild(kindBadge);
      kindContainer.appendChild(row);
    });
    card.appendChild(kindContainer);

    container.appendChild(card);
  });
}

function toggleAllFilters(state) {
  document.querySelectorAll('#filter-container input[type="checkbox"]').forEach(cb => cb.checked = state);
  applyFilters();
}

function applyFilters() {
  const activeFilters = {};

  document.querySelectorAll('#filter-container input[type="checkbox"]').forEach(cb => {
    const ckey = cb.dataset.course;
    const type = cb.dataset.type;
    const val = cb.dataset.val;

    if (!activeFilters[ckey]) activeFilters[ckey] = { groups: new Set(), kinds: new Set() };
    if (cb.checked) activeFilters[ckey][type].add(val);
  });

  filteredEvents = allEvents.filter(ev => {
    if (!ev.meta.valid) return false;
    const courseFilter = activeFilters[ev.meta.courseKey];
    if (!courseFilter) return false;
    return courseFilter.groups.has(ev.meta.group) && courseFilter.kinds.has(ev.meta.kind);
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
  const fcEvents = filteredEvents.map(ev => {
    const color = courseMetaData[ev.meta.courseKey]?.color || '#2563EB';
    return {
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