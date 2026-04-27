import React, { useMemo, useState, useRef } from 'react';
import { Plus, Check, X, Trash2, Clock, BookOpen, Star, Save, Coffee, Utensils, Sun, Sunset, Moon, Layers, Users, Edit2, Settings, HelpCircle, Download, FileText, Calculator, Calendar, Printer, Pencil } from 'lucide-react';
import { uid, DAYS } from '../utils';
import { generateICSForClass, generateICSForTeacher } from '../utils/icsUtils';

const AgendaSection = ({ data, calendarSettings, setCalendarSettings }) => {
  const [schoolStart, setSchoolStart] = useState(calendarSettings.schoolYearStart || '');
  const [schoolEnd, setSchoolEnd] = useState(calendarSettings.schoolYearEnd || '');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [editingEventId, setEditingEventId] = useState(null);

  // Estados para Eventos Semanais de Professores
  const [teacherEventOpenId, setTeacherEventOpenId] = useState(null);
  const [twTitle, setTwTitle] = useState('');
  const [twDay, setTwDay] = useState(0);
  const [twSlot, setTwSlot] = useState('');
  const [twStart, setTwStart] = useState('');
  const [twEnd, setTwEnd] = useState('');
  const [twColor, setTwColor] = useState('bg-orange-100 border-orange-300 text-orange-800');

  const [isPEIFullWeek, setIsPEIFullWeek] = useState(false);

  // Timers para Debounce das cores nativas a fim de evitar sobrecarga no TanStack Query
  const classColorTimer = useRef(null);
  const studyColorTimer = useRef(null);

  const handleClassColorInput = (e) => {
    const val = e.target.value;
    e.currentTarget.parentElement.style.backgroundColor = val;
    if (classColorTimer.current) clearTimeout(classColorTimer.current);
    classColorTimer.current = setTimeout(() => {
      setCalendarSettings(p => ({...p, defaultClassColor: val}));
    }, 400);
  };

  const handleStudyColorInput = (e) => {
    const val = e.target.value;
    e.currentTarget.parentElement.style.backgroundColor = val;
    if (studyColorTimer.current) clearTimeout(studyColorTimer.current);
    studyColorTimer.current = setTimeout(() => {
      setCalendarSettings(p => ({...p, defaultStudyColor: val}));
    }, 400);
  };

  // Estados para Inserção Coletiva
  const [collectiveTitle, setCollectiveTitle] = useState('');
  const [collectiveDay, setCollectiveDay] = useState(0);
  const [collectiveSlot, setCollectiveSlot] = useState('');
  const [collectiveStart, setCollectiveStart] = useState('');
  const [collectiveEnd, setCollectiveEnd] = useState('');
  const [collectiveTeachers, setCollectiveTeachers] = useState([]);

  const TE_COLORS = [
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

  const addTeacherWeeklyEvent = (teacherId) => {
    if (!twTitle.trim()) { alert('Informe o título.'); return; }
    if (twSlot === '' && (!twStart || !twEnd)) { alert('Selecione o horário ou informe o Início/Fim.'); return; }

    const newEvt = {
      id: Date.now().toString() + Math.random(),
      teacherId,
      title: twTitle.trim(),
      dayIdx: parseInt(twDay),
      slotIdx: twSlot === '' ? null : parseInt(twSlot),
      startTime: twStart,
      endTime: twEnd,
      color: twColor
    };

    setCalendarSettings(prev => ({
      ...prev,
      teacherFixedEvents: [...(prev.teacherFixedEvents || []), newEvt]
    }));

    setTwTitle('');
  };

  const removeTeacherWeeklyEvent = (id) => {
    setCalendarSettings(prev => ({
      ...prev,
      teacherFixedEvents: (prev.teacherFixedEvents || []).filter(e => e.id !== id)
    }));
  };

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const getSlotShift = (slot) => {
    if (slot.shift && slot.shift !== '') return slot.shift;
    const startMins = timeToMinutes(slot.start);
    if (startMins < 12 * 60 + 30) return 'Manhã';
    if (startMins < 18 * 60) return 'Tarde';
    return 'Noite';
  };

  const checkOverlap = (startA, endA, startB, endB) => {
    return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
  };

  const autoFillStudyTime = (teacherId) => {
    if (!data.timeSlots || data.timeSlots.length === 0) return;

    const teacher = data.teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const teacherShiftSet = new Set(teacher.shifts || []);
    const hasIntegral = Array.from(teacherShiftSet).some(s => s.startsWith('Integral'));

    const existingEvents = calendarSettings.teacherFixedEvents || [];
    const newEvents = [];
    const DAYS_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

    DAYS_NAMES.forEach((day, dayIdx) => {
      // Se não é semana PEI, verificar se o professor tem aula neste dia
      if (!isPEIFullWeek) {
        const hasClassThisDay = Object.values(data.schedule || {}).some(
          s => s.teacherId === teacherId && s.timeKey.startsWith(`slot-${day}-`)
        );
        if (!hasClassThisDay) return;
      }

      data.timeSlots.forEach((slot, slotIdx) => {
        if (slot.type !== 'aula') return;

        // Verifica turno
        const slotShift = getSlotShift(slot);
        const matchesShift = teacherShiftSet.has(slotShift) || hasIntegral;
        if (!matchesShift) return;

        // Verifica se professor já tem aula na grade neste horário ou se há *sobreposição* de relógio (escolas com turnos entrelaçados)
        const hasClassOverlap = Object.values(data.schedule || {}).some(s => {
          if (s.teacherId !== teacherId) return false;
          
          // Confere se a aula cai no mesmo dia
          const sDay = s.timeKey.split('-')[0];
          if (sDay !== day) return false;

          // Extrai o índice do slot da aula real
          const sSlotIdx = parseInt(s.timeKey.split('-')[1], 10);
          const classSlot = data.timeSlots[sSlotIdx];
          if (!classSlot) return false;

          // Se a aula fisicamente sobrepoe o tempo deste slot vazio atual, nós consideramos ele bloqueado (overlap cruzado na grade de horários da escola)
          return checkOverlap(slot.start, slot.end, classSlot.start, classSlot.end);
        });

        if (!hasClassOverlap) {
          // Detectar colisão com eventos individuais (Horário de Estudo ou Almoço)
          const hasOverlap = existingEvents.some(e => {
            if (e.teacherId !== teacherId || e.dayIdx !== dayIdx) return false;
            // Colisão óbvia de slot
            if (e.slotIdx !== undefined && e.slotIdx !== null && e.slotIdx === slotIdx) return true;
            // Colisão temporal (Overlap numérico)
            const eStart = e.startTime || (e.slotIdx !== null ? data.timeSlots[e.slotIdx]?.start : '00:00');
            const eEnd = e.endTime || (e.slotIdx !== null ? data.timeSlots[e.slotIdx]?.end : '00:00');
            return checkOverlap(slot.start, slot.end, eStart, eEnd);
          });

          if (!hasOverlap) {
            newEvents.push({
              id: `auto-${teacherId}-${dayIdx}-${slotIdx}-${Date.now()}`,
              teacherId,
              title: "Horário de Estudo",
              dayIdx,
              slotIdx,
              startTime: slot.start,
              endTime: slot.end,
              color: calendarSettings.defaultStudyColor || 'bg-slate-200 border-slate-300 text-slate-700'
            });
          }
        }
      });
    });

    if (newEvents.length === 0) {
      alert("Não há horários disponíveis no turno do professor para preencher ou os espaços já estão ocupados.");
      return;
    }

    setCalendarSettings(prev => ({
      ...prev,
      teacherFixedEvents: [...(prev.teacherFixedEvents || []), ...newEvents]
    }));
  };

  const addCollectiveEvent = () => {
    if (!collectiveTitle.trim()) { alert('Informe o título (Ex: ATPCG).'); return; }
    if (collectiveSlot === '' && (!collectiveStart || !collectiveEnd)) { alert('Selecione o horário ou digite Início e Fim.'); return; }
    if (collectiveTeachers.length === 0) { alert('Selecione ao menos um professor.'); return; }

    const newEvents = collectiveTeachers.map(teacherId => ({
      id: Date.now().toString() + Math.random(),
      teacherId,
      title: collectiveTitle.trim(),
      dayIdx: parseInt(collectiveDay),
      slotIdx: collectiveSlot === '' ? null : parseInt(collectiveSlot),
      startTime: collectiveStart,
      endTime: collectiveEnd,
      color: 'bg-indigo-100 border-indigo-300 text-indigo-800'
    }));

    setCalendarSettings(prev => ({
      ...prev,
      teacherFixedEvents: [...(prev.teacherFixedEvents || []), ...newEvents]
    }));

    setCollectiveTitle('');
    setCollectiveTeachers([]);
    alert(`Evento atribuído a ${collectiveTeachers.length} professores com sucesso!`);
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
      <div className="bg-white border border-sky-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
        <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600" /> Agendas por Turma</h4>
        <p className="text-[11px] text-slate-500">Baixe a agenda individual de cada turma já considerando férias e feriados cadastrados.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...data.classes].sort((a, b) => a.name.localeCompare(b.name)).map(cls => (
            <div key={cls.id} className="border border-sky-100 rounded-lg p-3 flex items-center justify-between bg-sky-50/30 hover:bg-white hover:border-sky-300 hover:shadow-md transition-all">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">{cls.name}</span>
                <span className="text-[10px] text-slate-500">Turno: {cls.shift}</span>
              </div>
              <button onClick={() => generateICSForClass(data, calendarSettings, cls.id)} className="flex items-center gap-1 bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-700"><Download size={14} /> Agenda</button>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border border-sky-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
        <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-3">
          <div>
            <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calendar className="w-5 h-5 text-sky-600" /> Agendas por Professor</h4>
            <p className="text-[11px] text-slate-500">Baixe a agenda individual de cada professor já considerando férias e feriados cadastrados.</p>
          </div>
          
          <div className="flex gap-6 p-3 bg-white border border-sky-100 rounded-xl shadow-sm items-center">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-tight">Estilo Aulas</span>
              <label 
                className="flex w-8 h-8 rounded-full border-2 border-slate-200 shadow-md cursor-pointer hover:scale-110 hover:shadow-lg transition-all"
                style={{ backgroundColor: (calendarSettings.defaultClassColor?.startsWith('#')) ? calendarSettings.defaultClassColor : '#EAB308' }}
                title="Alterar Cor Padrão das Aulas"
              >
                <input 
                  type="color" 
                  value={(calendarSettings.defaultClassColor?.startsWith('#')) ? calendarSettings.defaultClassColor : '#eab308'}
                  onInput={handleClassColorInput}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="w-px h-6 bg-sky-200"></div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-tight">Auto Estudos</span>
              <label 
                className="flex w-8 h-8 rounded-full border-2 border-slate-200 shadow-md cursor-pointer hover:scale-110 hover:shadow-lg transition-all"
                style={{ backgroundColor: (calendarSettings.defaultStudyColor?.startsWith('#')) ? calendarSettings.defaultStudyColor : '#94A3B8' }}
                title="Alterar Cor Automática dos Estudos"
              >
                <input 
                  type="color" 
                  value={(calendarSettings.defaultStudyColor?.startsWith('#')) ? calendarSettings.defaultStudyColor : '#94a3b8'}
                  onInput={handleStudyColorInput}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...data.teachers].sort((a, b) => a.name.localeCompare(b.name)).map(teacher => {
            const isExpanded = teacherEventOpenId === teacher.id;
            const myEvents = (calendarSettings.teacherFixedEvents || []).filter(e => e.teacherId === teacher.id);

            return (
              <div key={teacher.id} className="border border-sky-100 rounded-lg overflow-hidden flex flex-col bg-sky-50/30 hover:bg-white hover:border-sky-300 hover:shadow-md transition-all">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-700">{teacher.name}</span>
                    <span className="text-[10px] text-slate-500">Turnos: {teacher.shifts?.join(', ') || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setTeacherEventOpenId(isExpanded ? null : teacher.id);
                        if (!isExpanded) setTwTitle('');
                      }}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${isExpanded ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      title="Gerenciar Almoço, Café e Eventos Semanais"
                    >
                      <Clock size={14} />
                      {myEvents.length > 0 ? `${myEvents.length} Eventos` : 'Eventos'}
                    </button>
                    <button onClick={() => generateICSForTeacher(data, calendarSettings, teacher.id)} className="flex items-center gap-1 bg-emerald-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-emerald-700 shadow-sm"><Download size={14} /> Agenda</button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-3 bg-white border-t border-slate-100 flex flex-col gap-3">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Novo Evento Semanal</div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className="flex flex-col col-span-2">
                        <input
                          type="text"
                          value={twTitle}
                          onChange={e => setTwTitle(e.target.value)}
                          placeholder="Almoço, Café, ATPCG..."
                          className="border rounded px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-500"
                          list="teacher-event-suggestions"
                        />
                        <datalist id="teacher-event-suggestions">
                          <option value="Almoço" />
                          <option value="Café" />
                          <option value="Reunião ATPCG" />
                          <option value="Reunião ATPCA" />
                          <option value="Horário de Estudo" />
                          <option value="Multiplica" />
                        </datalist>
                      </div>
                      <select value={twDay} onChange={e => setTwDay(e.target.value)} className="border rounded px-2 py-1.5 text-xs bg-slate-50">
                        {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      </select>
                      <select
                        value={twSlot}
                        onChange={e => {
                          const idx = e.target.value;
                          setTwSlot(idx);
                          if (idx !== '' && data.timeSlots[idx]) {
                            setTwStart(data.timeSlots[idx].start);
                            setTwEnd(data.timeSlots[idx].end);
                          }
                        }}
                        className="border rounded px-2 py-1.5 text-xs bg-slate-50"
                      >
                        <option value="">(Horário Personalizado / Livre)</option>
                        {data.timeSlots.map((ts, i) => <option key={i} value={i}>{ts.start} ({ts.type})</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Início do Evento</label>
                        <input
                          type="time"
                          value={twStart}
                          onChange={e => setTwStart(e.target.value)}
                          className="border rounded px-2 py-1.5 text-xs bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Fim do Evento</label>
                        <input
                          type="time"
                          value={twEnd}
                          onChange={e => setTwEnd(e.target.value)}
                          className="border rounded px-2 py-1.5 text-xs bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-50 pt-3">
                      <div className="flex gap-1.5">
                        {TE_COLORS.map(c => (
                          <button
                            key={c.style}
                            onClick={() => setTwColor(c.style)}
                            className={`w-5 h-5 rounded-full border shadow-sm transition-transform ${c.style.split(' ')[0]} ${twColor === c.style ? 'scale-125 border-slate-600 ring-2 ring-indigo-200' : 'border-transparent hover:scale-110'}`}
                          />
                        ))}
                      </div>
                      <button onClick={() => addTeacherWeeklyEvent(teacher.id)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-indigo-700 transition-colors">Adicionar</button>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5 space-y-2">
                      <p className="text-[10px] text-indigo-700 leading-tight">
                        <span className="font-bold">Dica:</span> Clique abaixo para preencher automaticamente todos os horários vagos pertencentes ao <b>Turno</b> deste professor com "Horário de Estudo".
                      </p>
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-800 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={isPEIFullWeek}
                          onChange={e => setIsPEIFullWeek(e.target.checked)}
                          className="w-3.5 h-3.5 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500"
                        />
                        Preencher também dias inteiros sem aula (Regime PEI)
                      </label>
                      <button
                        onClick={() => autoFillStudyTime(teacher.id)}
                        className="w-full bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                      >
                        <Edit2 size={14} /> Autopreencher "H. Estudo"
                      </button>
                    </div>

                    {myEvents.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {myEvents.map(evt => {
                          const isHex = evt.color && evt.color.startsWith('#');
                          return (
                          <div key={evt.id} className="flex items-center justify-between p-2 rounded border border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-2">
                              <div 
                                className={`w-2 h-2 rounded-full ${isHex ? '' : evt.color.split(' ')[0]}`}
                                style={isHex ? { backgroundColor: evt.color } : undefined}
                              />
                              <span className="text-xs font-bold text-slate-700">{evt.title}</span>
                              <span className="text-[10px] text-slate-500 uppercase tracking-tighter">— {DAYS[evt.dayIdx]}, {data.timeSlots[evt.slotIdx]?.start}</span>
                            </div>
                            <button onClick={() => removeTeacherWeeklyEvent(evt.id)} className="text-red-400 hover:text-red-600 p-0.5"><Trash2 size={12} /></button>
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inserção Coletiva de Eventos */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-slate-700 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Inserção Coletiva de Eventos (Coordenação)
          </h4>
        </div>
        <p className="text-[11px] text-slate-500">
          Adicione reuniões ou apontamentos semanais (ex: ATPCG, Evento Conjunto) para múltiplos professores de uma só vez.
        </p>
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex flex-col col-span-2">
              <label className="text-xs font-semibold text-slate-600 mb-1">Título do Evento</label>
              <input
                type="text"
                value={collectiveTitle}
                onChange={e => setCollectiveTitle(e.target.value)}
                placeholder="Exemplo: Reunião ATPCG"
                className="border rounded px-2 py-1.5 text-sm bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-600 mb-1">Dia da Semana</label>
              <select value={collectiveDay} onChange={e => setCollectiveDay(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-white">
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-600 mb-1">Horário (Slot)</label>
              <select
                value={collectiveSlot}
                onChange={e => {
                  const idx = e.target.value;
                  setCollectiveSlot(idx);
                  if (idx !== '' && data.timeSlots[idx]) {
                    setCollectiveStart(data.timeSlots[idx].start);
                    setCollectiveEnd(data.timeSlots[idx].end);
                  }
                }}
                className="border rounded px-2 py-1.5 text-sm bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              >
                <option value="">(Horário Personalizado / Livre)</option>
                {data.timeSlots.map((ts, i) => <option key={i} value={i}>{ts.start} ({ts.type})</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-purple-200">
             <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-600 mb-1">Início do Evento</label>
                <input
                  type="time"
                  value={collectiveStart}
                  onChange={e => setCollectiveStart(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm bg-white focus:border-purple-500"
                />
             </div>
             <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-600 mb-1">Fim do Evento</label>
                <input
                  type="time"
                  value={collectiveEnd}
                  onChange={e => setCollectiveEnd(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm bg-white focus:border-purple-500"
                />
             </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Selecione os Professores ({collectiveTeachers.length} marcados)</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCollectiveTeachers(data.teachers.map(t => t.id))}
                  className="text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded"
                >Selecionar Todos</button>
                <button
                  onClick={() => setCollectiveTeachers([])}
                  className="text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded"
                >Limpar Múltiplos</button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[150px] overflow-y-auto p-2 border border-purple-200 bg-white rounded-lg">
              {[...data.teachers].sort((a,b) => a.name.localeCompare(b.name)).map(t => (
                <label key={t.id} className="flex items-center gap-1.5 text-xs cursor-pointer truncate" title={t.name}>
                  <input
                    type="checkbox"
                    checked={collectiveTeachers.includes(t.id)}
                    onChange={(e) => {
                      if (e.target.checked) setCollectiveTeachers(prev => [...prev, t.id]);
                      else setCollectiveTeachers(prev => prev.filter(id => id !== t.id));
                    }}
                    className="w-3.5 h-3.5 text-purple-600 rounded border-purple-300"
                  />
                  <span className="truncate">{t.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={addCollectiveEvent} className="bg-purple-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-1.5">
              <Plus size={16} /> Aplicar Evento Coletivo
            </button>
          </div>
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
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [expandedSubjects, setExpandedSubjects] = useState(new Set());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = React.useRef(null);
  const subjectsList = useMemo(() => data.subjects || [], [data.subjects]);

  // Click outside to close dropdown
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const parseDate = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const formatBr = (d) => {
    if (!d) return '';
    const date = typeof d === 'string' ? parseDate(d) : d;
    if (!date) return '';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

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
    if (!schoolStart || !schoolEnd) return { map: new Map(), total: 0, details: new Map(), byClass: new Map() };
    const [rs, re] = clampRange(parseDate(start), parseDate(end));
    const counts = new Map();
    const details = new Map();
    const byClass = new Map(); // SubjectId -> Map<ClassId, Count>
    let total = 0;

    Object.entries(data.schedule || {}).forEach(([key, slot]) => {
      const parts = key.split('-');
      const dayIdx = DAYS.indexOf(parts[1]);
      const slotIdx = parseInt(parts[2]);
      if (dayIdx === -1) return;
      const timeSlot = data.timeSlots[slotIdx];
      if (!timeSlot || timeSlot.type !== 'aula') return;

      // Filter by selected classes
      if (selectedClasses.length > 0 && !selectedClasses.includes(slot.classId)) return;

      const subjectId = slot.subjectId;
      if (!subjectId) return;

      const jsWeekday = (dayIdx + 1) % 7; // 1..5 (Mon..Fri)
      const first = getFirstWeekdayOnOrAfter(rs, jsWeekday);

      for (let cursor = new Date(first); cursor <= re; cursor.setDate(cursor.getDate() + 7)) {
        if (cursor < rs) continue;
        if (isExcluded(cursor)) continue;

        counts.set(subjectId, (counts.get(subjectId) || 0) + 1);
        total += 1;

        // Track by class
        if (!byClass.has(subjectId)) byClass.set(subjectId, new Map());
        const classMap = byClass.get(subjectId);
        classMap.set(slot.classId, (classMap.get(slot.classId) || 0) + 1);

        if (!details.has(subjectId)) details.set(subjectId, new Map());
        const subjectMap = details.get(subjectId);
        if (!subjectMap.has(dayIdx)) subjectMap.set(dayIdx, { dates: new Set(), lessons: 0, byClass: new Map() });
        const info = subjectMap.get(dayIdx);
        info.lessons += 1;
        info.dates.add(fmt(cursor));

        // Breakdown by class within the day
        if (!info.byClass.has(slot.classId)) info.byClass.set(slot.classId, { lessons: 0 });
        info.byClass.get(slot.classId).lessons += 1;
      }
    });

    return { map: counts, total, details, byClass };
  }, [data.schedule, data.timeSlots, start, end, events, schoolStart, schoolEnd, selectedClasses]);

  const toggleClassSelection = (classId) => {
    setSelectedClasses(prev => {
      if (prev.includes(classId)) {
        return prev.filter(id => id !== classId);
      } else {
        return [...prev, classId];
      }
    });
  };

  const getDropdownLabel = () => {
    if (selectedClasses.length === 0) return 'Todas as Turmas';
    if (selectedClasses.length === data.classes.length) return 'Todas as Turmas';
    if (selectedClasses.length === 1) return data.classes.find(c => c.id === selectedClasses[0])?.name;
    return `${selectedClasses.length} turmas selecionadas`;
  };

  const exportExcel = () => {
    let classLabel = 'Todas_Turmas';

    // Determine which classes to include in columns
    // If selectedClasses is empty, it means ALL classes in the system (or at least all that have data? No, let's use all classes for consistency)
    // Actually, if we use all classes, the table might be huge.
    // Better: Use selected classes if any, otherwise All classes.
    const classesToExport = selectedClasses.length > 0
      ? data.classes.filter(c => selectedClasses.includes(c.id))
      : data.classes;

    classesToExport.sort((a, b) => a.name.localeCompare(b.name));

    if (selectedClasses.length > 0) {
      if (selectedClasses.length === 1) {
        classLabel = classesToExport[0].name;
      } else {
        classLabel = 'Varias_Turmas';
      }
    }

    const BOM = "\uFEFF";
    let csvContent = BOM + "Relatório de Contagem de Aulas\n";
    csvContent += `Período,${start ? formatBr(start) : formatBr(schoolStart)} a ${end ? formatBr(end) : formatBr(schoolEnd)}\n\n`;

    // Header Row: Matéria, Turma A, Turma B, ..., TOTAL
    const headerClasses = classesToExport.map(c => c.name).join(',');
    csvContent += `Matéria,${headerClasses},TOTAL\n`;

    subjectsList.forEach(s => {
      const totalCount = countBySubject.map.get(s.id) || 0;
      // Get count for each class
      const classCols = classesToExport.map(c => {
        return countBySubject.byClass.get(s.id)?.get(c.id) || 0;
      }).join(',');

      csvContent += `${s.name},${classCols},${totalCount}\n`;
    });

    csvContent += `TOTAL GERAL,,,${countBySubject.total}\n`; // Crude total line, putting total at end

    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // Sanitize filename
    const safeLabel = classLabel.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute("download", `contagem_aulas_${safeLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = async (specificSubject = null) => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();

    // Determine which classes to include
    const classesToExport = selectedClasses.length > 0
      ? data.classes.filter(c => selectedClasses.includes(c.id))
      : data.classes;

    classesToExport.sort((a, b) => a.name.localeCompare(b.name));

    let classLabel = 'Todas as Turmas';
    if (selectedClasses.length > 0) {
      if (selectedClasses.length === 1) {
        classLabel = classesToExport[0].name;
      } else {
        classLabel = 'Várias Turmas';
      }
    }

    const periodStr = `${start ? formatBr(start) : formatBr(schoolStart)} a ${end ? formatBr(end) : formatBr(schoolEnd)}`;

    // Header
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    // Blue header background rect
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(specificSubject ? `Relatório Detalhado: ${specificSubject.name}` : 'Contagem de Aulas por Matéria', 14, 10);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Turma(s): ${classLabel}`, 14, 25);

    // List classes if multiple selected (summary in header)
    let yPos = 25;
    if (classesToExport.length > 1 && classesToExport.length <= 10) {
      const names = classesToExport.map(c => c.name).join(', ');
      doc.setFontSize(8);
      const splitNames = doc.splitTextToSize(`(${names})`, 180);
      doc.text(splitNames, 14, 29);
      yPos = 29 + (splitNames.length * 3);
    } else if (classesToExport.length > 10) {
      doc.setFontSize(8);
      doc.text(`(${classesToExport.length} turmas selecionadas)`, 14, 29);
      yPos = 32;
    } else {
      yPos = 29;
    }

    doc.setFontSize(10);
    doc.text(`Período: ${periodStr}`, 14, yPos);
    yPos += 8;

    // --- SPECIFIC SUBJECT REPORT (Detailed List Layout) ---
    if (specificSubject) {
      const s = specificSubject;

      // 1. Resumo por Turma Table
      let startY = yPos + 5;
      doc.setFontSize(12);
      doc.setTextColor(30, 64, 175); // Dark blue title
      doc.text('Resumo por Turma', 14, startY);

      const summaryBody = [];
      classesToExport.forEach(c => {
        const cCount = countBySubject.byClass.get(s.id)?.get(c.id) || 0;
        if (cCount > 0) {
          summaryBody.push([c.name, cCount]);
        }
      });

      autoTable(doc, {
        head: [['Turma', 'Aulas']],
        body: summaryBody,
        startY: startY + 2,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] }, // Blue-500
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 50, halign: 'right' } }
      });

      startY = doc.lastAutoTable.finalY + 10;

      // 2. Detalhes por Dia Table
      doc.setFontSize(12);
      doc.setTextColor(30, 64, 175);
      doc.text('Detalhes por Dia', 14, startY);

      const detailsBody = [];
      if (countBySubject.details.get(s.id)) {
        Array.from(countBySubject.details.get(s.id).entries()).forEach(([dayIdx, info]) => {
          const daysQty = info.dates ? info.dates.size : 0;
          const lessonsQty = info.lessons || 0;

          // Row for Day Header
          detailsBody.push([{ content: `${DAYS[dayIdx]} (${daysQty} dias) - Total: ${lessonsQty} aulas`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } }]);

          // Rows for Classes
          if (info.byClass && info.byClass.size > 0 && selectedClasses.length !== 1) {
            Array.from(info.byClass.entries()).forEach(([clsId, clsInfo]) => {
              const cls = data.classes.find(c => c.id === clsId);
              if (cls) {
                detailsBody.push([`   ${cls.name}`, clsInfo.lessons]);
              }
            });
          } else {
            // Single class or no breakdown, usually doesn't happen if properly filtered, but fallback
            detailsBody.push(['   Total', lessonsQty]);
          }
        });
      }

      autoTable(doc, {
        body: detailsBody,
        startY: startY + 2,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 30, halign: 'right' } }
      });

      doc.save(`Relatorio_Detalhado_${s.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
      return;
    }

    // --- GENERAL REPORT (Table Layout) ---
    // Prepare Table Columns: Matéria | Class A | Class B | ... | Total

    const head = ['Matéria', ...classesToExport.map(c => c.name), 'Total'];

    const rows = subjectsList.map(s => {
      const total = countBySubject.map.get(s.id) || 0;
      const classCounts = classesToExport.map(c => countBySubject.byClass.get(s.id)?.get(c.id) || 0);
      return [s.name, ...classCounts, total];
    });

    autoTable(doc, {
      head: [head],
      body: rows,
      startY: yPos,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] }, // Blue color (blue-600)
    });

    const finalY = doc.lastAutoTable.finalY || 32;
    doc.setFontSize(10);
    doc.text(`Total Geral de aulas: ${countBySubject.total}`, 14, finalY + 10);

    const fileNameLabel = classLabel.replace(/\s+/g, '_');
    doc.save(`Contagem_Aulas_${fileNameLabel}.pdf`);
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

  const colorByDay = (idx) => {
    switch (idx) {
      case 0: return 'bg-blue-100 text-blue-700';
      case 1: return 'bg-sky-100 text-sky-700';
      case 2: return 'bg-amber-100 text-amber-700';
      case 3: return 'bg-orange-100 text-orange-700';
      case 4: return 'bg-cyan-100 text-cyan-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
      <h4 className="font-bold text-slate-700 flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-600" /> Calculadora de Aulas</h4>
      <p className="text-[11px] text-slate-500">Selecione o período (bimestre) e a turma para contar aulas por matéria, já considerando eventos de exclusão.</p>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="flex flex-col relative" ref={dropdownRef}>
          <label className="text-xs font-semibold text-slate-600 mb-1">Turma(s)</label>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="border rounded px-2 py-1.5 text-sm bg-slate-50 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-left flex justify-between items-center"
          >
            <span className="truncate">{getDropdownLabel()}</span>
            <span className="text-xs opacity-50">▼</span>
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-300 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
              <div
                className="px-3 py-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                onClick={() => { setSelectedClasses([]); setIsDropdownOpen(false); }}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedClasses.length === 0 ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                  {selectedClasses.length === 0 && <span className="text-white text-[10px]">✓</span>}
                </div>
                <span className="text-sm font-semibold text-blue-700">Todas as Turmas</span>
              </div>
              {data.classes.sort((a, b) => a.name.localeCompare(b.name)).map(cls => (
                <div
                  key={cls.id}
                  className="px-3 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                  onClick={() => toggleClassSelection(cls.id)}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedClasses.includes(cls.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                    {selectedClasses.includes(cls.id) && <span className="text-white text-[10px]">✓</span>}
                  </div>
                  <span className="text-sm text-slate-700">{cls.name}</span>
                </div>
              ))}
            </div>
          )}
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

            <button onClick={() => exportPDF()} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700"><FileText size={14} /> PDF ({selectedClasses.length === 0 ? 'todas as turmas' : getDropdownLabel()})</button>
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
              const totalCount = countBySubject.map.get(s.id) || 0;
              const isExpanded = expandedSubjects.has(s.id);
              const subjectDetails = countBySubject.details.get(s.id);

              return (
                <React.Fragment key={s.id}>
                  <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => totalCount > 0 && toggleSubject(s.id)}>
                    <td className="border p-2 text-center text-slate-400">
                      {totalCount > 0 && (
                        <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                      )}
                    </td>
                    <td className="border p-2 font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); exportPDF(s); }}
                          className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors"
                          title="Imprimir relatório desta matéria"
                        >
                          <Printer size={14} />
                        </button>
                        {s.name}
                      </div>
                    </td>
                    <td className="border p-2 text-right font-bold text-slate-800">{totalCount}</td>
                  </tr>
                  {isExpanded && totalCount > 0 && (
                    <tr>
                      <td colSpan={3} className="border p-0">
                        <div className="bg-slate-50 p-3 md:p-4 text-xs animate-fadeIn">
                          {/* Class Breakdown Summary */}
                          {selectedClasses.length !== 1 && (
                            <div className="mb-3 pb-3 border-b border-slate-200">
                              <h5 className="font-bold text-slate-600 mb-2">Resumo por Turma:</h5>
                              <div className="flex flex-wrap gap-2">
                                {data.classes
                                  .filter(c => selectedClasses.length === 0 || selectedClasses.includes(c.id))
                                  .map(c => {
                                    const cCount = countBySubject.byClass.get(s.id)?.get(c.id) || 0;
                                    if (cCount === 0) return null;
                                    return (
                                      <span key={c.id} className="bg-white border border-slate-200 px-2 py-1 rounded text-slate-600">
                                        <strong className="text-slate-800">{c.name}:</strong> {cCount} aulas
                                      </span>
                                    );
                                  })
                                }
                              </div>
                            </div>
                          )}

                          <div className="flex flex-col gap-2">
                            <div className="text-[12px] text-slate-500 mb-1 font-semibold">Detalhes por Dia e Turma:</div>
                            {subjectDetails && Array.from(subjectDetails.entries()).map(([dayIdx, info]) => {
                              const daysQty = info.dates ? info.dates.size : 0;
                              const lessonsQty = info.lessons || 0;
                              return (
                                <div key={dayIdx} className="flex flex-col gap-1 px-3 py-2 rounded bg-slate-50 border border-slate-200">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-medium text-slate-700">{DAYS[dayIdx]}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] ${colorByDay(dayIdx)}`}><Calendar size={12} /> {daysQty} {daysQty === 1 ? 'dia' : 'dias'}</span>
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] ${colorByDay(dayIdx)}`}><BookOpen size={12} /> {lessonsQty} {lessonsQty === 1 ? 'aula' : 'aulas'} (Total)</span>
                                    </div>
                                  </div>
                                  {/* Breakdown by class for this day */}
                                  {info.byClass && info.byClass.size > 0 && selectedClasses.length !== 1 && (
                                    <div className="pl-4 mt-1 border-l-2 border-slate-200 space-y-1">
                                      {Array.from(info.byClass.entries()).map(([clsId, clsInfo]) => {
                                        const cls = data.classes.find(c => c.id === clsId);
                                        if (!cls) return null;
                                        return (
                                          <div key={clsId} className="flex justify-between items-center text-[11px] text-slate-500">
                                            <span>{cls.name}</span>
                                            <span className="font-medium bg-white px-1.5 rounded">{clsInfo.lessons} {clsInfo.lessons === 1 ? 'aula' : 'aulas'}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table >
      </div >
    </div >
  );
};

export default AgendaSection;
