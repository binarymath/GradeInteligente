import React, { useState } from 'react';
import { Download, FileText, Calendar, Plus, Trash2 } from 'lucide-react';
import { DAYS, uid } from '../utils';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const TimetableSection = ({ data, viewMode, selectedEntity, calendarSettings, setCalendarSettings, showAgendaControls = true }) => {
  const periods = data.timeSlots;
  const [exportFormat, setExportFormat] = useState('pdf');
  const [showExportMenu, setShowExportMenu] = useState(false); // (mantido para possível uso futuro)
  // Estado local do formulário de ano letivo e eventos
  const [schoolStart, setSchoolStart] = useState(calendarSettings.schoolYearStart || '');
  const [schoolEnd, setSchoolEnd] = useState(calendarSettings.schoolYearEnd || '');
  const [eventType, setEventType] = useState('Ferias');
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
      type: eventType, // Ferias | Feriado
      title: eventTitle.trim() || (eventType === 'Ferias' ? 'Férias' : 'Feriado'),
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

  // Filter periods based on selected Class's active slots
  let displayPeriods = periods;
  if (viewMode === 'class') {
    const currentClass = data.classes.find(c => c.id === selectedEntity);
    if (currentClass && currentClass.activeSlots) {
      displayPeriods = periods.filter(p => currentClass.activeSlots.includes(p.id));
    }
  } else if (viewMode === 'teacher') {
    const teacher = data.teachers.find(t => t.id === selectedEntity);
    if (teacher && teacher.shifts && teacher.shifts.length > 0) {
      const classifySlotShift = (start) => {
        const [h,m] = start.split(':').map(Number);
        const minutes = h*60+m;
        if (minutes < 12*60) return 'Manhã';
        if (minutes < 18*60) return 'Tarde';
        return 'Noite';
      };
      const expanded = new Set();
      teacher.shifts.forEach(s => {
        if (s === 'Integral (Manhã e Tarde)') {
          expanded.add('Manhã');
          expanded.add('Tarde');
        } else if (s === 'Integral (Tarde e Noite)') {
          expanded.add('Tarde');
          expanded.add('Noite');
        } else {
          expanded.add(s);
        }
      });
      displayPeriods = periods.filter(p => expanded.has(classifySlotShift(p.start)));
    }
  }

  const exportExcel = () => {
    let rows = [["Turma", "Dia", "Início", "Fim", "Matéria", "Professor"]];
    
    Object.entries(data.schedule).forEach(([key, slot]) => {
       if (viewMode === 'class' && slot.classId !== selectedEntity) return;
       if (viewMode === 'teacher' && slot.teacherId !== selectedEntity) return;
       
       const clsObj = data.classes.find(c => c.id === slot.classId);

       const parts = key.split('-');
       const dayIdx = parseInt(parts[1]);
       const slotIdx = parseInt(parts[2]);
       
       const timeSlot = data.timeSlots[slotIdx];
       if (!timeSlot) return;

       const subject = data.subjects.find(s => s.id === slot.subjectId);
       const teacher = data.teachers.find(t => t.id === slot.teacherId);
       
       if (subject && teacher && clsObj) {
         rows.push([
           clsObj.name,
           DAYS[dayIdx],
           timeSlot.start,
           timeSlot.end,
           subject.name,
           teacher.name
         ]);
       }
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Grade Horária");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, `Grade_${viewMode}_${selectedEntity}.xlsx`);
  };

  const generatePDF = async () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape' });

      const titleText = viewMode === 'class' 
        ? `Grade Horária - ${data.classes.find(c => c.id === selectedEntity)?.name}`
        : `Grade Horária - Professor(a) ${data.teachers.find(t => t.id === selectedEntity)?.name}`;
      
      doc.setFontSize(18);
      doc.text(titleText, 14, 22);
      doc.setFontSize(10);
      doc.text("Gerado pelo Sistema de Grade Inteligente", 14, 28);

      const head = [['Horário', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']];
      const body = displayPeriods.map((slot, idx) => {
        const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
        const row = [`${slot.start} - ${slot.end}`];
        
        if (slot.type !== 'aula') {
          const label = slot.type === 'almoco' ? 'ALMOÇO' : slot.type === 'jantar' ? 'JANTAR' : 'INTERVALO';
          return [row[0], { content: label, colSpan: 5, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: [100, 100, 100], fontStyle: 'bold' } }];
        }

        DAYS.forEach((_, dayIdx) => {
          const timeKey = `${dayIdx}-${absoluteIndex}`;
          let cellContent = '';

          if (viewMode === 'class') {
            const scheduleKey = `${selectedEntity}-${timeKey}`;
            const entry = data.schedule[scheduleKey];
            if (entry) {
              const subj = data.subjects.find(s => s.id === entry.subjectId);
              const teacher = data.teachers.find(t => t.id === entry.teacherId);
              cellContent = `${subj.name}\n(${teacher.name})`;
            }
          } else if (viewMode === 'teacher') {
            const entry = Object.entries(data.schedule).find(([key, val]) => val.teacherId === selectedEntity && val.timeKey === timeKey);
            if (entry) {
              const item = entry[1];
              const subj = data.subjects.find(s => s.id === item.subjectId);
              const cls = data.classes.find(c => c.id === item.classId);
              cellContent = `${subj.name}\n(${cls.name})`;
            }
          }
          row.push(cellContent);
        });
        return row;
      });

      autoTable(doc, {
        head: head,
        body: body,
        startY: 35,
        styles: { fontSize: 10, cellPadding: 3, valign: 'middle' },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35, halign: 'center' } } 
      });

      doc.save(`Grade_${viewMode}_${selectedEntity}.pdf`);

    } catch (error) {
      alert("Erro ao gerar PDF. Verifique se as dependências estão instaladas corretamente.");
      console.error(error);
    }
  };

  const downloadICS = () => {
    // ... existing ICS logic ...
    // I'll implement a simplified version or copy the full logic if needed.
    // For brevity, I'll assume the user has the logic or I can copy it later.
    // But I should probably include it to be complete.
    // I'll copy the logic from the original file.
    
    let classesToExport = [];
    let type = '';
    
    if (viewMode === 'class') {
      const cls = data.classes.find(c => c.id === selectedEntity);
      if (cls) classesToExport.push(cls);
      type = 'class';
    } else if (viewMode === 'teacher') {
      type = 'teacher';
    } else {
      return;
    }
    
    const entity = viewMode === 'class' 
       ? data.classes.find(c => c.id === selectedEntity)
       : data.teachers.find(t => t.id === selectedEntity);

    if (!entity) return;

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
      let currentLine = line.substring(0, 75);
      result += currentLine + '\r\n';
      let remaining = line.substring(75);
      while (remaining.length > 0) {
         let chunk = remaining.substring(0, 74);
         result += ' ' + chunk + '\r\n';
         remaining = remaining.substring(74);
      }
      return result.trimEnd();
    };
    
    const cleanText = (str) => str ? str.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n') : '';

    let icsLines = [
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
       if (type === 'class' && slot.classId !== entity.id) return;
       if (type === 'teacher' && slot.teacherId !== entity.id) return;
       
       const clsObj = data.classes.find(c => c.id === slot.classId);

       const parts = key.split('-');
       const dayIdx = parseInt(parts[1]);
       const slotIdx = parseInt(parts[2]);

       const timeSlot = data.timeSlots[slotIdx];
       if (!timeSlot) return;

       const subject = data.subjects.find(s => s.id === slot.subjectId);
       const teacher = data.teachers.find(t => t.id === slot.teacherId);
       
       const summary = type === 'class' ? subject.name : `${subject.name} (${clsObj.name})`;
       const description = type === 'class' ? `Professor(a): ${teacher.name}` : `Turma: ${clsObj.name}`;

       let currentCheckDate = new Date(schoolStart);
       const targetJSDay = (dayIdx + 1) % 7;
       
       let daysToAdd = (targetJSDay - currentCheckDate.getDay() + 7) % 7;
       currentCheckDate.setDate(currentCheckDate.getDate() + daysToAdd);
       
       const eventDate = currentCheckDate;
       
       if (eventDate > schoolEnd) return;

       const [startH, startM] = timeSlot.start.split(':');
       const [endH, endM] = timeSlot.end.split(':');
       
       let exDates = [];
       calendarSettings.events.forEach(evt => {
          if (!evt.start || !evt.end) return;
          const evtStart = parseDateInput(evt.start);
          const evtEnd = parseDateInput(evt.end);
          
          let tempDate = new Date(evtStart);
          let dDiff = (targetJSDay - tempDate.getDay() + 7) % 7;
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
    link.setAttribute('download', `Agenda_${entity.name.replace(/\s+/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      {showAgendaControls ? (
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100 flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600"/> Agenda Escolar</h3>
            <button onClick={downloadICS} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded shadow-sm hover:bg-blue-700 text-sm font-medium" title="Baixar Agenda (.ics)"><Calendar size={16}/> Baixar Agenda</button>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Ano Letivo */}
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
                <p className="text-[11px] text-slate-500 leading-relaxed">As aulas só serão incluídas entre estas datas. Ajuste antes de baixar.</p>
              </div>
            </div>
            {/* Adicionar Evento */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col gap-3 lg:col-span-2">
              <h4 className="font-semibold text-slate-700 text-sm">Adicionar Evento (Exclusão de Aulas)</h4>
              <div className="grid md:grid-cols-5 gap-3">
                <div className="flex flex-col md:col-span-1">
                  <label className="text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                  <select value={eventType} onChange={e => setEventType(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    <option value="Ferias">Férias</option>
                    <option value="Feriado">Feriado</option>
                  </select>
                </div>
                <div className="flex flex-col md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1">Título (opcional)</label>
                  <input type="text" value={eventTitle} placeholder={eventType === 'Ferias' ? 'Férias de Julho' : 'Dia da Independência'} onChange={e => setEventTitle(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
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
                <p className="text-[11px] text-slate-500">Para feriado de um dia, deixe Início = Fim. Para período de férias use datas diferentes.</p>
              </div>
              {calendarSettings.events && calendarSettings.events.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-bold text-slate-600 mb-2">Eventos Cadastrados</div>
                  <ul className="divide-y divide-slate-200 bg-slate-50 border border-slate-200 rounded">
                    {calendarSettings.events.map(ev => (
                      <li key={ev.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700">{ev.title} <span className="text-slate-400 font-normal">({ev.type})</span></span>
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
              <p className="text-xs text-slate-600 leading-relaxed"><span className="font-semibold text-slate-700">Como funciona:</span> Cada aula prevista no horário é exportada semanalmente para o arquivo .ics até o fim do ano letivo. Os períodos marcados como <span className="font-semibold">Férias</span> ou <span className="font-semibold">Feriado</span> excluem essas aulas automaticamente, mantendo sua agenda limpa.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">Grade Horária</h3>
          <div className="flex gap-2 items-center">
            <button onClick={generatePDF} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded shadow-sm hover:bg-indigo-700 text-xs font-medium" title="Exportar PDF"><FileText size={14}/> PDF</button>
            <button onClick={exportExcel} className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded shadow-sm hover:bg-emerald-700 text-xs font-medium" title="Exportar Excel"><Download size={14}/> Excel</button>
          </div>
        </div>
      )}
      <div className="p-4 overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr>
              <th className="border p-2 bg-slate-50">Horário</th>
              {DAYS.map(d => <th key={d} className="border p-2 bg-slate-50">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {displayPeriods.map((slot, idx) => {
              const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
              return (
                <tr key={slot.id}>
                  <td className="border p-2 font-bold whitespace-nowrap">{slot.start} - {slot.end}</td>
                  {slot.type !== 'aula' ? (
                    <td colSpan={5} className="border p-2 text-center bg-slate-100 text-slate-500 font-bold uppercase">
                      {slot.type}
                    </td>
                  ) : (
                    DAYS.map((_, dayIdx) => {
                      const timeKey = `${dayIdx}-${absoluteIndex}`;
                      let cellContent = null;
                      if (viewMode === 'class') {
                        const scheduleKey = `${selectedEntity}-${timeKey}`;
                        const entry = data.schedule[scheduleKey];
                        if (entry) {
                          const subj = data.subjects.find(s => s.id === entry.subjectId);
                          const teacher = data.teachers.find(t => t.id === entry.teacherId);
                          cellContent = (
                            <div className="text-xs">
                              <div className="font-bold text-slate-700">{subj?.name}</div>
                              <div className="text-slate-500">{teacher?.name}</div>
                            </div>
                          );
                        }
                      } else if (viewMode === 'teacher') {
                        const entry = Object.entries(data.schedule).find(([key, val]) => val.teacherId === selectedEntity && val.timeKey === timeKey);
                        if (entry) {
                          const item = entry[1];
                          const subj = data.subjects.find(s => s.id === item.subjectId);
                          const cls = data.classes.find(c => c.id === item.classId);
                          cellContent = (
                            <div className="text-xs">
                              <div className="font-bold text-slate-700">{subj?.name}</div>
                              <div className="text-slate-500">{cls?.name}</div>
                            </div>
                          );
                        }
                      }
                      return <td key={dayIdx} className="border p-2">{cellContent}</td>;
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimetableSection;
