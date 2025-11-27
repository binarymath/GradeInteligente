// Serviço para geração de arquivo ICS (agenda escolar).
import { uid } from '../utils';

function parseDateInput(dateStr) {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatICSTime(date, h, m) {
  const y = date.getFullYear();
  const mo = (date.getMonth() + 1).toString().padStart(2, '0');
  const dy = date.getDate().toString().padStart(2, '0');
  return `${y}${mo}${dy}T${h}${m}00`;
}

function foldLine(line) {
  if (line.length <= 75) return line;
  let result = '';
  let currentLine = line.substring(0, 75);
  result += currentLine + '\r\n';
  let remaining = line.substring(75);
  while (remaining.length > 0) {
    const chunk = remaining.substring(0, 74);
    result += ' ' + chunk + '\r\n';
    remaining = remaining.substring(74);
  }
  return result.trimEnd();
}

function cleanText(str) {
  return str ? str.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n') : '';
}

/**
 * Gera e dispara download do ICS da agenda de uma turma ou professor.
 * @param {Object} params
 * @param {'class'|'teacher'} params.viewMode
 * @param {string} params.selectedEntity
 * @param {Object} params.data
 * @param {Object} params.calendarSettings { schoolYearStart, schoolYearEnd, events }
 */
export function exportICS({ viewMode, selectedEntity, data, calendarSettings }) {
  let entity = null;
  if (viewMode === 'class') entity = data.classes.find(c => c.id === selectedEntity);
  else if (viewMode === 'teacher') entity = data.teachers.find(t => t.id === selectedEntity);
  else if (viewMode === 'subject') entity = data.subjects.find(s => s.id === selectedEntity);
  if (!entity) return;

  const schoolStart = parseDateInput(calendarSettings.schoolYearStart);
  const schoolEnd = parseDateInput(calendarSettings.schoolYearEnd);
  const now = new Date();
  const nowString = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AutoGrade//SchoolTimetable//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Agenda ${cleanText(entity.name)}`,
    'BEGIN:VTIMEZONE',
    'TZID:America/Sao_Paulo',
    'X-LIC-LOCATION:America/Sao_Paulo',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'TZNAME:-03',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  Object.entries(data.schedule).forEach(([key, slot]) => {
    if (viewMode === 'class' && slot.classId !== entity.id) return;
    if (viewMode === 'teacher' && slot.teacherId !== entity.id) return;
    if (viewMode === 'subject' && slot.subjectId !== entity.id) return;

    const parts = key.split('-');
    const dayIdx = parseInt(parts[1]);
    const slotIdx = parseInt(parts[2]);
    const timeSlot = data.timeSlots[slotIdx];
    if (!timeSlot) return;

    const subject = data.subjects.find(s => s.id === slot.subjectId);
    const clsObj = data.classes.find(c => c.id === slot.classId);
    const teacher = data.teachers.find(t => t.id === slot.teacherId);

    let summary = '';
    let description = '';
    if (viewMode === 'class') {
      summary = subject.name;
      description = `Professor(a): ${teacher.name}`;
    } else if (viewMode === 'teacher') {
      summary = `${subject.name} (${clsObj.name})`;
      description = `Turma: ${clsObj.name}`;
    } else if (viewMode === 'subject') {
      summary = `${subject.name} (${clsObj.name})`;
      description = `Professor(a): ${teacher.name}`;
    }

    let currentCheckDate = new Date(schoolStart);
    const targetJSDay = (dayIdx + 1) % 7;
    const daysToAdd = (targetJSDay - currentCheckDate.getDay() + 7) % 7;
    currentCheckDate.setDate(currentCheckDate.getDate() + daysToAdd);
    const eventDate = currentCheckDate;
    if (eventDate > schoolEnd) return;

    const [startH, startM] = timeSlot.start.split(':');
    const [endH, endM] = timeSlot.end.split(':');

    const exDates = [];
    (calendarSettings.events || []).forEach(evt => {
      if (!evt.start || !evt.end) return;
      const evtStart = parseDateInput(evt.start);
      const evtEnd = parseDateInput(evt.end);
      let tempDate = new Date(evtStart);
      const dDiff = (targetJSDay - tempDate.getDay() + 7) % 7;
      tempDate.setDate(tempDate.getDate() + dDiff);
      while (tempDate <= evtEnd) {
        if (tempDate >= evtStart) {
          exDates.push(formatICSTime(tempDate, startH, startM));
        }
        tempDate.setDate(tempDate.getDate() + 7);
      }
    });

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid()}@autograde.com`);
    icsLines.push(`DTSTAMP:${nowString}`);
    icsLines.push(`SUMMARY:${cleanText(summary)}`);
    icsLines.push(`DESCRIPTION:${cleanText(description)}`);
    icsLines.push(`DTSTART;TZID=America/Sao_Paulo:${formatICSTime(eventDate, startH, startM)}`);
    icsLines.push(`DTEND;TZID=America/Sao_Paulo:${formatICSTime(eventDate, endH, endM)}`);
    const untilDate = new Date(schoolEnd);
    untilDate.setHours(23, 59, 59);
    const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    icsLines.push(`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`);
    exDates.forEach(ex => icsLines.push(`EXDATE;TZID=America/Sao_Paulo:${ex}`));
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');
  const finalContent = icsLines.map(foldLine).join('\r\n');
  const blob = new Blob([finalContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', `Agenda_${entity.name.replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Gera e dispara download do ICS incremental contendo APENAS eventos de dias específicos.
 * Usado para sobrescrever dias já importados quando há mudanças pontuais (reuniões, eventos especiais).
 * @param {Object} params
 * @param {'class'|'teacher'} params.viewMode
 * @param {string} params.selectedEntity
 * @param {Object} params.data
 * @param {Object} params.calendarSettings { specificDayEvents }
 */
export function exportIncrementalICS({ viewMode, selectedEntity, data, calendarSettings }) {
  let entity = null;
  if (viewMode === 'class') entity = data.classes.find(c => c.id === selectedEntity);
  else if (viewMode === 'teacher') entity = data.teachers.find(t => t.id === selectedEntity);
  else if (viewMode === 'subject') entity = data.subjects.find(s => s.id === selectedEntity);
  if (!entity) return;

  const specificDayEvents = calendarSettings.specificDayEvents || [];
  if (specificDayEvents.length === 0) {
    alert('Nenhum evento de dia específico cadastrado. Adicione eventos antes de exportar o ICS incremental.');
    return;
  }

  const now = new Date();
  const nowString = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AutoGrade//SchoolTimetable//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Eventos Especiais - ${cleanText(entity.name)}`,
    'BEGIN:VTIMEZONE',
    'TZID:America/Sao_Paulo',
    'X-LIC-LOCATION:America/Sao_Paulo',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'TZNAME:-03',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  // Para cada evento de dia específico, criar um evento de dia inteiro
  specificDayEvents.forEach(evt => {
    const eventDate = parseDateInput(evt.date);
    const eventStartStr = formatICSTime(eventDate, '00', '00');
    const eventEndStr = formatICSTime(eventDate, '23', '59');

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${evt.id}@autograde.com`);
    icsLines.push(`DTSTAMP:${nowString}`);
    icsLines.push(`SUMMARY:${cleanText(evt.title)}`);
    if (evt.description) {
      icsLines.push(`DESCRIPTION:${cleanText(evt.description)}`);
    }
    icsLines.push(`DTSTART;VALUE=DATE:${eventDate.toISOString().split('T')[0].replace(/-/g, '')}`);
    icsLines.push(`DTEND;VALUE=DATE:${new Date(eventDate.getTime() + 86400000).toISOString().split('T')[0].replace(/-/g, '')}`);
    icsLines.push('TRANSP:OPAQUE');
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');
  const finalContent = icsLines.map(foldLine).join('\r\n');
  const blob = new Blob([finalContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', `Eventos_Especiais_${entity.name.replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

