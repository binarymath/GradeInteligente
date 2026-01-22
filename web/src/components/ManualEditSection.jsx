import React, { useState, useMemo } from 'react';
import { Edit3, Trash2, Plus, X, Save, AlertCircle, Printer } from 'lucide-react';
import { DAYS, COLORS } from '../utils';

const ManualEditSection = ({ data, setData }) => {
  const [editMode, setEditMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null); // { dayIdx, slotIdx, classId }
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState({ teacherId: '', subjectId: '' });
  const [availableSlots, setAvailableSlots] = useState([]);
  const [printingClass, setPrintingClass] = useState(null);
  const [manualLog, setManualLog] = useState([]); // Log simples para operações manuais
  const [pendingLog, setPendingLog] = useState([]); // Log de pendências por matéria/turma

  const recomputePending = () => {
    try {
      const lines = [];
      let totalExpected = 0;
      let totalAllocated = 0;
      let totalMissing = 0;

      // Índice de alocação por (turma-matéria)
      const allocatedIndex = {};
      Object.values(data.schedule || {}).forEach(entry => {
        const key = `${entry.classId}-${entry.subjectId}`;
        allocatedIndex[key] = (allocatedIndex[key] || 0) + 1;
      });

      // Agregar esperados por (turma-matéria) e professores
      const expectedByKey = {};
      const teachersByKey = {};
      (data.activities || []).forEach(act => {
        const key = `${act.classId}-${act.subjectId}`;
        const qty = parseInt(act.quantity) || 0;
        expectedByKey[key] = (expectedByKey[key] || 0) + qty;
        if (!teachersByKey[key]) teachersByKey[key] = new Set();
        if (act.teacherId) teachersByKey[key].add(act.teacherId);
      });

      Object.entries(expectedByKey).forEach(([key, expected]) => {
        const allocated = allocatedIndex[key] || 0;
        const missing = Math.max(0, expected - allocated);
        totalExpected += expected;
        totalAllocated += allocated;
        totalMissing += missing;

        if (missing > 0) {
          const [classId, subjectId] = key.split('-');
          const className = data.classes.find(c => c.id === classId)?.name || 'Turma';
          const subjectName = data.subjects.find(s => s.id === subjectId)?.name || 'Matéria';
          const tSet = teachersByKey[key] || new Set();
          let teacherName = 'Sem professor';
          if (tSet.size === 1) {
            const tid = Array.from(tSet)[0];
            teacherName = data.teachers.find(t => t.id === tid)?.name || 'Professor';
          } else if (tSet.size > 1) {
            teacherName = 'Vários professores';
          }
          lines.push(`• ${subjectName} - ${className}: ${allocated}/${expected} (faltam ${missing}) — Prof: ${teacherName}`);
        }
      });

      const header = [
        `📈 Total esperado: ${totalExpected} aula(s)`,
        `✅ Alocado: ${totalAllocated} aula(s)`,
        `⏳ Pendências: ${totalMissing} aula(s)`
      ];

      if (totalMissing === 0) {
        setPendingLog([...header, '', '✅ Sem pendências para esta grade.']);
      } else {
        setPendingLog([...header, '', ...lines]);
      }
    } catch (e) {
      setPendingLog([`❌ Erro ao calcular pendências: ${e.message}`]);
    }
  };

  // Filtrar apenas slots de aula
  const lessonSlots = useMemo(() =>
    data.timeSlots.filter(slot => slot.type === 'aula'),
    [data.timeSlots]
  );

  const handlePrint = (classId) => {
    const className = data.classes.find(c => c.id === classId)?.name || 'Grade';
    
    // Criar um estilo temporário para impressão
    const printStyle = document.createElement('style');
    printStyle.id = 'print-style-temp';
    printStyle.innerHTML = `
      @media print {
        @page {
          size: A4 landscape;
          margin: 10mm;
        }
        
        body * {
          visibility: hidden;
        }
        
        .print-now, .print-now * {
          visibility: visible;
        }
        
        .print-now {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          box-shadow: none !important;
          border: none !important;
          page-break-after: avoid;
          page-break-inside: avoid;
        }
        
        .print-now .print\\:hidden {
          display: none !important;
        }
        
        .print-now table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10pt;
          page-break-inside: avoid;
          page-break-after: avoid;
        }
        
        .print-now tbody {
          page-break-inside: avoid;
        }
        
        .print-now tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        
        .print-now th,
        .print-now td {
          border: 1px solid #000 !important;
          padding: 6px 4px !important;
          page-break-inside: avoid;
        }
        
        .print-now th {
          background-color: #f0f0f0 !important;
          font-weight: bold;
          text-align: center;
        }
        
        .print-now td {
          vertical-align: top;
        }
        
        /* Título da página */
        .print-now::before {
          content: "Grade Horária - ${className}";
          display: block;
          font-size: 18pt;
          font-weight: bold;
          text-align: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #000;
        }
        
        /* Cores das matérias na impressão */
        .print-now [class*="bg-"] {
          background-color: #f5f5f5 !important;
          border: 2px solid #333 !important;
        }
        
        .print-now [class*="text-"] {
          color: #000 !important;
        }
        
        /* Ocultar padding extra que pode causar quebra de página */
        .print-now .p-4,
        .print-now .p-6 {
          padding: 0 !important;
        }
        
        .print-now .overflow-x-auto {
          overflow: visible !important;
        }
      }
    `;
    
    document.head.appendChild(printStyle);
    setPrintingClass(classId);
    
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setPrintingClass(null);
        document.getElementById('print-style-temp')?.remove();
      }, 100);
    }, 100);
  };

  // Calcular slots disponíveis quando professor e matéria são selecionados
  const calculateAvailableSlots = () => {
    if (!newEntry.teacherId || !newEntry.subjectId || !selectedCell) {
      setAvailableSlots([]);
      return;
    }

    const teacher = data.teachers.find(t => t.id === newEntry.teacherId);
    const subject = data.subjects.find(s => s.id === newEntry.subjectId);
    const targetClass = data.classes.find(c => c.id === selectedCell.classId);

    if (!teacher || !subject || !targetClass) {
      setAvailableSlots([]);
      return;
    }

    const available = [];

    // Percorre todos os dias e slots
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      lessonSlots.forEach((slot, slotIdx) => {
        const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
        const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;

        // 1. Verificar se professor está indisponível
        if (teacher.unavailable && teacher.unavailable.includes(timeKey)) {
          return;
        }

        // 2. Verificar se professor já está ocupado neste horário (em outra turma)
        const teacherBusy = Object.values(data.schedule).some(
          entry => entry.teacherId === newEntry.teacherId && entry.timeKey === timeKey
        );
        if (teacherBusy) return;

        // 3. Verificar se matéria tem restrição neste horário
        if (subject.unavailable && subject.unavailable.includes(timeKey)) {
          return;
        }

        // 4. Verificar se a turma está ativa neste slot
        if (!targetClass.activeSlots.includes(slot.id)) {
          return;
        }

        // 5. Verificar se o slot já está ocupado na turma
        const scheduleKey = `${selectedCell.classId}-${timeKey}`;
        if (data.schedule[scheduleKey]) {
          return;
        }

        // Se passou por todas as verificações, está disponível
        available.push({ dayIdx, slotIdx: absoluteIndex });
      });
    }

    setAvailableSlots(available);
  };

  // Atualizar slots disponíveis quando professor ou matéria mudam
  React.useEffect(() => {
    calculateAvailableSlots();
  }, [newEntry.teacherId, newEntry.subjectId, selectedCell]);

  // Atualiza automaticamente o resumo de pendências quando a grade muda
  React.useEffect(() => {
    recomputePending();
  }, [data.schedule, data.activities]);

  const handleCellClick = (dayIdx, slotIdx, classId) => {
    if (!editMode || !classId) return;
    setSelectedCell({ dayIdx, slotIdx, classId });
    setShowAddModal(true);
  };

  const handleRemoveLesson = (dayIdx, slotIdx, classId) => {
    if (!classId) return;
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    const scheduleKey = `${classId}-${timeKey}`;

    const slot = data.timeSlots[slotIdx];
    const className = data.classes.find(c => c.id === classId)?.name || 'Turma';
    const entry = data.schedule[scheduleKey];
    const subjectName = data.subjects.find(s => s.id === entry?.subjectId)?.name || 'Matéria';
    const teacherName = data.teachers.find(t => t.id === entry?.teacherId)?.name || 'Professor';

    setData(prev => {
      const newSchedule = { ...(prev.schedule || {}) };
      delete newSchedule[scheduleKey];
      return { ...prev, schedule: newSchedule };
    });

    // Log da operação
    setManualLog(prev => [
      `Removido: ${subjectName} (${teacherName}) da turma ${className} em ${DAYS[dayIdx]} ${slot?.start || ''}-${slot?.end || ''}`,
      ...prev
    ].slice(0, 200));
  };

  const handleAddLesson = () => {
    if (!newEntry.teacherId || !newEntry.subjectId || !selectedCell) return;

    const { dayIdx, slotIdx, classId } = selectedCell;
    const targetClass = classId;

    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    const scheduleKey = `${targetClass}-${timeKey}`;

    const slot = data.timeSlots[slotIdx];
    const className = data.classes.find(c => c.id === targetClass)?.name || 'Turma';
    const subjectName = data.subjects.find(s => s.id === newEntry.subjectId)?.name || 'Matéria';
    const teacherName = data.teachers.find(t => t.id === newEntry.teacherId)?.name || 'Professor';

    // Verificar conflito de professor
    const teacherConflict = Object.values(data.schedule || {}).find(
      entry => entry.teacherId === newEntry.teacherId && entry.timeKey === timeKey
    );

    if (teacherConflict) {
      const conflictClass = data.classes.find(c => c.id === teacherConflict.classId);
      // Alerta usuário sobre conflito de professor neste horário
      window.alert(
        `Conflito: o(a) prof. ${teacherName} já está na turma ${conflictClass?.name || ''} em ${DAYS[dayIdx]} ${slot?.start || ''}-${slot?.end || ''}`
      );
      // Também registra no log de edição manual
      setManualLog(prev => [
        `Conflito: Prof. ${teacherName} já está na turma ${conflictClass?.name || ''} em ${DAYS[dayIdx]} ${slot?.start || ''}-${slot?.end || ''}`,
        ...prev
      ].slice(0, 200));
      return;
    }

    setData(prev => ({
      ...prev,
      schedule: {
        ...(prev.schedule || {}),
        [scheduleKey]: {
          teacherId: newEntry.teacherId,
          subjectId: newEntry.subjectId,
          classId: targetClass,
          timeKey: timeKey
        }
      }
    }));

    // Log da operação
    setManualLog(prev => [
      `Adicionado: ${subjectName} (${teacherName}) na turma ${className} em ${DAYS[dayIdx]} ${slot?.start || ''}-${slot?.end || ''}`,
      ...prev
    ].slice(0, 200));

    setShowAddModal(false);
    setNewEntry({ teacherId: '', subjectId: '' });
    setSelectedCell(null);
  };

  const getScheduleEntry = (dayIdx, slot, classId) => {
    if (!classId) return null;
    const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
    const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;
    const scheduleKey = `${classId}-${timeKey}`;
    return data.schedule[scheduleKey];
  };

  // Verificar se um slot está disponível (para destacar visualmente)
  const isSlotAvailable = (dayIdx, slotIdx) => {
    return availableSlots.some(slot => slot.dayIdx === dayIdx && slot.slotIdx === slotIdx);
  };

  // Verificar se uma linha de horário tem pelo menos uma aula (para qualquer dia)
  const isSlotRowEmpty = (slot, classId) => {
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      const entry = getScheduleEntry(dayIdx, slot, classId);
      if (entry) return false; // Encontrou pelo menos uma aula
    }
    return true; // Linha completamente vazia
  };

  const getLessonCount = (classId, subjectId) => {
    return Object.values(data.schedule).filter(
      entry => entry.classId === classId && entry.subjectId === subjectId
    ).length;
  };

  // Helper para obter cor consistente da matéria
  const getSubjectColor = (subjectId) => {
    const subject = data.subjects.find(s => s.id === subjectId);
    if (subject && typeof subject.colorIndex !== 'undefined') {
      return COLORS[subject.colorIndex % COLORS.length];
    }
    // Fallback consistente baseado no ID (hash simples)
    let hash = 0;
    const str = String(subjectId);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COLORS.length;
    return COLORS[index];
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Edit3 className="w-6 h-6" />
              Edição Manual da Grade
            </h2>
            <p className="text-indigo-100 mt-2">
              Adicione, remova ou substitua aulas diretamente na grade horária
            </p>
          </div>
          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${editMode
              ? 'bg-white text-indigo-600 hover:bg-indigo-50'
              : 'bg-indigo-800 text-white hover:bg-indigo-900'
              }`}
          >
            {editMode ? (
              <>
                <Save size={18} /> Finalizar Edição
              </>
            ) : (
              <>
                <Edit3 size={18} /> Ativar Modo Edição
              </>
            )}
          </button>
        </div>
      </div>
      

        {/* Resumo de Pendências (atualizável) */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-700">Resumo de Pendências</h4>
            <div className="flex gap-2">
              <button
                onClick={recomputePending}
                className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Atualizar
              </button>
            </div>
          </div>
          {pendingLog.length === 0 ? (
            <p className="text-xs text-slate-500">Calculando...</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-slate-700">
              {pendingLog.map((line, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded px-2 py-1">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Log de operações manuais */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-700">Log de Edição Manual</h4>
            <div className="flex gap-2">
              <button
                onClick={() => setManualLog([])}
                className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
              >
                Limpar
              </button>
            </div>
          </div>
          {manualLog.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma operação registrada ainda.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-slate-700">
              {manualLog.map((line, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded px-2 py-1">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Lista de Turmas */}
      <div className="space-y-6">
        {data.classes.map(cls => {
          // Garantir que activeSlots existe e é um array
          const classActiveSlots = cls.activeSlots && Array.isArray(cls.activeSlots) ? cls.activeSlots : [];
          
          return (
          <div
            key={cls.id}
            className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden printable-schedule ${printingClass === cls.id ? 'print-now' : ''}`}
          >
            <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-indigo-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-3">
                {/* Botão de Impressão (Antes do nome) */}
                <button
                  onClick={() => handlePrint(cls.id)}
                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors print:hidden"
                  title="Imprimir Grade"
                >
                  <Printer size={18} />
                </button>

                <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-sm">{cls.name}</span>
                <span className="text-xs text-slate-600">Turno: {cls.shift}</span>
                {editMode && (
                  <span className="ml-auto flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
                    <AlertCircle size={14} />
                    Editável
                  </span>
                )}
              </h3>
            </div>

            <div className="p-4 overflow-x-auto">
              {classActiveSlots.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
                  <p className="text-amber-800 font-semibold mb-2">
                    ⚠️ Nenhum horário ativo configurado
                  </p>
                  <p className="text-amber-700 text-sm">
                    Esta turma não possui horários ativos selecionados. Vá em "Dados Institucionais" → "Turmas" e edite esta turma para selecionar os horários.
                  </p>
                </div>
              ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border border-slate-300 p-3 bg-slate-100 font-bold text-slate-700">
                      Horário
                    </th>
                    {DAYS.map(day => (
                      <th key={day} className="border border-slate-300 p-3 bg-slate-100 font-bold text-slate-700">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lessonSlots
                    .filter(slot => classActiveSlots.includes(slot.id))
                    .map((slot, slotIdx) => {
                    const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
                    const isEmptyRow = isSlotRowEmpty(slot, cls.id);
                    
                    return (
                      <tr key={slot.id} className={isEmptyRow ? 'print:hidden' : ''}>
                        <td className="border border-slate-300 p-3 font-semibold text-slate-600 whitespace-nowrap bg-slate-50">
                          {slot.start} - {slot.end}
                        </td>
                        {DAYS.map((_, dayIdx) => {
                          const entry = getScheduleEntry(dayIdx, slot, cls.id);
                          const isEmpty = !entry;
                          const isAvailable = isSlotAvailable(dayIdx, absoluteIndex);

                          return (
                            <td
                              key={dayIdx}
                              className={`border border-slate-300 p-2 relative group ${editMode ? 'cursor-pointer hover:bg-indigo-50' : ''
                                } ${isEmpty ? 'bg-slate-50' : ''} ${isAvailable && isEmpty ? 'bg-green-50 border-2 border-green-300' : ''}`}
                              onClick={() => editMode && !isEmpty && handleCellClick(dayIdx, absoluteIndex, cls.id)}
                            >
                              {entry ? (
                                <div className="relative">
                                  {/* Usar função helper para cor consistente */}
                                  <div className={`p-2 rounded ${getSubjectColor(entry.subjectId).bg} ${getSubjectColor(entry.subjectId).border} border print:border-2 print:text-black`}>
                                    <div className={`font-bold text-xs mb-1 ${getSubjectColor(entry.subjectId).text} print:text-black`}>
                                      {data.subjects.find(s => s.id === entry.subjectId)?.name}
                                    </div>
                                    <div className="text-[11px] text-slate-600 print:text-slate-800">
                                      {data.teachers.find(t => t.id === entry.teacherId)?.name}
                                    </div>
                                  </div>
                                  {/* Tooltip com contagem (Ocultar na impressão) */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-nowrap shadow-lg print:hidden">
                                    {getLessonCount(entry.classId, entry.subjectId)} aulas alocadas
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                  </div>
                                  {editMode && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveLesson(dayIdx, absoluteIndex, cls.id);
                                      }}
                                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                                      title="Remover aula"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              ) : editMode ? (
                                <button
                                  onClick={() => handleCellClick(dayIdx, absoluteIndex, cls.id)}
                                  className="w-full h-full min-h-[60px] flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                >
                                  <Plus size={20} />
                                </button>
                              ) : (
                                <div className="min-h-[60px]"></div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          </div>
        );
        })}
      </div>

      {/* Modal Adicionar Aula */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Adicionar Aula
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewEntry({ teacherId: '', subjectId: '' });
                  setSelectedCell(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Professor
                </label>
                <select
                  value={newEntry.teacherId}
                  onChange={e => setNewEntry({ ...newEntry, teacherId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecione o professor...</option>
                  {data.teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Matéria
                </label>
                <select
                  value={newEntry.subjectId}
                  onChange={e => setNewEntry({ ...newEntry, subjectId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecione a matéria...</option>
                  {data.subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Dica de slots disponíveis */}
              {newEntry.teacherId && newEntry.subjectId && availableSlots.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <p className="text-green-800 font-semibold mb-1">
                    ✅ {availableSlots.length} horários livres encontrados
                  </p>
                  <p className="text-green-700 text-xs">
                    Os slots destacados em verde na grade estão disponíveis para este professor e matéria.
                  </p>
                </div>
              )}

              {newEntry.teacherId && newEntry.subjectId && availableSlots.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="text-amber-800 font-semibold mb-1">
                    ⚠️ Nenhum horário livre disponível
                  </p>
                  <p className="text-amber-700 text-xs">
                    Este professor não possui horários livres nesta turma, ou todos os slots compatíveis já estão ocupados.
                  </p>
                </div>
              )}

              {selectedCell && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm">
                  <p className="text-slate-700">
                    <span className="font-semibold">Turma:</span>{' '}
                    {data.classes.find(c => c.id === selectedCell.classId)?.name}
                  </p>
                  <p className="text-slate-700">
                    <span className="font-semibold">Horário:</span>{' '}
                    {DAYS[selectedCell.dayIdx]} - {data.timeSlots[selectedCell.slotIdx]?.start} às {data.timeSlots[selectedCell.slotIdx]?.end}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewEntry({ teacherId: '', subjectId: '' });
                  setSelectedCell(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddLesson}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                Adicionar Aula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualEditSection;
