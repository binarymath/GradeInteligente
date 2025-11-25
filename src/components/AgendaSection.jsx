import React, { useMemo, useState } from 'react';
import { Calendar, Plus, Trash2, Download, Calculator, FileText } from 'lucide-react';
import { uid, DAYS } from '../utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Generates ICS for a specific class (turma) using global events
const generateICSForClass = (data, calendarSettings, classId) => {
  const cls = data.classes.find(c => c.id === classId);
  if (!cls) return;

  const parseDateInput = (dateStr) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const schoolStart = parseDateInput(calendarSettings.schoolYearStart);
  const schoolEnd = parseDateInput(calendarSettings.schoolYearEnd);

  const formatICSTime = (date, h, m) => {
    const y = date.getFullYear();
    const mo = (date.getMonth() + 1).toString().padStart(2, '0');
    const dy = date.getDate().toString().padStart(2, '0');
    return `${y}${mo}${dy}T${h}${m}00`;
  };

  const now = new Date();
  const nowString = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const foldLine = (line) => {
    if (line.length <= 75) return line;
    let result = '';
    let remaining = line;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, 75);
      remaining = remaining.slice(75);
      result += chunk + '\r\n';
      if (remaining.length > 0) remaining = ' ' + remaining; // continuation with space
    }
    return result.trimEnd();
  };

  const cleanText = (str) => str ? str.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n') : '';

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GradeInteligente//AgendaEscolar//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Agenda Turma ${cleanText(cls.name)}`,
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
    if (slot.classId !== cls.id) return;

    const parts = key.split('-');
    const dayIdx = parseInt(parts[1]);
    const slotIdx = parseInt(parts[2]);

    const timeSlot = data.timeSlots[slotIdx];
    if (!timeSlot || timeSlot.type !== 'aula') return;

    const subject = data.subjects.find(s => s.id === slot.subjectId);
    const teacher = data.teachers.find(t => t.id === slot.teacherId);
    if (!subject || !teacher) return;

    // Find first occurrence date for this weekday inside school period
    let eventDate = new Date(schoolStart);
    const targetJSDay = (dayIdx + 1) % 7;
    let addDays = (targetJSDay - eventDate.getDay() + 7) % 7;
    eventDate.setDate(eventDate.getDate() + addDays);
    if (eventDate > schoolEnd) return;

    const [startH, startM] = timeSlot.start.split(':');
    const [endH, endM] = timeSlot.end.split(':');

    // Exclusion dates from events (Ferias/Feriado)
    let exDates = [];
    (calendarSettings.events || []).forEach(evt => {
      if (!evt.start || !evt.end) return;
      const evtStart = parseDateInput(evt.start);
      const evtEnd = parseDateInput(evt.end);

      // Walk through each weekly occurrence of this weekday inside the event range
      let cursor = new Date(evtStart);
      let diff = (targetJSDay - cursor.getDay() + 7) % 7;
      cursor.setDate(cursor.getDate() + diff);
      while (cursor <= evtEnd) {
        if (cursor >= evtStart) {
          exDates.push(formatICSTime(cursor, startH, startM));
        }
        cursor.setDate(cursor.getDate() + 7);
      }
    });

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid()}@gradeinteligente.com`);
    icsLines.push(`DTSTAMP:${nowString}`);
    icsLines.push(`SUMMARY:${cleanText(subject.name)}`);
    icsLines.push(`DESCRIPTION:${cleanText('Professor(a): ' + teacher.name)}`);
    icsLines.push(`DTSTART;TZID=America/Sao_Paulo:${formatICSTime(eventDate, startH, startM)}`);
    icsLines.push(`DTEND;TZID=America/Sao_Paulo:${formatICSTime(eventDate, endH, endM)}`);

    const untilDate = new Date(schoolEnd);
    untilDate.setHours(23, 59, 59);
    const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    icsLines.push(`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`);

    exDates.forEach(ex => {
      icsLines.push(`EXDATE;TZID=America/Sao_Paulo:${ex}`);
    });
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');
  const finalContent = icsLines.map(foldLine).join('\r\n');
  const blob = new Blob([finalContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', `Agenda_${cls.name.replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Generates ICS for a specific teacher using global events
const generateICSForTeacher = (data, calendarSettings, teacherId) => {
  const teacher = data.teachers.find(t => t.id === teacherId);
  if (!teacher) return;

  const parseDateInput = (dateStr) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const schoolStart = parseDateInput(calendarSettings.schoolYearStart);
  const schoolEnd = parseDateInput(calendarSettings.schoolYearEnd);

  const formatICSTime = (date, h, m) => {
    const y = date.getFullYear();
    const mo = (date.getMonth() + 1).toString().padStart(2, '0');
    const dy = date.getDate().toString().padStart(2, '0');
    return `${y}${mo}${dy}T${h}${m}00`;
  };

  const now = new Date();
  const nowString = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const foldLine = (line) => {
    if (line.length <= 75) return line;
    let result = '';
    let remaining = line;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, 75);
      remaining = remaining.slice(75);
      result += chunk + '\r\n';
      if (remaining.length > 0) remaining = ' ' + remaining;
    }
    return result.trimEnd();
  };

  const cleanText = (str) => str ? str.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n') : '';

  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GradeInteligente//AgendaEscolar//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Agenda Professor(a) ${cleanText(teacher.name)}`,
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
    if (slot.teacherId !== teacher.id) return;

    const parts = key.split('-');
    const dayIdx = parseInt(parts[1]);
    const slotIdx = parseInt(parts[2]);

    const timeSlot = data.timeSlots[slotIdx];
    if (!timeSlot || timeSlot.type !== 'aula') return;

    const subject = data.subjects.find(s => s.id === slot.subjectId);
    const cls = data.classes.find(c => c.id === slot.classId);
    if (!subject || !cls) return;

    let eventDate = new Date(schoolStart);
    const targetJSDay = (dayIdx + 1) % 7;
    let addDays = (targetJSDay - eventDate.getDay() + 7) % 7;
    eventDate.setDate(eventDate.getDate() + addDays);
    if (eventDate > schoolEnd) return;

    const [startH, startM] = timeSlot.start.split(':');
    const [endH, endM] = timeSlot.end.split(':');

    let exDates = [];
    (calendarSettings.events || []).forEach(evt => {
      if (!evt.start || !evt.end) return;
      const evtStart = parseDateInput(evt.start);
      const evtEnd = parseDateInput(evt.end);

      let cursor = new Date(evtStart);
      let diff = (targetJSDay - cursor.getDay() + 7) % 7;
      cursor.setDate(cursor.getDate() + diff);
      while (cursor <= evtEnd) {
        if (cursor >= evtStart) {
          exDates.push(formatICSTime(cursor, startH, startM));
        }
        cursor.setDate(cursor.getDate() + 7);
      }
    });

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${uid()}@gradeinteligente.com`);
    icsLines.push(`DTSTAMP:${nowString}`);
    icsLines.push(`SUMMARY:${cleanText(subject.name + ' (' + cls.name + ')')}`);
    icsLines.push(`DESCRIPTION:${cleanText('Turma: ' + cls.name)}`);
    icsLines.push(`DTSTART;TZID=America/Sao_Paulo:${formatICSTime(eventDate, startH, startM)}`);
    icsLines.push(`DTEND;TZID=America/Sao_Paulo:${formatICSTime(eventDate, endH, endM)}`);

    const untilDate = new Date(schoolEnd);
    untilDate.setHours(23, 59, 59);
    const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    icsLines.push(`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`);

    exDates.forEach(ex => {
      icsLines.push(`EXDATE;TZID=America/Sao_Paulo:${ex}`);
    });
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');
  const finalContent = icsLines.map(foldLine).join('\r\n');
  const blob = new Blob([finalContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', `Agenda_${teacher.name.replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const AgendaSection = ({ data, calendarSettings, setCalendarSettings }) => {
  const [schoolStart, setSchoolStart] = useState(calendarSettings.schoolYearStart || '');
  const [schoolEnd, setSchoolEnd] = useState(calendarSettings.schoolYearEnd || '');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');

  const syncSchoolYear = () => {
    setCalendarSettings(prev => ({ ...prev, schoolYearStart: schoolStart, schoolYearEnd: schoolEnd }));
  };

  const addEvent = () => {
    if (!eventStart) { alert('Data inicial obrigatória.'); return; }
    const finalEnd = eventEnd || eventStart;
    const newEvt = {
      id: Date.now().toString(),
      type: 'Evento',
      title: eventTitle.trim() || 'Evento',
      start: eventStart,
      end: finalEnd
    };
    setCalendarSettings(prev => ({ ...prev, events: [...(prev.events || []), newEvt] }));
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
  };

  const removeEvent = (id) => {
    setCalendarSettings(prev => ({ ...prev, events: prev.events.filter(e => e.id === id) }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl shadow-sm flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600"/> Agenda Escolar</h3>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col gap-3">
            <h4 className="font-semibold text-slate-700 text-sm">Período do Ano Letivo</h4>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-600 mb-1">Início</label>
                <input type="date" value={schoolStart} onChange={e => setSchoolStart(e.target.value)} onBlur={syncSchoolYear} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-600 mb-1">Fim</label>
                <input type="date" value={schoolEnd} onChange={e => setSchoolEnd(e.target.value)} onBlur={syncSchoolYear} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">A agenda só inclui aulas entre estas datas.</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col gap-3 lg:col-span-2">
            <h4 className="font-semibold text-slate-700 text-sm">Adicionar Evento (Exclusão de Aulas)</h4>
            <div className="grid md:grid-cols-4 gap-3">
              <div className="flex flex-col md:col-span-2">
                <label className="text-xs font-semibold text-slate-600 mb-1">Título</label>
                <input type="text" value={eventTitle} placeholder="Ex: Férias de Julho ou Dia da Independência" onChange={e => setEventTitle(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="flex flex-col md:col-span-1">
                <label className="text-xs font-semibold text-slate-600 mb-1">Início</label>
                <input type="date" value={eventStart} onChange={e => setEventStart(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="flex flex-col md:col-span-1">
                <label className="text-xs font-semibold text-slate-600 mb-1">Fim</label>
                <input type="date" value={eventEnd} onChange={e => setEventEnd(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={addEvent} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-indigo-700 shadow-sm"><Plus size={16}/> Adicionar Evento</button>
              <p className="text-[11px] text-slate-500">Para feriado de um dia, deixe Início = Fim.</p>
            </div>
            {calendarSettings.events && calendarSettings.events.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-bold text-slate-600 mb-2">Eventos Cadastrados</div>
                <ul className="divide-y divide-slate-200 bg-slate-50 border border-slate-200 rounded">
                  {calendarSettings.events.map(ev => (
                    <li key={ev.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-700">{ev.title}</span>
                        <span className="text-slate-500">{ev.start}{ev.end !== ev.start ? ` → ${ev.end}` : ''}</span>
                      </div>
                      <button onClick={() => removeEvent(ev.id)} className="text-red-600 hover:text-red-700 p-1" title="Remover"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white border border-blue-100 rounded-lg p-4 shadow-sm flex gap-4 items-start">
          <div className="text-indigo-600"><Calendar size={20}/></div>
          <div className="flex-1">
            <p className="text-xs text-slate-600 leading-relaxed"><span className="font-semibold text-slate-700">Como funciona:</span> Cada aula é exportada semanalmente no arquivo .ics até o fim do ano letivo. Eventos de <span className="font-semibold">Férias</span> ou <span className="font-semibold">Feriado</span> excluem automaticamente essas aulas para manter a agenda limpa.</p>
          </div>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
        <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600"/> Agendas por Turma</h4>
        <p className="text-[11px] text-slate-500">Baixe a agenda individual de cada turma já considerando férias e feriados cadastrados.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.classes.map(cls => (
            <div key={cls.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between bg-slate-50 hover:bg-white transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">{cls.name}</span>
                <span className="text-[10px] text-slate-500">Turno: {cls.shift}</span>
              </div>
              <button onClick={() => generateICSForClass(data, calendarSettings, cls.id)} className="flex items-center gap-1 bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-700"><Download size={14}/> Agenda</button>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
        <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calendar className="w-5 h-5 text-emerald-600"/> Agendas por Professor</h4>
        <p className="text-[11px] text-slate-500">Baixe a agenda individual de cada professor já considerando férias e feriados cadastrados.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.teachers.map(teacher => (
            <div key={teacher.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between bg-slate-50 hover:bg-white transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">{teacher.name}</span>
                <span className="text-[10px] text-slate-500">Turnos: {teacher.shifts?.join(', ') || 'N/A'}</span>
              </div>
              <button onClick={() => generateICSForTeacher(data, calendarSettings, teacher.id)} className="flex items-center gap-1 bg-emerald-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-emerald-700"><Download size={14}/> Agenda</button>
            </div>
          ))}
        </div>
      </div>

      {/* Calculadora de Aulas */}
      <LessonCalculator data={data} calendarSettings={calendarSettings} />
    </div>
  );
};

const LessonCalculator = ({ data, calendarSettings }) => {
  const [start, setStart] = useState(calendarSettings.schoolYearStart || '');
  const [end, setEnd] = useState(calendarSettings.schoolYearEnd || '');

  const parseDate = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const schoolStart = useMemo(() => parseDate(calendarSettings.schoolYearStart), [calendarSettings.schoolYearStart]);
  const schoolEnd = useMemo(() => parseDate(calendarSettings.schoolYearEnd), [calendarSettings.schoolYearEnd]);
  const events = useMemo(() => (calendarSettings.events || []).map(e => ({ start: parseDate(e.start), end: parseDate(e.end || e.start) })), [calendarSettings.events]);

  const isExcluded = (date) => {
    return events.some(({ start, end }) => start && end && date >= start && date <= end);
  };

  const clampRange = (s, e) => {
    let rs = s ? new Date(s) : schoolStart;
    let re = e ? new Date(e) : schoolEnd;
    if (rs < schoolStart) rs = new Date(schoolStart);
    if (re > schoolEnd) re = new Date(schoolEnd);
    return [rs, re];
  };

  const getFirstWeekdayOnOrAfter = (date, targetWeekday) => {
    const d = new Date(date);
    const diff = (targetWeekday - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d;
  };

  const countBySubject = useMemo(() => {
    if (!schoolStart || !schoolEnd) return { map: new Map(), total: 0 };
    const [rs, re] = clampRange(parseDate(start), parseDate(end));
    const counts = new Map();
    let total = 0;

    Object.entries(data.schedule || {}).forEach(([key, slot]) => {
      const parts = key.split('-');
      const dayIdx = parseInt(parts[1]);
      const slotIdx = parseInt(parts[2]);
      const timeSlot = data.timeSlots[slotIdx];
      if (!timeSlot || timeSlot.type !== 'aula') return;

      const subjectId = slot.subjectId;
      if (!subjectId) return;

      // Map our internal weekdays (0..4 for Mon..Fri) to JS weekday (1..5)
      const jsWeekday = (dayIdx + 1) % 7; // 1..5 (Mon..Fri)
      const first = getFirstWeekdayOnOrAfter(rs, jsWeekday);
      for (let cursor = new Date(first); cursor <= re; cursor.setDate(cursor.getDate() + 7)) {
        if (cursor < rs) continue;
        if (isExcluded(cursor)) continue;
        counts.set(subjectId, (counts.get(subjectId) || 0) + 1);
        total += 1;
      }
    });

    return { map: counts, total };
  }, [data.schedule, data.timeSlots, start, end, events, schoolStart, schoolEnd]);

  // Year and 4 bimesters (split into 4 equal ranges)
  const bimesterRanges = useMemo(() => {
    if (!schoolStart || !schoolEnd) return [];
    const ranges = [];
    const totalDays = Math.floor((schoolEnd - schoolStart) / (1000*60*60*24)) + 1;
    const chunk = Math.floor(totalDays / 4);
    let curStart = new Date(schoolStart);
    for (let i = 0; i < 4; i++) {
      const curEnd = new Date(i === 3 ? schoolEnd : new Date(curStart.getTime() + (chunk - 1) * 86400000));
      ranges.push([new Date(curStart), curEnd]);
      curStart = new Date(curEnd.getTime() + 86400000);
    }
    return ranges;
  }, [schoolStart, schoolEnd]);

  const subjectsList = useMemo(() => data.subjects || [], [data.subjects]);

  const handleQuickRange = (idx) => {
    if (idx === 'year') {
      setStart(fmt(schoolStart));
      setEnd(fmt(schoolEnd));
    } else {
      const [s, e] = bimesterRanges[idx];
      setStart(fmt(s));
      setEnd(fmt(e));
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const periodStr = `${start || fmt(schoolStart)} a ${end || fmt(schoolEnd)}`;
    doc.setFontSize(14);
    doc.text('Contagem de Aulas por Matéria', 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${periodStr}`, 14, 22);

    const rows = subjectsList.map(s => [s.name, countBySubject.map.get(s.id) || 0]);
    autoTable(doc, {
      head: [['Matéria', 'Aulas no Período']],
      body: rows,
      startY: 28,
      styles: { fontSize: 10 }
    });

    const finalY = doc.lastAutoTable.finalY || 28;
    doc.setFontSize(10);
    doc.text(`Total de aulas: ${countBySubject.total}`, 14, finalY + 8);

    doc.save('Contagem_Aulas.pdf');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
      <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calculator className="w-5 h-5 text-violet-600"/> Calculadora de Aulas</h4>
      <p className="text-[11px] text-slate-500">Selecione o período (bimestre) para contar aulas por matéria, já considerando eventos de exclusão.</p>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-600 mb-1">Início do Período</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-600 mb-1">Fim do Período</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
        </div>
        <div className="flex flex-col justify-end">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleQuickRange(0)} className="px-2 py-1.5 text-xs rounded bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">1º Bimestre</button>
            <button onClick={() => handleQuickRange(1)} className="px-2 py-1.5 text-xs rounded bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">2º</button>
            <button onClick={() => handleQuickRange(2)} className="px-2 py-1.5 text-xs rounded bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">3º</button>
            <button onClick={() => handleQuickRange(3)} className="px-2 py-1.5 text-xs rounded bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">4º</button>
            <button onClick={() => handleQuickRange('year')} className="px-2 py-1.5 text-xs rounded bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100">Ano todo</button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded p-3">
          <div className="text-xs text-slate-500">Total no Período</div>
          <div className="text-2xl font-extrabold text-slate-800">{countBySubject.total}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-3 lg:col-span-2 flex items-center justify-between">
          <div className="text-xs text-slate-500">Exportação</div>
          <button onClick={exportPDF} className="flex items-center gap-2 bg-violet-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-violet-700"><FileText size={14}/> PDF (todas as matérias)</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr>
              <th className="border p-2 bg-slate-50">Matéria</th>
              <th className="border p-2 bg-slate-50 w-32 text-right">Aulas</th>
            </tr>
          </thead>
          <tbody>
            {subjectsList.map(s => (
              <tr key={s.id}>
                <td className="border p-2">{s.name}</td>
                <td className="border p-2 text-right font-semibold">{countBySubject.map.get(s.id) || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AgendaSection;
