import React, { useState } from 'react';
import { Calendar, Plus, Trash2, Pencil, X } from 'lucide-react';
import { DAYS } from '../utils';
import { useDisplayPeriods } from '../hooks/useDisplayPeriods';
import { computeSlotShift } from '../utils/time';
import ExportButtons from './ExportButtons';
import { generateICSForClass, generateICSForTeacher } from '../utils/icsUtils';
import { getEntityColorStyle } from '../utils/colors';

const TimetableSection = ({ data, viewMode, selectedEntity, calendarSettings, setCalendarSettings, showAgendaControls = true, filterShift = 'Todos', filteredClassIds = null }) => {
  const displayPeriods = useDisplayPeriods({ data, viewMode, selectedEntity });
  // Se o filtro global for "Todos", aplica por padrão o Turno da entidade (quando disponível)
  let effectiveShift = filterShift;
  if (filterShift === 'Todos') {
    if (viewMode === 'class') {
      const cls = data.classes.find(c => c.id === selectedEntity);
      if (cls?.shift) effectiveShift = cls.shift;
    } else if (viewMode === 'teacher') {
      // Para professor, manter Todos por padrão (pode atuar em múltiplos turnos)
      effectiveShift = 'Todos';
    } else if (viewMode === 'subject') {
      // Matéria não possui turno próprio; manter Todos
      effectiveShift = 'Todos';
    } else if (viewMode === 'day') {
      // Dia mostra todas as turmas (filtrar por turno se necessário)
      effectiveShift = 'Todos';
    }
  }
  // Estado local do formulário de ano letivo e eventos
  const [schoolStart, setSchoolStart] = useState(calendarSettings.schoolYearStart || '');
  const [schoolEnd, setSchoolEnd] = useState(calendarSettings.schoolYearEnd || '');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [editingEventId, setEditingEventId] = useState(null);

  // Estado para eventos de dia específico (customização de grade)
  const [isAddingSpecificDay, setIsAddingSpecificDay] = useState(false);
  const [specificDayDate, setSpecificDayDate] = useState('');
  const [specificDayTitle, setSpecificDayTitle] = useState('');
  const [specificDayDescription, setSpecificDayDescription] = useState('');

  // Estado para eventos semanais do professor
  const [isAddingTeacherEvent, setIsAddingTeacherEvent] = useState(false);
  const [teacherEventTitle, setTeacherEventTitle] = useState('');
  const [teacherEventDayIdx, setTeacherEventDayIdx] = useState(0);
  const [teacherEventSlotIdx, setTeacherEventSlotIdx] = useState('');
  const [teacherEventColor, setTeacherEventColor] = useState('bg-orange-100 border-orange-300 text-orange-800');

  const TEACHER_EVENT_COLORS = [
    { name: 'Laranja', style: 'bg-orange-100 border-orange-300 text-orange-800' },
    { name: 'Teal', style: 'bg-teal-100 border-teal-300 text-teal-800' },
    { name: 'Azul', style: 'bg-blue-100 border-blue-300 text-blue-800' },
    { name: 'Roxo', style: 'bg-purple-100 border-purple-300 text-purple-800' },
    { name: 'Verde', style: 'bg-emerald-100 border-emerald-300 text-emerald-800' },
    { name: 'Rosa', style: 'bg-pink-100 border-pink-300 text-pink-800' },
  ];

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

  const addSpecificDayEvent = () => {
    if (!specificDayDate) {
      alert('Selecione a data do evento específico.');
      return;
    }
    if (!specificDayTitle.trim()) {
      alert('Informe um título para o evento.');
      return;
    }

    const newEvent = {
      id: Date.now().toString(),
      type: 'DiaEspecifico',
      date: specificDayDate,
      title: specificDayTitle.trim(),
      description: specificDayDescription.trim(),
      customSchedule: [] // Será preenchido na próxima etapa
    };

    setCalendarSettings(prev => ({
      ...prev,
      specificDayEvents: [...(prev.specificDayEvents || []), newEvent]
    }));

    // Reset form
    setSpecificDayDate('');
    setSpecificDayTitle('');
    setSpecificDayDescription('');
    setIsAddingSpecificDay(false);
  };

  const removeSpecificDayEvent = (id) => {
    setCalendarSettings(prev => ({
      ...prev,
      specificDayEvents: (prev.specificDayEvents || []).filter(e => e.id !== id)
    }));
  };

  const addTeacherEvent = () => {
    if (!teacherEventTitle.trim()) { alert('Informe o título do evento.'); return; }
    if (teacherEventSlotIdx === '') { alert('Selecione o horário.'); return; }

    const newEvent = {
      id: Date.now().toString(),
      teacherId: selectedEntity,
      title: teacherEventTitle.trim(),
      dayIdx: parseInt(teacherEventDayIdx),
      slotIdx: parseInt(teacherEventSlotIdx),
      color: teacherEventColor
    };

    setCalendarSettings(prev => ({
      ...prev,
      teacherFixedEvents: [...(prev.teacherFixedEvents || []), newEvent]
    }));

    setTeacherEventTitle('');
    setIsAddingTeacherEvent(false);
  };

  const removeTeacherEvent = (id) => {
    setCalendarSettings(prev => ({
      ...prev,
      teacherFixedEvents: (prev.teacherFixedEvents || []).filter(e => e.id !== id)
    }));
  };

  // Handlers movidos para componente de botões.

  // Resolver nome da entidade para o cabeçalho de impressão
  const getEntityName = () => {
    if (!selectedEntity) return 'Grade Geral';
    if (viewMode === 'class') return data.classes.find(c => c.id === selectedEntity)?.name || 'Turma';
    if (viewMode === 'teacher') return data.teachers.find(t => t.id === selectedEntity)?.name || 'Professor';
    if (viewMode === 'subject') return data.subjects.find(s => s.id === selectedEntity)?.name || 'Matéria';
    if (viewMode === 'day') return selectedEntity || 'Dia';
    return 'Grade';
  };

  const getEntityLabel = () => {
    if (viewMode === 'class') return 'Turma';
    if (viewMode === 'teacher') return 'Professor';
    if (viewMode === 'subject') return 'Disciplina';
    if (viewMode === 'day') return 'Dia';
    return '';
  };

  const entityName = getEntityName();
  const entityLabel = getEntityLabel();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      {showAgendaControls ? (
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100 flex flex-col gap-6 print:hidden">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600" /> Agenda Escolar</h3>
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
                <button onClick={addEvent} className={`flex items-center gap-1 ${editingEventId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white px-3 py-2 rounded text-sm font-medium shadow-sm`}>
                  {editingEventId ? <Pencil size={16} /> : <Plus size={16} />}
                  {editingEventId ? ' Atualizar Evento' : ' Adicionar Evento'}
                </button>
                {editingEventId && (
                  <button onClick={cancelEditing} className="flex items-center gap-1 bg-slate-300 text-slate-700 px-3 py-2 rounded text-sm font-medium hover:bg-slate-400 shadow-sm">
                    <X size={16} /> Cancelar
                  </button>
                )}
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
              <p className="text-xs text-slate-600 leading-relaxed"><span className="font-semibold text-slate-700">Como funciona:</span> Cada aula prevista no horário é exportada semanalmente para o arquivo .ics até o fim do ano letivo. Os períodos marcados como <span className="font-semibold">Férias</span> ou <span className="font-semibold">Feriado</span> excluem essas aulas automaticamente, mantendo sua agenda limpa.</p>
            </div>
          </div>

          {/* NOVA SEÇÃO: Eventos de Dia Específico */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <h4 className="font-bold text-emerald-800 text-base">Eventos de Dia Específico</h4>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              <span className="font-semibold text-emerald-700">Sobrescrever grade de um dia:</span> Crie eventos para dias específicos (ex: reunião, formatura, apresentação) que substituem a grade normal.
              Depois baixe um .ics incremental apenas com esses dias para atualizar sua agenda.
            </p>

            {!isAddingSpecificDay ? (
              <button
                onClick={() => setIsAddingSpecificDay(true)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm flex items-center gap-2 transition-colors"
              >
                <Plus size={16} /> Criar Evento de Dia Específico
              </button>
            ) : (
              <div className="bg-white rounded-lg p-4 border border-emerald-300 shadow-sm space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-700 mb-1">Data do Evento</label>
                    <input
                      type="date"
                      value={specificDayDate}
                      onChange={e => setSpecificDayDate(e.target.value)}
                      className="border rounded px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-700 mb-1">Título do Evento</label>
                    <input
                      type="text"
                      value={specificDayTitle}
                      onChange={e => setSpecificDayTitle(e.target.value)}
                      placeholder="Ex: Reunião de Pais, Formatura, etc."
                      className="border rounded px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-700 mb-1">Descrição (Opcional)</label>
                  <textarea
                    value={specificDayDescription}
                    onChange={e => setSpecificDayDescription(e.target.value)}
                    placeholder="Descreva o evento e como a grade será modificada..."
                    rows="2"
                    className="border rounded px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addSpecificDayEvent}
                    className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-emerald-700 flex items-center gap-1"
                  >
                    <Plus size={16} /> Adicionar
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingSpecificDay(false);
                      setSpecificDayDate('');
                      setSpecificDayTitle('');
                      setSpecificDayDescription('');
                    }}
                    className="bg-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-medium hover:bg-slate-400"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de eventos específicos cadastrados */}
            {calendarSettings.specificDayEvents && calendarSettings.specificDayEvents.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-bold text-emerald-700 mb-2">Eventos Específicos Cadastrados</div>
                <ul className="divide-y divide-emerald-100 bg-white border border-emerald-200 rounded-lg shadow-sm">
                  {calendarSettings.specificDayEvents.map(ev => (
                    <li key={ev.id} className="flex items-start justify-between px-4 py-3 hover:bg-emerald-50 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar size={14} className="text-emerald-600" />
                          <span className="font-bold text-slate-800 text-sm">{ev.title}</span>
                        </div>
                        <div className="text-xs text-slate-600">
                          <span className="font-semibold">Data:</span> {new Date(ev.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                        {ev.description && (
                          <p className="text-xs text-slate-500 mt-1 italic">{ev.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => removeSpecificDayEvent(ev.id)}
                          className="text-red-500 hover:text-red-700 p-1 transition-colors"
                          title="Remover evento"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-slate-500 mt-2 italic">
                  💡 Dica: Após criar eventos, vá em "Agenda e Grade" para baixar o .ics incremental apenas com esses dias.
                </p>
              </div>
            )}
          </div>

          {/* NOVA SEÇÃO: Eventos Semanais do Professor (Somente Visão Professor) */}
          {viewMode === 'teacher' && selectedEntity && (
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h4 className="font-bold text-indigo-800 text-base">Eventos Semanais do Professor</h4>
              </div>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                Adicione compromissos que se repetem toda semana (ex: Almoço, Café, Reunião ATPCG) apenas para este professor.
              </p>

              {!isAddingTeacherEvent ? (
                <button
                  onClick={() => setIsAddingTeacherEvent(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm flex items-center gap-2 transition-colors"
                >
                  <Plus size={16} /> Adicionar Evento Semanal
                </button>
              ) : (
                <div className="bg-white rounded-lg p-4 border border-indigo-300 shadow-sm space-y-3">
                  <div className="grid md:grid-cols-4 gap-3">
                    <div className="flex flex-col md:col-span-2">
                      <label className="text-xs font-semibold text-slate-700 mb-1">Título (Ex: Almoço)</label>
                      <input
                        type="text"
                        value={teacherEventTitle}
                        onChange={e => setTeacherEventTitle(e.target.value)}
                        placeholder="Nome do evento..."
                        className="border rounded px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-indigo-500"
                        list="common-events"
                      />
                      <datalist id="common-events">
                        <option value="Reunião ATPCG" />
                        <option value="Reunião ATPCA" />
                        <option value="Horário de Estudo" />
                        <option value="Multiplica" />
                        <option value="Almoço" />
                        <option value="Café" />
                      </datalist>
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-700 mb-1">Dia</label>
                      <select
                        value={teacherEventDayIdx}
                        onChange={e => setTeacherEventDayIdx(e.target.value)}
                        className="border rounded px-2 py-2 text-sm bg-slate-50"
                      >
                        {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-700 mb-1">Horário</label>
                      <select
                        value={teacherEventSlotIdx}
                        onChange={e => setTeacherEventSlotIdx(e.target.value)}
                        className="border rounded px-2 py-2 text-sm bg-slate-50"
                      >
                        <option value="">Selecione...</option>
                        {data.timeSlots.map((slot, i) => (
                          <option key={i} value={i}>{slot.start} - {slot.end} ({slot.type})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-700 mb-2">Cor do Evento</label>
                    <div className="flex flex-wrap gap-2">
                      {TEACHER_EVENT_COLORS.map(c => (
                        <button
                          key={c.style}
                          onClick={() => setTeacherEventColor(c.style)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${c.style.split(' ')[0]} ${teacherEventColor === c.style ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={addTeacherEvent}
                      className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 flex items-center gap-1"
                    >
                      <Plus size={16} /> Adicionar
                    </button>
                    <button
                      onClick={() => setIsAddingTeacherEvent(false)}
                      className="bg-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-medium hover:bg-slate-400"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de eventos semanais do professor */}
              {calendarSettings.teacherFixedEvents && calendarSettings.teacherFixedEvents.filter(e => e.teacherId === selectedEntity).length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-bold text-indigo-700 mb-2">Eventos Semanais deste Professor</div>
                  <ul className="divide-y divide-indigo-100 bg-white border border-indigo-200 rounded-lg shadow-sm">
                    {calendarSettings.teacherFixedEvents
                      .filter(e => e.teacherId === selectedEntity)
                      .map(ev => (
                        <li key={ev.id} className="flex items-center justify-between px-4 py-2 hover:bg-indigo-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${ev.color.split(' ')[0]}`} />
                            <div className="text-xs">
                              <span className="font-bold text-slate-800">{ev.title}</span>
                              <span className="text-slate-500 ml-2">
                                {DAYS[ev.dayIdx]} o {data.timeSlots[ev.slotIdx]?.start}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeTeacherEvent(ev.id)}
                            className="text-red-500 hover:text-red-700 p-1 transition-colors"
                            title="Remover evento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:hidden">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
              <Calendar size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{entityLabel}</span>
              <h3 className="text-lg font-bold text-slate-800 leading-none">{entityName}</h3>
            </div>
          </div>
        </div>
      )}

      {/* Container de Impressão */}
      <div className="p-4 overflow-x-auto printable-schedule">

        {/* Cabeçalho exclusivo de impressão */}
        <div className="hidden print:flex flex-col mb-4 border-b-2 border-slate-800 pb-2">
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Grade Horária Escolar</h1>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold uppercase text-slate-500 tracking-wider bg-slate-100 px-2 py-0.5 rounded">{entityLabel}</span>
              <span className="text-xl font-bold text-indigo-900">{entityName}</span>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr>
              <th className="border p-2 bg-slate-50">Horário</th>
              {viewMode === 'day'
                ? (
                  // Logic to show Classes as columns
                  data.classes
                    .filter(c => {
                      if (effectiveShift === 'Todos') return true;
                      if (effectiveShift === 'Integral (Manhã e Tarde)') return c.shift === 'Manhã' || c.shift === 'Tarde' || c.shift === 'Integral (Manhã e Tarde)';
                      if (effectiveShift === 'Integral (Tarde e Noite)') return c.shift === 'Tarde' || c.shift === 'Noite' || c.shift === 'Integral (Tarde e Noite)';
                      return c.shift === effectiveShift;
                    })
                    .filter(c => filteredClassIds === null || filteredClassIds.includes(c.id)) // NEW FILTER
                    .map(c => <th key={c.id} className="border p-2 bg-slate-50 min-w-[120px]">{c.name}</th>)
                )
                : DAYS.map(d => <th key={d} className="border p-2 bg-slate-50">{d}</th>)
              }
            </tr>
          </thead>
          <tbody>
            {displayPeriods
              .filter(slot => {
                if (effectiveShift === 'Todos') return true;

                const slotShift = computeSlotShift(slot);
                if (effectiveShift === 'Integral (Manhã e Tarde)') {
                  return slotShift === 'Manhã' || slotShift === 'Tarde' || slotShift === 'Integral (Manhã e Tarde)';
                }
                if (effectiveShift === 'Integral (Tarde e Noite)') {
                  return slotShift === 'Tarde' || slotShift === 'Noite' || slotShift === 'Integral (Tarde e Noite)';
                }

                return slotShift === effectiveShift;
              })
              .map((slot, idx) => {
                const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
                return (
                  <tr key={slot.id}>
                    <td className="border p-2 font-bold whitespace-nowrap">{slot.start} - {slot.end}</td>
                    {slot.type !== 'aula' ? (
                      <td colSpan={viewMode === 'day' ?
                        (filteredClassIds === null ? data.classes.length : filteredClassIds.length)
                        : 5} className="border p-2 text-center bg-slate-100 text-slate-500 font-bold uppercase">
                        {slot.type}
                      </td>
                    ) : (
                      (viewMode === 'day' ? (
                        data.classes
                          .filter(c => {
                            if (effectiveShift === 'Todos') return true;
                            if (effectiveShift === 'Integral (Manhã e Tarde)') return c.shift === 'Manhã' || c.shift === 'Tarde' || c.shift === 'Integral (Manhã e Tarde)';
                            if (effectiveShift === 'Integral (Tarde e Noite)') return c.shift === 'Tarde' || c.shift === 'Noite' || c.shift === 'Integral (Tarde e Noite)';
                            return c.shift === effectiveShift;
                          })
                          .filter(c => filteredClassIds === null || filteredClassIds.includes(c.id)) // NEW FILTER: null=all, []=none
                          .map(c => {
                            // DAY VIEW: Iterate over Classes
                            // selectedEntity holds the Day Name (e.g., "Segunda-feira")
                            const dayName = selectedEntity || DAYS[0]; // Default to monday if not set
                            const timeKey = `${dayName}-${absoluteIndex}`; // Correct: Format is ClassId-Day-SlotIndex
                            const scheduleKey = `${c.id}-${timeKey}`; // e.g. "CLASS123-Segunda-feira-0"

                            const entry = data.schedule[scheduleKey];
                            let cellContent = null;

                            if (entry) {
                              const subj = data.subjects.find(s => s.id === entry.subjectId);
                              const teacher = data.teachers.find(t => t.id === entry.teacherId);
                              cellContent = (
                                <div className="text-xs p-1 rounded" style={getEntityColorStyle(subj?.id, subj?.name)}>
                                  <div className="font-bold">{subj?.name}</div>
                                  <div className="opacity-75">{teacher?.name}</div>
                                </div>
                              );
                            }
                            return <td key={c.id} className="border p-2 min-w-[120px]">{cellContent}</td>;
                          })
                      ) : (
                        // NORMAL MODES: Iterate over DAYS
                        DAYS.map((_, dayIdx) => {
                          const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;
                          let cellContent = null;

                          if (viewMode === 'class') {
                            const scheduleKey = `${selectedEntity}-${timeKey}`;
                            const entry = data.schedule[scheduleKey];
                            if (entry) {
                              const subj = data.subjects.find(s => s.id === entry.subjectId);
                              const teacher = data.teachers.find(t => t.id === entry.teacherId);
                              cellContent = (
                                <div className="text-xs p-1 rounded" style={getEntityColorStyle(subj?.id, subj?.name)}>
                                  <div className="font-bold">{subj?.name}</div>
                                  <div className="opacity-75">{teacher?.name}</div>
                                </div>
                              );
                            }
                          } else if (viewMode === 'teacher') {
                            // Primeiro verifica se há um evento semanal personalizado para este professor/slot
                            const fixedEvt = (calendarSettings.teacherFixedEvents || []).find(
                              e => e.teacherId === selectedEntity && e.dayIdx === dayIdx && e.slotIdx === absoluteIndex
                            );

                            if (fixedEvt) {
                              cellContent = (
                                <div className={`text-[11px] p-1 rounded border shadow-sm font-bold h-full flex flex-col justify-center text-center ${fixedEvt.color}`}>
                                  {fixedEvt.title}
                                </div>
                              );
                            } else {
                              const entry = Object.entries(data.schedule).find(([key, val]) => val.teacherId === selectedEntity && val.timeKey === timeKey);
                              if (entry) {
                                const item = entry[1];
                                const subj = data.subjects.find(s => s.id === item.subjectId);
                                const cls = data.classes.find(c => c.id === item.classId);
                                cellContent = (
                                  <div className="text-xs p-1 rounded" style={getEntityColorStyle(subj?.id, subj?.name)}>
                                    <div className="font-bold">{subj?.name}</div>
                                    <div className="opacity-75">{cls?.name}</div>
                                  </div>
                                );
                              }
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
                      ))
                    )}
                  </tr>
                );
              })}
            {displayPeriods.filter(slot => {
              if (effectiveShift === 'Todos') return true;
              if (effectiveShift.startsWith('Integral')) return slot.shift === effectiveShift;
              return computeSlotShift(slot) === effectiveShift;
            }).length === 0 && (
                <tr>
                  <td colSpan={6} className="border p-4 text-center text-slate-500 bg-slate-50">
                    Nenhum horário para o Turno selecionado.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimetableSection;
