import React, { useMemo, useState } from 'react';
import { Calendar, Plus, Trash2, Download, Calculator, FileText, BookOpen, Clock, Pencil, X } from 'lucide-react';
import { uid, DAYS } from '../utils';
import { generateICSForClass, generateICSForTeacher } from '../utils/icsUtils';

const AgendaSection = ({ data, calendarSettings, setCalendarSettings }) => {
  const [schoolStart, setSchoolStart] = useState(calendarSettings.schoolYearStart || '');
  const [schoolEnd, setSchoolEnd] = useState(calendarSettings.schoolYearEnd || '');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [editingEventId, setEditingEventId] = useState(null);

  const syncSchoolYear = () => {
    setCalendarSettings(prev => ({ ...prev, schoolYearStart: schoolStart, schoolYearEnd: schoolEnd }));
  };

  const addEvent = () => {
    if (!eventStart) { alert('Data inicial obrigatória.'); return; }
    const finalEnd = eventEnd || eventStart;

    if (editingEventId) {
      setCalendarSettings(prev => ({
        ...prev,
        events: prev.events.map(e => e.id === editingEventId ? { ...e, title: eventTitle, start: eventStart, end: finalEnd } : e)
      }));
      setEditingEventId(null);
    } else {
      const newEvt = {
        id: Date.now().toString(),
        type: 'Evento',
        title: eventTitle.trim() || 'Evento',
        start: eventStart,
        end: finalEnd
      };
      setCalendarSettings(prev => ({ ...prev, events: [...(prev.events || []), newEvt] }));
    }
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
  };

  const startEditing = (event) => {
    setEventTitle(event.title);
    setEventStart(event.start);
    setEventEnd(event.end);
    setEditingEventId(event.id);
  };

  const cancelEditing = () => {
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
    setEditingEventId(null);
  };

  const removeEvent = (id) => {
    if (editingEventId === id) cancelEditing();
    setCalendarSettings(prev => ({ ...prev, events: prev.events.filter(e => e.id !== id) }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl shadow-sm flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600" /> Agenda Escolar</h3>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-700 text-sm">Período Calendário</h4>
              <button
                onClick={() => {
                  const dates = [];
                  const start = new Date(schoolStart || calendarSettings.schoolYearStart);
                  const end = new Date(schoolEnd || calendarSettings.schoolYearEnd);

                  // Reset hours
                  start.setHours(0, 0, 0, 0);
                  end.setHours(0, 0, 0, 0);

                  const parseDateInput = (str) => {
                    const [y, m, d] = str.split('-').map(Number);
                    return new Date(y, m - 1, d);
                  };

                  const isDayExcluded = (d) => {
                    return (calendarSettings.events || []).some(ev => {
                      if (!ev.start) return false;
                      const s = parseDateInput(ev.start);
                      const e = ev.end ? parseDateInput(ev.end) : s;
                      return d >= s && d <= e;
                    });
                  };

                  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const day = d.getDay();
                    if (day === 0 || day === 6) continue; // Skip weekend
                    if (isDayExcluded(d)) continue; // Skip holidays

                    dates.push({
                      date: d.toLocaleDateString('pt-BR'),
                      weekday: DAYS[day - 1], // DAYS is 0=Seg...
                      fullDate: d.toISOString().split('T')[0]
                    });
                  }

                  let csvContent = "data:text/csv;charset=utf-8,Data,Dia da Semana\n";
                  dates.forEach(item => {
                    csvContent += `${item.date},${item.weekday}\n`;
                  });

                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement("a");
                  link.setAttribute("href", encodedUri);
                  link.setAttribute("download", "dias_letivos.csv");
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="text-xs flex items-center gap-1 bg-slate-100 text-slate-600 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                title="Baixar lista CSV de dias letivos"
              >
                <Download size={12} /> Baixar Datas
              </button>
            </div>
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
              <button onClick={addEvent} className={`flex items-center gap-1 ${editingEventId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white px-3 py-2 rounded text-sm font-medium shadow-sm`}>
                {editingEventId ? <Pencil size={16} /> : <Plus size={16} />}
                {editingEventId ? ' Atualizar Evento' : ' Adicionar Evento'}
              </button>
              {editingEventId && (
                <button onClick={cancelEditing} className="flex items-center gap-1 bg-slate-300 text-slate-700 px-3 py-2 rounded text-sm font-medium hover:bg-slate-400 shadow-sm">
                  <X size={16} /> Cancelar
                </button>
              )}
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
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEditing(ev)} className="text-blue-600 hover:text-blue-700 p-1" title="Editar"><Pencil size={14} /></button>
                        <button onClick={() => removeEvent(ev.id)} className="text-red-600 hover:text-red-700 p-1" title="Remover"><Trash2 size={14} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white border border-blue-100 rounded-lg p-4 shadow-sm flex gap-4 items-start">
          <div className="text-indigo-600"><Calendar size={20} /></div>
          <div className="flex-1">
            <p className="text-xs text-slate-600 leading-relaxed"><span className="font-semibold text-slate-700">Como funciona:</span> Cada aula é exportada semanalmente no arquivo .ics até o fim do ano letivo. Eventos de <span className="font-semibold">Férias</span> ou <span className="font-semibold">Feriado</span> excluem automaticamente essas aulas para manter a agenda limpa.</p>
          </div>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
        <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600" /> Agendas por Turma</h4>
        <p className="text-[11px] text-slate-500">Baixe a agenda individual de cada turma já considerando férias e feriados cadastrados.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...data.classes].sort((a, b) => a.name.localeCompare(b.name)).map(cls => (
            <div key={cls.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between bg-slate-50 hover:bg-white transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">{cls.name}</span>
                <span className="text-[10px] text-slate-500">Turno: {cls.shift}</span>
              </div>
              <button onClick={() => generateICSForClass(data, calendarSettings, cls.id)} className="flex items-center gap-1 bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-700"><Download size={14} /> Agenda</button>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
        <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calendar className="w-5 h-5 text-emerald-600" /> Agendas por Professor</h4>
        <p className="text-[11px] text-slate-500">Baixe a agenda individual de cada professor já considerando férias e feriados cadastrados.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...data.teachers].sort((a, b) => a.name.localeCompare(b.name)).map(teacher => (
            <div key={teacher.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between bg-slate-50 hover:bg-white transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">{teacher.name}</span>
                <span className="text-[10px] text-slate-500">Turnos: {teacher.shifts?.join(', ') || 'N/A'}</span>
              </div>
              <button onClick={() => generateICSForTeacher(data, calendarSettings, teacher.id)} className="flex items-center gap-1 bg-emerald-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-emerald-700"><Download size={14} /> Agenda</button>
            </div>
          ))}
        </div>
      </div>

      {/* Eventos Pontuais (Dias Específicos) */}
      <SpecificDayEvents
        data={data}
        calendarSettings={calendarSettings}
        setCalendarSettings={setCalendarSettings}
      />

      {/* Calculadora de Aulas */}
      <LessonCalculator data={data} calendarSettings={calendarSettings} />
    </div>
  );
};

const SpecificDayEvents = ({ data, calendarSettings, setCalendarSettings }) => {
  const [isAddingSpecificDay, setIsAddingSpecificDay] = useState(false);
  const [specificDayDate, setSpecificDayDate] = useState('');
  const [specificDayEndDate, setSpecificDayEndDate] = useState('');
  const [specificDayTitle, setSpecificDayTitle] = useState('');
  const [specificDayDescription, setSpecificDayDescription] = useState('');
  const [modificationMode, setModificationMode] = useState(''); // '', 'replace', 'add', 'partial' — none pre-selected
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [isMultipleDays, setIsMultipleDays] = useState(false);

  const addSpecificDayEvent = () => {
    if (!specificDayDate.trim()) {
      alert('Por favor, selecione uma data inicial para o evento específico.');
      return;
    }
    if (isMultipleDays && !specificDayEndDate.trim()) {
      alert('Por favor, selecione uma data final para o evento de múltiplos dias.');
      return;
    }
    if (!specificDayTitle.trim()) {
      alert('Por favor, informe um título para o evento específico.');
      return;
    }
    if (!modificationMode) {
      alert('Selecione o Tipo de Modificação (Substituir/Acrescentar/Parcial).');
      return;
    }
    if (!startTime || !endTime) {
      alert('Por favor, informe o horário de início e fim do evento.');
      return;
    }

    const newEvent = {
      id: uid(),
      type: 'DiaEspecifico',
      date: specificDayDate,
      endDate: isMultipleDays ? (specificDayEndDate || specificDayDate) : specificDayDate,
      title: specificDayTitle,
      description: specificDayDescription,
      modificationMode: modificationMode,
      startTime: startTime,
      endTime: endTime,
      customSchedule: []
    };

    setCalendarSettings(prev => ({
      ...prev,
      specificDayEvents: [...(prev.specificDayEvents || []), newEvent]
    }));

    // Reset form
    setSpecificDayDate('');
    setSpecificDayEndDate('');
    setSpecificDayTitle('');
    setSpecificDayDescription('');
    setModificationMode('');
    setStartTime('08:00');
    setEndTime('12:00');
    setIsMultipleDays(false);
    setIsAddingSpecificDay(false);
  };

  const removeSpecificDayEvent = (id) => {
    setCalendarSettings(prev => ({
      ...prev,
      specificDayEvents: (prev.specificDayEvents || []).filter(e => e.id !== id)
    }));
  };

  const formatDateBR = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const getModeModeLabel = (mode) => {
    switch (mode) {
      case 'replace': return 'Substituir tudo';
      case 'add': return 'Acrescentar';
      case 'partial': return 'Modificar parcialmente';
      default: return mode;
    }
  };

  const getModeColor = (mode) => {
    switch (mode) {
      case 'replace': return 'bg-red-100 text-red-700';
      case 'add': return 'bg-blue-100 text-blue-700';
      case 'partial': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const specificDayEvents = calendarSettings.specificDayEvents || [];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h4 className="font-bold text-slate-700 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          Eventos de Dias Específicos
        </h4>
        <button
          onClick={() => setIsAddingSpecificDay(!isAddingSpecificDay)}
          className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700"
        >
          <Plus size={14} /> {isAddingSpecificDay ? 'Cancelar' : 'Novo Evento'}
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        Crie eventos pontuais para modificar a agenda em dias específicos (reuniões, eventos especiais, etc).
        Após criar, exporte o ICS incremental para sobrescrever o dia no seu calendário.
      </p>

      {isAddingSpecificDay && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <h5 className="font-semibold text-blue-800 text-sm">Adicionar Evento Específico</h5>

          <div className="flex items-center gap-2 bg-white border border-blue-200 rounded p-2">
            <input
              type="checkbox"
              id="isMultipleDays"
              checked={isMultipleDays}
              onChange={e => setIsMultipleDays(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="isMultipleDays" className="text-sm font-medium text-slate-700 cursor-pointer">
              Aplicar em múltiplos dias consecutivos
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-600 mb-1">
                {isMultipleDays ? 'Data Inicial' : 'Data do Evento'}
              </label>
              <input
                type="date"
                value={specificDayDate}
                onChange={e => setSpecificDayDate(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {isMultipleDays && (
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-600 mb-1">Data Final</label>
                <input
                  type="date"
                  value={specificDayEndDate}
                  onChange={e => setSpecificDayEndDate(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-600 mb-1">Título do Evento</label>
              <input
                type="text"
                value={specificDayTitle}
                onChange={e => setSpecificDayTitle(e.target.value)}
                placeholder="Ex: Reunião de Pais, Dia da Escola"
                className="border rounded px-2 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-600 mb-1">Horário de Início</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-600 mb-1">Horário de Término</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-600 mb-2">Tipo de Modificação</label>
            <div className="grid md:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setModificationMode('replace')}
                className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${modificationMode === 'replace'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <div className="font-semibold">Substituir Tudo</div>
                <div className="text-[10px] opacity-80 mt-0.5">Remove horário normal nas datas de evento</div>
              </button>
              <button
                type="button"
                onClick={() => setModificationMode('add')}
                className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${modificationMode === 'add'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <div className="font-semibold">Acrescentar</div>
                <div className="text-[10px] opacity-80 mt-0.5">Mantém horário + novo</div>
              </button>
              <button
                type="button"
                onClick={() => setModificationMode('partial')}
                className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${modificationMode === 'partial'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <div className="font-semibold">Modificar Parcialmente</div>
                <div className="text-[10px] opacity-80 mt-0.5">Altera períodos específicos</div>
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-600 mb-1">Descrição (opcional)</label>
            <textarea
              value={specificDayDescription}
              onChange={e => setSpecificDayDescription(e.target.value)}
              placeholder="Detalhes adicionais sobre o evento..."
              rows={3}
              className="border rounded px-2 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={addSpecificDayEvent}
            className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> Adicionar Evento
          </button>
        </div>
      )}

      {specificDayEvents.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-600 mb-2">Eventos Cadastrados</div>
          <div className="space-y-2">
            {specificDayEvents.map(evt => {
              const isMultiDay = evt.endDate && evt.endDate !== evt.date;
              return (
                <div
                  key={evt.id}
                  className="bg-sky-50 border border-sky-200 rounded-lg p-3 flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">
                        <Calendar size={12} />
                        {isMultiDay
                          ? `${formatDateBR(evt.date)} a ${formatDateBR(evt.endDate)}`
                          : formatDateBR(evt.date)
                        }
                      </span>
                      {evt.startTime && evt.endTime && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                          <Clock size={12} /> {evt.startTime} - {evt.endTime}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${getModeColor(evt.modificationMode || 'replace')}`}>
                        {getModeModeLabel(evt.modificationMode || 'replace')}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-800 text-sm mb-1">{evt.title}</div>
                    {evt.description && (
                      <p className="text-xs text-slate-600">{evt.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeSpecificDayEvent(evt.id)}
                    className="text-red-600 hover:text-red-700 p-1 shrink-0"
                    title="Remover"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {specificDayEvents.length === 0 && !isAddingSpecificDay && (
        <div className="text-center py-6 text-slate-400 text-sm">
          Nenhum evento de dia específico cadastrado ainda.
        </div>
      )}
    </div>
  );
};

const LessonCalculator = ({ data, calendarSettings }) => {
  const [start, setStart] = useState(calendarSettings.schoolYearStart || '');
  const [end, setEnd] = useState(calendarSettings.schoolYearEnd || '');
  const [selectedClass, setSelectedClass] = useState('all');
  const [expandedSubjects, setExpandedSubjects] = useState(new Set());

  const parseDate = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
    if (!schoolStart || !schoolEnd) return { map: new Map(), total: 0, details: new Map() };
    const [rs, re] = clampRange(parseDate(start), parseDate(end));
    const counts = new Map();
    // details: subjectId -> Map(dayIdx -> { dates: Set(YYYY-MM-DD), lessons: number })
    const details = new Map();
    let total = 0;

    Object.entries(data.schedule || {}).forEach(([key, slot]) => {
      const parts = key.split('-');
      const dayIdx = DAYS.indexOf(parts[1]);
      const slotIdx = parseInt(parts[2]);
      if (dayIdx === -1) return;
      const timeSlot = data.timeSlots[slotIdx];
      if (!timeSlot || timeSlot.type !== 'aula') return;

      // Filtrar por turma se selecionada
      if (selectedClass !== 'all' && slot.classId !== selectedClass) return;

      const subjectId = slot.subjectId;
      if (!subjectId) return;

      const jsWeekday = (dayIdx + 1) % 7; // 1..5 (Mon..Fri)
      const first = getFirstWeekdayOnOrAfter(rs, jsWeekday);

      for (let cursor = new Date(first); cursor <= re; cursor.setDate(cursor.getDate() + 7)) {
        if (cursor < rs) continue;
        if (isExcluded(cursor)) continue;

        // total e total por matéria
        counts.set(subjectId, (counts.get(subjectId) || 0) + 1);
        total += 1;

        // detalhes por dia da semana
        if (!details.has(subjectId)) details.set(subjectId, new Map());
        const subjectMap = details.get(subjectId);
        if (!subjectMap.has(dayIdx)) subjectMap.set(dayIdx, { dates: new Set(), lessons: 0 });
        const info = subjectMap.get(dayIdx);
        info.lessons += 1;
        info.dates.add(fmt(cursor));
      }
    });

    return { map: counts, total, details };
  }, [data.schedule, data.timeSlots, start, end, events, schoolStart, schoolEnd, selectedClass]);

  // Year and 4 bimesters (split into 4 equal ranges)
  const bimesterRanges = useMemo(() => {
    if (!schoolStart || !schoolEnd) return [];
    const ranges = [];
    const totalDays = Math.floor((schoolEnd - schoolStart) / (1000 * 60 * 60 * 24)) + 1;
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

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const classLabel = selectedClass === 'all' ? 'Todas as Turmas' : (data.classes.find(c => c.id === selectedClass)?.name || 'Turma');
    const periodStr = `${start || fmt(schoolStart)} a ${end || fmt(schoolEnd)}`;
    doc.setFontSize(14);
    doc.text('Contagem de Aulas por Matéria', 14, 16);
    doc.setFontSize(10);
    doc.text(`Turma: ${classLabel}`, 14, 22);
    doc.text(`Período: ${periodStr}`, 14, 27);

    const rows = subjectsList.map(s => [s.name, countBySubject.map.get(s.id) || 0]);
    autoTable(doc, {
      head: [['Matéria', 'Aulas no Período']],
      body: rows,
      startY: 32,
      styles: { fontSize: 10 }
    });

    const finalY = doc.lastAutoTable.finalY || 32;
    doc.setFontSize(10);
    doc.text(`Total de aulas: ${countBySubject.total}`, 14, finalY + 8);

    doc.save(`Contagem_Aulas_${classLabel.replace(/\s+/g, '_')}.pdf`);
  };

  const exportExcel = () => {
    let csvContent = "data:text/csv;charset=utf-8,Matéria,Aulas\n";
    subjectsList.forEach(s => {
      const count = countBySubject.map.get(s.id) || 0;
      csvContent += `${s.name},${count}\n`;
    });
    csvContent += `TOTAL,${countBySubject.total}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const classLabel = selectedClass === 'all' ? 'Todas_Turmas' : (data.classes.find(c => c.id === selectedClass)?.name || 'Turma');
    link.setAttribute("download", `Contagem_Aulas_${classLabel.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSubject = (subjectId) => {
    setExpandedSubjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subjectId)) {
        newSet.delete(subjectId);
      } else {
        newSet.add(subjectId);
      }
      return newSet;
    });
  };

  // Cores por dia da semana sem usar verde/roxo/rosa
  const colorByDay = (idx) => {
    switch (idx) {
      case 0: return 'bg-blue-100 text-blue-700';      // Segunda
      case 1: return 'bg-sky-100 text-sky-700';        // Terça
      case 2: return 'bg-amber-100 text-amber-700';    // Quarta
      case 3: return 'bg-orange-100 text-orange-700';  // Quinta
      case 4: return 'bg-cyan-100 text-cyan-700';      // Sexta
      default: return 'bg-slate-100 text-slate-700';
    }
  };



  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
      <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-600" /> Calculadora de Aulas</h4>
      <p className="text-[11px] text-slate-500">Selecione o período (bimestre) e a turma para contar aulas por matéria, já considerando eventos de exclusão.</p>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-600 mb-1">Turma</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500">
            <option value="all">Todas as Turmas</option>
            {data.classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-600 mb-1">Início do Período</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-slate-600 mb-1">Fim do Período</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded p-3">
          <div className="text-xs text-slate-500">Total no Período</div>
          <div className="text-2xl font-extrabold text-slate-800">{countBySubject.total}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-3 lg:col-span-2 flex items-center justify-between">
          <div className="text-xs text-slate-500">Exportação</div>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-emerald-700" title="Baixar planilha CSV"><FileText size={14} /> Excel</button>
            <button onClick={exportPDF} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700"><FileText size={14} /> PDF ({selectedClass === 'all' ? 'todas as turmas' : data.classes.find(c => c.id === selectedClass)?.name || 'turma'})</button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr>
              <th className="border p-2 bg-slate-50 w-8"></th>
              <th className="border p-2 bg-slate-50">Matéria</th>
              <th className="border p-2 bg-slate-50 w-32 text-right">Aulas</th>
            </tr>
          </thead>
          <tbody>
            {subjectsList.map(s => {
              const isExpanded = expandedSubjects.has(s.id);
              const subjectDetails = countBySubject.details.get(s.id);
              const totalCount = countBySubject.map.get(s.id) || 0;

              return (
                <React.Fragment key={s.id}>
                  <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => totalCount > 0 && toggleSubject(s.id)}>
                    <td className="border p-2 text-center text-slate-400">
                      {totalCount > 0 && (
                        <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                      )}
                    </td>
                    <td className="border p-2 font-medium">{s.name}</td>
                    <td className="border p-2 text-right font-semibold">{totalCount}</td>
                  </tr>
                  {isExpanded && subjectDetails && (
                    <tr>
                      <td colSpan="3" className="border-0 bg-slate-50">
                        <div className="px-6 py-3">
                          <div className="border border-slate-200 rounded-md bg-white p-3 shadow-sm text-[12px]">
                            <div className="text-[12px] text-slate-500 mb-2">Distribuição por dia da semana</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {Array.from(subjectDetails.entries()).map(([dayIdx, info]) => {
                                const daysQty = info.dates?.size || 0;
                                const lessonsQty = info.lessons || 0;
                                return (
                                  <div key={dayIdx} className="flex items-center justify-between px-3 py-2 rounded bg-slate-50 border border-slate-200">
                                    <span className="text-[12px] font-medium text-slate-700">{DAYS[dayIdx]}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] ${colorByDay(dayIdx)}`}><Calendar size={12} /> {daysQty} {daysQty === 1 ? 'dia' : 'dias'}</span>
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] ${colorByDay(dayIdx)}`}><BookOpen size={12} /> {lessonsQty} {lessonsQty === 1 ? 'aula' : 'aulas'}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AgendaSection;
