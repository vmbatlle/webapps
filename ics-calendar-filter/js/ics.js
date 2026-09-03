/**
 * ICS Parsing and Export Utility Functions
 */

const SUMMARY_REGEX = /^\s*(\d+)\s*-\s*(.+?)\s+Grupo:\s*([^\-]+?)\s*-\s*(.+)\s*$/i;

function parseIcsDateTime(icsStr) {
  if (!icsStr) return null;
  const clean = icsStr.split(':').pop().trim();
  const isUTC = clean.endsWith('Z');
  const raw = clean.replace('Z', '');

  if (raw.length >= 8) {
    const y = parseInt(raw.substring(0, 4), 10);
    const m = parseInt(raw.substring(4, 6), 10) - 1;
    const d = parseInt(raw.substring(6, 8), 10);

    if (raw.includes('T') && raw.length >= 13) {
      const tIdx = raw.indexOf('T');
      const hh = parseInt(raw.substring(tIdx + 1, tIdx + 3), 10);
      const mm = parseInt(raw.substring(tIdx + 3, tIdx + 5), 10);
      const ss = raw.length >= tIdx + 7 ? parseInt(raw.substring(tIdx + 5, tIdx + 7), 10) : 0;

      return isUTC ? new Date(Date.UTC(y, m, d, hh, mm, ss)) : new Date(y, m, d, hh, mm, ss);
    }
    return new Date(y, m, d);
  }
  return null;
}

function parseEventBlock(rawLines) {
  let summary = '', dtstart = '', dtend = '', location = '';

  for (let line of rawLines) {
    if (line.startsWith('SUMMARY:')) summary = line.substring(8);
    else if (line.startsWith('SUMMARY;')) summary = line.split(':').slice(1).join(':');
    else if (line.startsWith('DTSTART')) dtstart = line;
    else if (line.startsWith('DTEND')) dtend = line;
    else if (line.startsWith('LOCATION')) location = line.split(':').slice(1).join(':');
  }

  const normSummary = summary.replace(/\s+/g, ' ').trim();
  const match = normSummary.match(SUMMARY_REGEX);

  const startDateObj = parseIcsDateTime(dtstart);
  const endDateObj = parseIcsDateTime(dtend);
  const isAllDay = dtstart ? !dtstart.includes('T') : true;

  const startDateStr = toLocalDateString(startDateObj);
  const endDateStr = toLocalDateString(endDateObj);

  let timeDisplay = 'Todo el día';
  if (!isAllDay && startDateObj) {
    const startTime = toLocalTimeString(startDateObj);
    const endTime = endDateObj ? toLocalTimeString(endDateObj) : '';
    timeDisplay = endTime ? `${startTime} - ${endTime}` : startTime;
  }

  let durationHours = 0;
  if (!isAllDay && startDateObj && endDateObj) {
    const diffMs = endDateObj.getTime() - startDateObj.getTime();
    durationHours = diffMs > 0 ? diffMs / (1000 * 60 * 60) : 0;
  }

  let meta = { valid: false };
  if (match) {
    const code = match[1].trim();
    const name = match[2].trim();
    const group = match[3].trim();
    const kind = match[4].trim();
    const courseKey = `${code} - ${name}`;

    meta = { valid: true, code, name, courseKey, group, kind };

    if (!courseMetaData[courseKey]) {
      courseMetaData[courseKey] = { groups: new Set(), kinds: new Set() };
    }
    courseMetaData[courseKey].groups.add(group);
    courseMetaData[courseKey].kinds.add(kind);
  }

  return {
    rawLines,
    summary: normSummary,
    location,
    meta,
    startDateObj,
    endDateObj,
    startDateStr,
    endDateStr,
    timeDisplay,
    durationHours,
    isAllDay
  };
}

function parseICSContent(icsText) {
  try {
    const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);

    parsedHeader = [];
    parsedFooter = [];
    allEvents = [];
    courseMetaData = {};

    let inEvent = false;
    let currentLines = [];

    for (let line of lines) {
      if (line.startsWith('BEGIN:VEVENT')) {
        inEvent = true;
        currentLines = [line];
      } else if (line.startsWith('END:VEVENT')) {
        currentLines.push(line);
        inEvent = false;
        const parsed = parseEventBlock(currentLines);
        if (parsed.meta.valid) {
          allEvents.push(parsed);
        }
      } else if (inEvent) {
        currentLines.push(line);
      } else {
        if (allEvents.length === 0) parsedHeader.push(line);
        else parsedFooter.push(line);
      }
    }

    const sortedCourses = Object.keys(courseMetaData).sort();
    sortedCourses.forEach((ckey, idx) => {
      courseMetaData[ckey].color = getCourseColor(idx);
    });

    buildFilterUI();
    applyFilters();

    document.getElementById('export-btn').disabled = false;
    document.getElementById('apply-btn').disabled = false;

    if (filteredEvents.length > 0 && filteredEvents[0].startDateStr) {
      const firstDate = filteredEvents[0].startDateStr.split('T')[0];
      calendar.gotoDate(firstDate);
      selectedDateStr = firstDate;
      renderDaySchedule(selectedDateStr);
    }
  } catch (err) {
    console.error("Error al procesar el archivo ICS:", err);
    alert("Ocurrió un error al procesar el archivo: " + err.message);
  }
}

function exportFilteredICS() {
  let output = [...parsedHeader];
  filteredEvents.forEach(ev => {
    output = output.concat(ev.rawLines);
  });
  output = output.concat(parsedFooter);

  const blob = new Blob([output.join('\r\n')], { type: 'text/calendar;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'horario_filtrado.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}