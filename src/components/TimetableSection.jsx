import React, { useState } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { DAYS } from '../utils';
import ExportButtons from './ExportButtons';
import { useDisplayPeriods } from '../hooks/useDisplayPeriods';

const TimetableSection = ({ data, viewMode, selectedEntity, calendarSettings, setCalendarSettings, showAgendaControls = true, filterShift = 'Todos' }) => {
  const displayPeriods = useDisplayPeriods({ data, viewMode, selectedEntity });
  // Estado local do formulário de ano letivo e eventos
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

  // Handlers movidos para componente de botões.

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      {showAgendaControls ? (
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100 flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600"/> Agenda Escolar</h3>
            <ExportButtons viewMode={viewMode} selectedEntity={selectedEntity} data={data} displayPeriods={displayPeriods} calendarSettings={calendarSettings} />
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
                <p className="text-[11px] text-slate-500">Para feriado de um dia, deixe Início = Fim. Para período de férias use datas diferentes.</p>
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
              <p className="text-xs text-slate-600 leading-relaxed"><span className="font-semibold text-slate-700">Como funciona:</span> Cada aula prevista no horário é exportada semanalmente para o arquivo .ics até o fim do ano letivo. Os períodos marcados como <span className="font-semibold">Férias</span> ou <span className="font-semibold">Feriado</span> excluem essas aulas automaticamente, mantendo sua agenda limpa.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">Grade Horária</h3>
          <ExportButtons viewMode={viewMode} selectedEntity={selectedEntity} data={data} displayPeriods={displayPeriods} />
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
            {displayPeriods
              .filter(slot => {
                if (filterShift === 'Todos') return true;
                // respeita apenas slots explicitamente marcados com o turno selecionado
                return slot.shift === filterShift;
              })
              .map((slot, idx) => {
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
                      } else if (viewMode === 'subject') {
                        const entries = Object.values(data.schedule).filter(val => val.subjectId === selectedEntity && val.timeKey === timeKey);
                        if (entries.length > 0) {
                          cellContent = (
                            <div className="flex flex-col gap-1">
                              {entries.map(e => {
                                const cls = data.classes.find(c => c.id === e.classId);
                                const teacher = data.teachers.find(t => t.id === e.teacherId);
                                return (
                                  <div key={e.classId + e.teacherId} className="text-[11px] leading-tight">
                                    <span className="font-bold text-slate-700">{cls?.name}</span> <span className="text-slate-500">({teacher?.name})</span>
                                  </div>
                                );
                              })}
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
