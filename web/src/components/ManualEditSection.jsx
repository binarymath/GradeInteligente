import React, { useState, useMemo } from 'react';
import { Edit3, Trash2, Plus, X, Save, AlertCircle, Printer } from 'lucide-react';
import { DAYS, COLORS } from '../utils';
import { computeSlotShift } from '../utils/time';

const ManualEditSection = ({ data, setData }) => {
  const [editMode, setEditMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null); // { dayIdx, slotIdx, classId }
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState({ teacherId: '', subjectId: '' });
  const [availableSlots, setAvailableSlots] = useState([]);
  const [printingClass, setPrintingClass] = useState(null);
  const [manualLog, setManualLog] = useState([]); // Log simples para operações manuais
  const [pendingLog, setPendingLog] = useState([]); // Log de pendências por matéria/turma

  // Helper para verificar se slot é ativo (agora no escopo do componente para reuso)
  const isSlotActiveLocal = (classId, dayIdx, slotIdx) => {
    const cls = data.classes.find(c => c.id === classId);
    if (!cls) return false;
    const slotObj = data.timeSlots[slotIdx];
    const slotId = slotObj ? slotObj.id : String(slotIdx);

    if (cls.activeSlotsByDay && Object.keys(cls.activeSlotsByDay).length > 0) {
      const activeSlotsForDay = cls.activeSlotsByDay[dayIdx];
      return activeSlotsForDay && Array.isArray(activeSlotsForDay) && activeSlotsForDay.includes(slotId);
    }
    if (cls.activeSlots && Array.isArray(cls.activeSlots) && cls.activeSlots.length > 0) {
      return cls.activeSlots.includes(slotId);
    }
    return true;
  };

  const recomputePending = () => {
    try {
      const lines = [];
      let totalExpected = 0;
      let totalAllocated = 0;
      let totalPending = 0;

      // === ANÁLISE DE SLOTS (baseado em atividades, não em configuração) ===
      let totalUsedSlots = 0;
      const slotAnalysis = [];

      // Contar alocações por classe
      const classAllocations = {};
      Object.entries(data.schedule || {}).forEach(([key, entry]) => {
        // Tentar extrair dia/slot da key ou entry para validação
        let dayIdx = entry.dayIdx;
        let slotIdx = entry.slotIdx;

        // PRIORIDADE 1: Parsear da Key (que é o que define a posição no Grid)
        // Key format: classId-Dia-Slot
        const parts = key.split('-');
        if (parts.length >= 3) {
          const sStr = parts[parts.length - 1]; // Última parte é slot
          const maybeSlot = parseInt(sStr, 10);

          const dStr = parts[parts.length - 2]; // Penúltima parte é dia
          const maybeDay = DAYS.indexOf(dStr);

          if (!isNaN(maybeSlot) && maybeDay >= 0) {
            slotIdx = maybeSlot;
            dayIdx = maybeDay;
          }
        }

        // PRIORIDADE 2: Internal timeKey (apenas se falhou parse da Key e ele existe)
        if ((dayIdx === undefined || slotIdx === undefined) && entry.timeKey) {
          const tParts = entry.timeKey.split('-');
          const dIdx = DAYS.indexOf(tParts[0]);
          if (dIdx >= 0) dayIdx = dIdx;
          else {
            // Tenta index numérico
            const dNum = parseInt(tParts[0]);
            if (!isNaN(dNum)) dayIdx = dNum;
          }
          // Slot usually implicit or in parts
        }

        if (dayIdx === undefined || dayIdx === -1 || slotIdx === undefined) {
          return; // Ignora entrada malformada
        }

        if (!isSlotActiveLocal(entry.classId, dayIdx, slotIdx)) {
          // GHOST: Slot inativo. 
          // Mas CUIDADO: Se o user vê no grid, é porque activeSlotsByDay permite.
          // Se isSlotActiveLocal retorna false, então o Grid também não mostra.
          // Se o grid mostra e aqui retorna false, verifique se isSlotActiveLocal está síncrono.
          return;
        }

        // REMOVIDO Strict Check contra expectedKey pois a key JÁ É a fonte da verdade agora.
        // Se a entry diz 'Segunda' mas a key diz 'Terca', a key (posição no grid) vence.
        // A validação de 'ghost' real é se o slot é active.

        if (!classAllocations[entry.classId]) {
          classAllocations[entry.classId] = 0;
        }
        classAllocations[entry.classId]++;
        totalUsedSlots++;
      });

      // Coletar todas as atividades esperadas
      const expectedByKey = {};
      const seenActivities = new Set();
      (data.activities || []).forEach(act => {
        const key = `${act.classId}-${act.subjectId}-${act.teacherId || 'none'}`;
        if (!seenActivities.has(key)) {
          const qty = parseInt(act.quantity) || 0;
          expectedByKey[key] = qty;
          seenActivities.add(key);
        }
      });

      // Contar total esperado por classe
      const classExpected = {};
      Object.entries(expectedByKey).forEach(([key, expected]) => {
        const [classId] = key.split('-');
        if (!classExpected[classId]) {
          classExpected[classId] = 0;
        }
        classExpected[classId] += expected;
      });

      // Mostrar análise por classe
      for (const classData of (data.classes || [])) {
        const expected = classExpected[classData.id] || 0;
        const allocated = classAllocations[classData.id] || 0;
        const free = Math.max(0, expected - allocated); // Isso estava errado? User reclamo de -1 livres. 
        // Não, user reclamou de "Total de slots livres: -1". que é totalExpected - totalAllocated no header.
        // Aqui é "free" slots na exibição por turma.
        // Se allocated > expected, free = 0.
        // Mas se allocated contava ghosts, allocated > expected era comum.

        if (expected > 0) {
          slotAnalysis.push(`   • ${classData.name}: ${allocated}/${expected} ocupado(s) (${free} livre(s))`);
        }
      }

      // === ANÁLISE DE PENDÊNCIAS ===
      // Índice de alocação por (turma-matéria-professor)
      const allocatedIndex = {};
      Object.entries(data.schedule || {}).forEach(([key, entry]) => {
        // Validation Logic Duplicated/Strict
        let dayIdx = entry.dayIdx;
        let slotIdx = entry.slotIdx;

        if (entry.timeKey) {
          const parts = entry.timeKey.split('-');
          const dIdx = DAYS.indexOf(parts[0]);
          if (dIdx >= 0) dayIdx = dIdx;
          else {
            const maybeIdx = parseInt(parts[0]);
            if (!isNaN(maybeIdx) && maybeIdx >= 0 && maybeIdx < DAYS.length) dayIdx = maybeIdx;
          }
        }
        // Fallback key parse
        if (dayIdx === undefined || slotIdx === undefined) {
          const parts = key.split('-');
          if (parts.length >= 3) {
            slotIdx = parseInt(parts[2]);
            const dIdx = DAYS.indexOf(parts[1]);
            if (dIdx >= 0) dayIdx = dIdx;
          }
        }

        if (dayIdx === undefined || dayIdx === -1 || slotIdx === undefined) return;
        if (!isSlotActiveLocal(entry.classId, dayIdx, slotIdx)) return;

        const expectedKey = `${entry.classId}-${DAYS[dayIdx]}-${slotIdx}`;
        if (key !== expectedKey) return;

        const compositeKey = `${entry.classId}-${entry.subjectId}-${entry.teacherId || 'none'}`;
        allocatedIndex[compositeKey] = (allocatedIndex[compositeKey] || 0) + 1;
      });

      // Coletar todas as atividades esperadas e calcular pendências
      let totalExcess = 0;
      const excessDetails = [];
      const missingDetails = [];

      Object.entries(expectedByKey).forEach(([key, expected]) => {
        const allocated = allocatedIndex[key] || 0;
        const missing = Math.max(0, expected - allocated);
        const excess = Math.max(0, allocated - expected);

        totalExpected += expected;
        totalAllocated += allocated; // Soma tudo que foi alocado para atividades CONHECIDAS
        totalPending += missing;
        totalExcess += excess;

        if (missing > 0) {
          const [classId, subjectId, teacherId] = key.split('-');
          const className = data.classes.find(c => c.id === classId)?.name || 'Turma';
          const subjectName = data.subjects.find(s => s.id === subjectId)?.name || 'Matéria';
          const teacherName = teacherId !== 'none'
            ? (data.teachers.find(t => t.id === teacherId)?.name || 'Professor')
            : 'Sem professor';
          missingDetails.push({ className, subjectName, teacherName, allocated, expected, missing });
        }

        if (excess > 0) {
          const [classId, subjectId] = key.split('-');
          const className = data.classes.find(c => c.id === classId)?.name || 'Turma';
          const subjectName = data.subjects.find(s => s.id === subjectId)?.name || 'Matéria';
          excessDetails.push(`${subjectName} - ${className}: +${excess}`);
        }
      });

      // Validar discrepância entre slots usados e alocações conhecidas
      const unknownAllocationsCount = totalUsedSlots - totalAllocated;
      // totalAllocated aqui soma (Expected ou Reference) + Excess.
      // Se eu tenho 1 planned, 10 allocated. totalAllocated+=10.
      // Se totalUsedSlots=10. Diff=0.
      // Se tenho 0 planned (activity removed), 10 allocated. totalAllocated não soma nada (não entra no loop).
      // totalUsedSlots=10. Diff=10. -> Unknown/Unplanned.

      // Organizar por matéria/turma para exibição
      const detailsBySubjectClass = {};
      missingDetails.forEach(d => {
        const key = `${d.subjectName}-${d.className}`;
        if (!detailsBySubjectClass[key]) {
          detailsBySubjectClass[key] = [];
        }
        detailsBySubjectClass[key].push(d);
      });

      Object.entries(detailsBySubjectClass).forEach(([_, details]) => {
        details.forEach(d => {
          lines.push(`• ${d.subjectName} - ${d.className}: ${d.allocated}/${d.expected} (faltam ${d.missing}) — Prof: ${d.teacherName}`);
        });
      });

      const header = [
        '📊 ANÁLISE DE SLOTS',
        `   Total de slots ocupados: ${totalUsedSlots}`,
        // `   Total de slots livres: ${totalExpected - totalAllocated}`, // Math incorreto se tiver excesso ou unknown
        '',
        'Detalhamento por turma:',
        ...slotAnalysis,
        '',
        '📊 ANÁLISE DE PENDÊNCIAS',
        `   📈 Total esperado: ${totalExpected} aula(s)`,
        `   ✅ Total alocado (Atividades): ${totalAllocated} aula(s)`,
      ];

      if (totalExcess > 0) {
        header.push(`   ⚠️ Excedentes: ${totalExcess} aula(s) (incluso no total alocado)`);
      }
      if (unknownAllocationsCount > 0) {
        header.push(`   ❓ Alocações desconhecidas/fantasmas: ${unknownAllocationsCount} slot(s)`);
      }

      header.push(`   ⏳ Total de pendências: ${totalPending} aula(s)`);

      const finalLog = [...header];

      if (totalPending === 0) {
        finalLog.push('', '✅ Sem pendências para esta grade.');
      } else {
        finalLog.push('', 'Detalhamento das pendências:', '', ...lines);
      }

      if (excessDetails.length > 0) {
        finalLog.push('', 'Detalhamento de Excedentes:', ...excessDetails);
      }

      setPendingLog(finalLog);
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
        if (!isSlotActiveLocal(targetClass.id, dayIdx, absoluteIndex)) {
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
  }, [JSON.stringify(Object.keys(data.schedule || {})), JSON.stringify(data.activities)]);

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

  // Helper para obter detalhes e contagem (suporta tooltip rico)
  const getLessonDetails = (classId, subjectId) => {
    const seen = new Set();
    const allocations = [];

    // Obter turma para validação
    const cls = data.classes.find(c => c.id === classId);
    if (!cls) return { count: 0, allocations: [] };

    for (const [key, entry] of Object.entries(data.schedule)) {
      if (entry.classId === classId && entry.subjectId === subjectId) {

        // RECUPERAÇÃO ROBUSTA DO DIA E SLOT
        let dayIdx = entry.dayIdx;
        let slotIdx = entry.slotIdx;

        // PRIORIDADE 1: Parsear da Key
        const parts = key.split('-');
        if (parts.length >= 3) {
          const sStr = parts[parts.length - 1];
          const dStr = parts[parts.length - 2];
          const maybeSlot = parseInt(sStr, 10);
          const maybeDay = DAYS.indexOf(dStr);
          if (!isNaN(maybeSlot) && maybeDay >= 0) {
            slotIdx = maybeSlot;
            dayIdx = maybeDay;
          }
        }

        // PRIORIDADE 2: Internal timeKey
        if ((dayIdx === undefined || slotIdx === undefined) && entry.timeKey) {
          const tParts = entry.timeKey.split('-');
          const dIdx = DAYS.indexOf(tParts[0]);
          if (dIdx >= 0) dayIdx = dIdx;
          else {
            const dNum = parseInt(tParts[0]);
            if (!isNaN(dNum)) dayIdx = dNum;
          }
        }

        if (dayIdx === undefined || dayIdx === -1 || slotIdx === undefined) continue;
        if (!isSlotActiveLocal(classId, dayIdx, slotIdx)) continue;

        const dedupKey = key || `${entry.dayIdx ?? 'd?'}-${entry.slotIdx ?? 's?'}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);

          const slotTime = data.timeSlots[slotIdx];
          const timeLabel = slotTime ? `${slotTime.start}` : '?';
          allocations.push({
            day: DAYS[dayIdx],
            time: timeLabel,
            dayIdx, // para ordenar
            start: slotTime ? slotTime.start : '00:00'
          });
        }
      }
    }

    // Ordenar cronologicamente: Dia -> Hora
    allocations.sort((a, b) => {
      if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
      return a.start.localeCompare(b.start);
    });

    return { count: allocations.length, allocations };
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
          // Suporte a activeSlotsByDay (novo) e activeSlots (legado)
          const classActiveSlots = (() => {
            if (cls.activeSlotsByDay && Object.keys(cls.activeSlotsByDay).length > 0) {
              // Une todos os slots ativos em qualquer dia
              return Array.from(new Set(Object.values(cls.activeSlotsByDay).flat()));
            }
            return cls.activeSlots && Array.isArray(cls.activeSlots) ? cls.activeSlots : [];
          })();

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
                        .filter(slot => {
                          // Filtro 1: Deve estar na lista de slots ATIVOS da classe
                          if (!classActiveSlots.includes(slot.id)) return false;

                          // Filtro 2 (Novo): Deve ser compatível com o Turno da classe
                          // Isso remove slots fantasmas onde o activeSlots tem sujeira de outros turnos
                          const slotShift = computeSlotShift(slot);

                          if (cls.shift === 'Integral (Manhã e Tarde)') {
                            return slotShift === 'Manhã' || slotShift === 'Tarde' || slotShift === 'Integral (Manhã e Tarde)';
                          }
                          if (cls.shift === 'Integral (Tarde e Noite)') {
                            return slotShift === 'Tarde' || slotShift === 'Noite' || slotShift === 'Integral (Tarde e Noite)';
                          }
                          // Para turnos simples, deve ser match exato ou o slot ser "geral" (raro)
                          if (slotShift !== cls.shift) return false;

                          // Filtro 3 (Novo - Overlap): Remove slots vazios que colidem com slots preenchidos
                          const parseTime = (t) => {
                            const [h, m] = t.split(':').map(Number);
                            return h * 60 + m;
                          };
                          const thisStart = parseTime(slot.start);
                          const thisEnd = parseTime(slot.end);

                          const isEmptyRow = isSlotRowEmpty(slot, cls.id);
                          if (!isEmptyRow) return true; // Se tem aula, sempre mostra

                          // Se está vazio, verifica se colide com algum slot que TEM aula nesta turma
                          const hasOverlapWithContent = lessonSlots.some(other => {
                            if (other.id === slot.id) return false;
                            if (isSlotRowEmpty(other, cls.id)) return false; // Só nos importamos com colisões com slots CHEIOS

                            const otherStart = parseTime(other.start);
                            const otherEnd = parseTime(other.end);

                            // Colisão simples: (StartA < EndB) && (EndA > StartB)
                            return (thisStart < otherEnd && thisEnd > otherStart);
                          });

                          if (hasOverlapWithContent) return false; // Esconde o vazio colidente

                          return true;
                        })
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

                                // Calcular detalhes apenas se tiver aula
                                const lessonInfo = entry ? getLessonDetails(cls.id, entry.subjectId) : null;

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
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-nowrap shadow-lg print:hidden">
                                          <div className="font-bold mb-1 border-b border-slate-600 pb-1">
                                            {lessonInfo?.count} aulas alocadas
                                          </div>
                                          <div className="space-y-0.5 opacity-90">
                                            {lessonInfo?.allocations.map((a, i) => (
                                              <div key={i}>{a.day} às {a.time}</div>
                                            ))}
                                          </div>
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
