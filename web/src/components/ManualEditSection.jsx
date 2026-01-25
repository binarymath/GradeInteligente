import React, { useState, useMemo } from 'react';
import { Edit3, Trash2, Plus, X, Save, AlertCircle, Printer, FileSpreadsheet } from 'lucide-react';
import { DAYS, COLORS } from '../utils';
import { computeSlotShift } from '../utils/time';
import { exportAllSchedulesToExcel } from '../services/excelExport';

const ManualEditSection = ({ data, setData }) => {
  const [editMode, setEditMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null); // { dayIdx, slotIdx, classId }
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState({ teacherId: '', subjectId: '' });
  const [availableSlots, setAvailableSlots] = useState([]);
  const [printingClass, setPrintingClass] = useState(null);
  const [manualLog, setManualLog] = useState([]); // Log simples para operações manuais
  const [pendingLog, setPendingLog] = useState([]); // Log de pendências por matéria/turma (Legacy text log)
  const [pendingItems, setPendingItems] = useState([]); // Itens pendentes estruturados { classId, subjectId, missing, allocated, expected }
  const [resolveModal, setResolveModal] = useState(null); // { item, suggestions: [] } se aberto
  const [conflictToResolve, setConflictToResolve] = useState(null); // { teacherName, conflictClass, timeKey, entryKey, slotLabel }

  // Helper para verificar se slot é ativo (agora no escopo do componente para reuso)
  const isSlotActiveLocal = (classId, dayIdx, slotIdx) => {
    const cls = data.classes.find(c => c.id === classId);
    if (!cls) return false;
    const slotObj = data.timeSlots[slotIdx];
    const slotId = slotObj ? slotObj.id : String(slotIdx);

    if (cls.activeSlotsByDay && typeof cls.activeSlotsByDay === 'object') {
      const activeForDay = cls.activeSlotsByDay[dayIdx];
      return !!(activeForDay && Array.isArray(activeForDay) && activeForDay.includes(slotId));
    }
    if (cls.activeSlots && Array.isArray(cls.activeSlots) && cls.activeSlots.length > 0) {
      return cls.activeSlots.includes(slotId);
    }
    return true;
  };

  // Helper para converter horário "HH:MM" em minutos
  const timeToMinutes = (time) => {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  // Helper para detectar conflito de horário real (overlap)
  const findTeacherConflict = (teacherId, dayIdx, start, end, excludeClassId = null) => {
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);

    // Itera sobre todo o schedule
    const conflictKey = Object.keys(data.schedule || {}).find(key => {
      const entry = data.schedule[key];

      // Filtra por professor e dia
      // Obs: Precisamos saber o dia da entry.
      // A key é "classId-day-slotIdx" (geralmente) OU entry tem timeKey

      if (entry.teacherId !== teacherId) return false;
      if (excludeClassId && entry.classId === excludeClassId) return false;

      // Recupera dia e horários da entry
      let entryDayIdx = -1;
      let entryStart = "00:00";
      let entryEnd = "00:00";

      // Tenta parsear da Key
      const parts = key.split('-');
      if (parts.length >= 3) {
        const dStr = parts[parts.length - 2];
        const sStr = parts[parts.length - 1];
        const dIdx = DAYS.indexOf(dStr);
        const sIdx = parseInt(sStr, 10);

        if (dIdx >= 0 && !isNaN(sIdx)) {
          entryDayIdx = dIdx;
          const sObj = data.timeSlots[sIdx];
          if (sObj) {
            entryStart = sObj.start;
            entryEnd = sObj.end;
          }
        }
      }

      // Se falhou parse da Key, tenta timeKey (melhor)
      if (entryDayIdx === -1 && entry.timeKey) {
        const tParts = entry.timeKey.split('-');
        const dIdx = DAYS.indexOf(tParts[0]); // "Segunda" -> 0
        // ou pode ser numero? ScheduleManager usa DAYS[dayIdx].
        if (dIdx >= 0) {
          entryDayIdx = dIdx;
          // Achar slot
          const sIdx = parseInt(tParts[1], 10);
          const sObj = data.timeSlots[sIdx];
          if (sObj) {
            entryStart = sObj.start;
            entryEnd = sObj.end;
          }
        }
      }

      if (entryDayIdx !== dayIdx) return false;

      // Check Overlap
      const eStartMin = timeToMinutes(entryStart);
      const eEndMin = timeToMinutes(entryEnd);

      // (StartA < EndB) and (EndA > StartB)
      return (startMin < eEndMin && endMin > eStartMin);
    });

    return conflictKey;
  };

  // Função para calcular sugestões de alocação (Simples + Troca Local + Troca Remota)
  const calculateSuggestions = (item) => {
    const { classId, subjectId, teacherIds } = item;
    const suggestions = [];

    const targetClass = data.classes.find(c => c.id === classId);
    const subject = data.subjects.find(s => s.id === subjectId);
    if (!targetClass || !subject) return [];

    const storedTeachers = teacherIds ? Array.from(teacherIds).filter(tid => tid !== 'none') : [];
    const candidateTeachers = storedTeachers.length > 0
      ? storedTeachers.map(tid => data.teachers.find(t => t.id === tid)).filter(Boolean)
      : null;

    // --- HELPERS GENÉRICOS ---

    // 1. Verifica se Slot é Ativo numa Turma Específica
    const isSlotActiveInClass = (clsId, dIdx, sIdx) => {
      // Se for a mesma turma do contexto, usa a função local (micro-otimização)
      if (clsId === classId) return isSlotActiveLocal(clsId, dIdx, sIdx);

      // Caso contrário, busca a turma e valida
      const cls = data.classes.find(c => c.id === clsId);
      if (!cls) return false;

      const slotObj = data.timeSlots[sIdx];
      const slotId = slotObj ? slotObj.id : String(sIdx);

      if (cls.activeSlotsByDay && typeof cls.activeSlotsByDay === 'object') {
        const activeForDay = cls.activeSlotsByDay[dIdx];
        return !!(activeForDay && Array.isArray(activeForDay) && activeForDay.includes(slotId));
      }
      if (cls.activeSlots && Array.isArray(cls.activeSlots) && cls.activeSlots.length > 0) {
        return cls.activeSlots.includes(slotId);
      }
      return true;
    };

    // 2. Verifica se Professor está Livre num Horário
    const isTeacherFree = (teacher, timeKey) => {
      if (!teacher) return true;
      if (teacher.unavailable && teacher.unavailable.includes(timeKey)) return false;
      // Procura em todo o schedule se ele está alocado
      const busy = Object.values(data.schedule).some(
        entry => entry.teacherId === teacher.id && entry.timeKey === timeKey
      );
      return !busy;
    };

    // 3. Encontrar slots vazios numa turma específica onde o professor cabe
    const findEmptySlotsInClass = (clsId, teacher) => {
      const emptyList = [];
      for (let d = 0; d < DAYS.length; d++) {
        data.timeSlots.forEach((s, sIdx) => {
          if (s.type !== 'aula') return; // Ignora intervalos
          if (!s.start || !s.end) return; // Ignora slots mal formados
          const tKey = `${DAYS[d]}-${sIdx}`;

          // Ativo?
          if (!isSlotActiveInClass(clsId, d, sIdx)) return;

          // Vazio?
          if (data.schedule[`${clsId}-${tKey}`]) return;

          // Professor Livre?
          if (teacher && !isTeacherFree(teacher, tKey)) return;

          emptyList.push({
            dayIdx: d, slotIdx: sIdx, timeKey: tKey,
            slotLabel: `${s.start}-${s.end}`, day: DAYS[d]
          });
        });
      }
      return emptyList;
    };

    // --- LÓGICA PRINCIPAL ---

    // Iterar sobre todos os slots da grade da turma ALVO
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      data.timeSlots.forEach((slot, slotIdx) => {
        if (slot.type !== 'aula') return;
        if (!slot.start || !slot.end) return; // Validação extra para evitar sugestões vazias "DIRETA às "

        const absoluteIndex = slotIdx;
        const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;
        const scheduleKey = `${classId}-${timeKey}`;

        // 1. Slot Ativo?
        if (!isSlotActiveLocal(classId, dayIdx, absoluteIndex)) return;

        // 2. Matéria pode neste horário?
        if (subject.unavailable && subject.unavailable.includes(timeKey)) return;

        const currentEntry = data.schedule[scheduleKey];
        const teachersToCheck = candidateTeachers || [{ id: '', name: 'Sem Professor' }];

        teachersToCheck.forEach(teacher => {
          const teacherFree = isTeacherFree(teacher, timeKey);

          // === OPÇÃO A: Professor está Livre ===
          if (teacherFree) {
            if (!currentEntry) {
              // 1. Sugestão Direta (Slot Vazio)
              suggestions.push({
                type: 'direct',
                dayIdx, slotIdx: absoluteIndex,
                day: DAYS[dayIdx], time: `${slot.start} - ${slot.end}`,
                teacherId: teacher.id, teacherName: teacher.name, classId
              });
            } else {
              // 2. Sugestão de Troca Local (Slot Ocupado)
              const occupantTeacherId = currentEntry.teacherId;
              const occupantSubjectId = currentEntry.subjectId;

              if (occupantSubjectId === subjectId) return; // Mesma matéria

              const occupantTeacher = data.teachers.find(t => t.id === occupantTeacherId);
              const occupantSubject = data.subjects.find(s => s.id === occupantSubjectId);

              // Achar slot vazio na MESMA turma (classId)
              const moveCandidates = findEmptySlotsInClass(classId, occupantTeacher);

              moveCandidates.forEach(moveDest => {
                if (occupantSubject.unavailable && occupantSubject.unavailable.includes(moveDest.timeKey)) return;

                suggestions.push({
                  type: 'swap',
                  originalSlot: {
                    day: DAYS[dayIdx], time: `${slot.start}-${slot.end}`,
                    dayIdx, slotIdx: absoluteIndex, timeKey
                  },
                  destSlot: {
                    day: moveDest.day, time: moveDest.slotLabel,
                    dayIdx: moveDest.dayIdx, slotIdx: moveDest.slotIdx, timeKey: moveDest.timeKey
                  },
                  targetTeacher: { id: teacher.id, name: teacher.name },
                  occupant: {
                    subjectName: occupantSubject.name,
                    teacherName: occupantTeacher?.name || 'Sem Prof',
                    teacherId: occupantTeacherId, subjectId: occupantSubjectId
                  },
                  classId
                });
              });
            }
          }
          // === OPÇÃO B: Professor está Ocupado (Tentativa de Troca Remota) ===
          else if (teacher.id && !currentEntry) {
            // Condição: Slot Alvo VAZIO, mas Professor OCUPADO em outra turma.
            // Vamos achar ONDE ele está e se ele pode se mover LÁ.

            const conflictEntryKey = Object.keys(data.schedule).find(k => {
              const e = data.schedule[k];
              return e.teacherId === teacher.id && e.timeKey === timeKey;
            });

            if (conflictEntryKey) {
              const conflictEntry = data.schedule[conflictEntryKey];
              const conflictClassId = conflictEntry.classId;
              const conflictClass = data.classes.find(c => c.id === conflictClassId);

              // Se achou a turma conflituosa, temos 2 Opções Remotas
              if (conflictClass) {

                // -- OPÇÃO B1: Mover para Slot Vazio (Remote Move - Já Existente) --
                const remoteCandidates = findEmptySlotsInClass(conflictClassId, teacher);
                const conflictSubject = data.subjects.find(s => s.id === conflictEntry.subjectId);

                remoteCandidates.forEach(remDest => {
                  if (conflictSubject && conflictSubject.unavailable && conflictSubject.unavailable.includes(remDest.timeKey)) return;

                  suggestions.push({
                    type: 'remote_move',
                    targetSlot: {
                      day: DAYS[dayIdx], time: `${slot.start}-${slot.end}`,
                      dayIdx, slotIdx: absoluteIndex, timeKey
                    },
                    remoteMove: {
                      classId: conflictClassId, className: conflictClass.name,
                      fromTime: `${slot.start}-${slot.end}`, toTime: `${remDest.day} ${remDest.slotLabel}`,
                      toTimeKey: remDest.timeKey, originalKey: conflictEntryKey,
                      subjectId: conflictEntry.subjectId, teacherId: teacher.id
                    },
                    targetTeacher: { id: teacher.id, name: teacher.name },
                    classId
                  });
                });

                // -- OPÇÃO B2: Trocar com outro Professor na Turma Remota (Remote Swap - NOVO) --
                // Queremos livrar o horário 'timeKey' na 'conflictClassId' onde está 'teacher'.
                // Vamos procurar alguém LÁ (occupantRemote) em OUTRO horário (timeKeyRemote)
                // que possa trocar de lugar com 'teacher'.

                for (let d = 0; d < DAYS.length; d++) {
                  data.timeSlots.forEach((s, sIdx) => {
                    if (s.type !== 'aula') return;
                    const tKeyRem = `${DAYS[d]}-${sIdx}`;
                    const sKeyRem = `${conflictClassId}-${tKeyRem}`;

                    // Ignorar o próprio horário do conflito
                    if (tKeyRem === timeKey) return;

                    // Slot deve ser ativo e ter aula
                    if (!isSlotActiveInClass(conflictClassId, d, sIdx)) return;
                    const remoteEntry = data.schedule[sKeyRem];
                    if (!remoteEntry) return;

                    // Quem está lá?
                    const remTeacherId = remoteEntry.teacherId;
                    const remSubjectId = remoteEntry.subjectId;
                    // Se for o mesmo professor, não adianta trocar (ele continuaria ocupado ou preso)
                    if (remTeacherId === teacher.id) return;

                    const remTeacher = data.teachers.find(t => t.id === remTeacherId);
                    const remSubject = data.subjects.find(s => s.id === remSubjectId);

                    // Validação da Troca Remota:
                    // 1. Teacher (A) deve poder ir para tKeyRem
                    if (!isTeacherFree(teacher, tKeyRem)) return; // Mas ele tem que ser free GLOBALMENTE (excluindo a aula atual dele, claro, mas isTeacherFree checa tudo. Como ele não está em tKeyRem, ok).
                    if (conflictSubject && conflictSubject.unavailable && conflictSubject.unavailable.includes(tKeyRem)) return;

                    if (remSubject && remSubject.unavailable && remSubject.unavailable.includes(timeKey)) return;

                    // Antigravity Filter: Strict checks for Remote Swap feasibility

                    // 1. Immutable Subjects: Don't swap if the remote subject is Synchronous (complex constraint)
                    if (remSubject && remSubject.isSynchronous) return;

                    // 2. Shift Compatibility Check
                    const slotShift = computeSlotShift(slot);
                    // Teacher A (Original) -> Must accept Remote Slot (tKeyRem)
                    // We need the shift of tKeyRem. We can infer it or get it from data.timeSlots[sIdx]
                    const remSlotObj = data.timeSlots[sIdx];
                    const remSlotShift = computeSlotShift(remSlotObj);

                    const teacherAShifts = new Set(teacher.shifts || []);
                    if (teacherAShifts.size > 0) {
                      // He must support the destination shift
                      if (!teacherAShifts.has(remSlotShift) &&
                        !teacherAShifts.has('Integral (Manhã e Tarde)') &&
                        !teacherAShifts.has('Integral (Tarde e Noite)')) {
                        // Allow if the specific integral shift matches, handled by simple 'has' check usually, 
                        // but let's be safe: if strict shift doesn't match and no integral covers it.
                        // Simpler: Just check if one of his shifts covers this slot.
                        const covers = (teacher.shifts || []).some(s => {
                          if (s === remSlotShift) return true;
                          if (s === 'Integral (Manhã e Tarde)' && (remSlotShift === 'Manhã' || remSlotShift === 'Tarde')) return true;
                          if (s === 'Integral (Tarde e Noite)' && (remSlotShift === 'Tarde' || remSlotShift === 'Noite')) return true;
                          return false;
                        });
                        if (!covers) return;
                      }
                    }

                    // Teacher B (Remote) -> Must accept Conflict Slot (timeKey/slotShift)
                    const teacherBShifts = new Set(remTeacher.shifts || []);
                    if (teacherBShifts.size > 0) {
                      const covers = (remTeacher.shifts || []).some(s => {
                        if (s === slotShift) return true;
                        if (s === 'Integral (Manhã e Tarde)' && (slotShift === 'Manhã' || slotShift === 'Tarde')) return true;
                        if (s === 'Integral (Tarde e Noite)' && (slotShift === 'Tarde' || slotShift === 'Noite')) return true;
                        return false;
                      });
                      if (!covers) return;
                    }

                    // 3. Ensure Teacher B is actually free at the conflict time (timeKey)
                    // (We checked shift compatibility, but is he busy elsewhere?)
                    if (!isTeacherFree(remTeacher, timeKey)) return;

                    // Se tudo ok, sugere troca dupla
                    suggestions.push({
                      type: 'remote_swap',
                      targetSlot: {
                        day: DAYS[dayIdx], time: `${slot.start}-${slot.end}`,
                        dayIdx, slotIdx: absoluteIndex, timeKey
                      },
                      remoteSwap: {
                        classId: conflictClassId, className: conflictClass.name,
                        teacherA: { id: teacher.id, name: teacher.name, subjectId: conflictEntry.subjectId, entryKey: conflictEntryKey, timeKey: timeKey, timeLabel: `${slot.start}-${slot.end}` },
                        teacherB: { id: remTeacherId, name: remTeacher?.name || '?', subjectId: remSubjectId, entryKey: sKeyRem, timeKey: tKeyRem, timeLabel: `${s.start}-${s.end}` }
                      },
                      targetTeacher: { id: teacher.id, name: teacher.name },
                      classId
                    });
                  });
                }
              }
            }
          }
        });
      });
    }

    // Antigravity Filter: Ensure all suggestions are valid (have time strings)
    // "DIRETA às " issue happens when time is undefined or empty
    return suggestions.filter(s => {
      if (s.type === 'direct') {
        if (!s.day || !s.time) return false;
        // Check for empty time string like " - " or just whitespace
        const cleanTime = s.time.replace(/[^0-9:]/g, '');
        if (cleanTime.length < 3) return false;
      }
      return true;
    });
  };

  const handleResolveClick = (item) => {
    const suggestions = calculateSuggestions(item);
    setResolveModal({ item, suggestions });
  };

  const applySuggestion = (suggestion) => {
    const { classId } = suggestion;
    const { subjectId } = resolveModal.item;

    if (suggestion.type === 'direct') {
      // Adição Simples
      const { dayIdx, slotIdx, teacherId } = suggestion;
      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      const scheduleKey = `${classId}-${timeKey}`;

      setData(prev => ({
        ...prev,
        schedule: {
          ...(prev.schedule || {}),
          [scheduleKey]: { teacherId, subjectId, classId, timeKey }
        }
      }));
      setManualLog(prev => [`Resolvido: +${data.subjects.find(s => s.id === subjectId)?.name} em ${DAYS[dayIdx]}`, ...prev]);

    } else if (suggestion.type === 'swap') {
      // Troca Complexa
      const { originalSlot, destSlot, targetTeacher, occupant } = suggestion;

      const keyOriginal = `${classId}-${originalSlot.timeKey}`; // Onde está o B, vai entrar o A (Alvo)
      const keyDest = `${classId}-${destSlot.timeKey}`;         // Onde está Vazio, vai entrar o B (Ocupante)

      setData(prev => {
        const newSchedule = { ...(prev.schedule || {}) };

        // 1. Mover Ocupante (B) para Destino
        newSchedule[keyDest] = {
          teacherId: occupant.teacherId,
          subjectId: occupant.subjectId,
          classId,
          timeKey: destSlot.timeKey
        };

        // 2. Colocar Alvo (A) no Original (agora liberado)
        newSchedule[keyOriginal] = {
          teacherId: targetTeacher.id,
          subjectId: subjectId,
          classId,
          timeKey: originalSlot.timeKey
        };

        return { ...prev, schedule: newSchedule };
      });
      setManualLog(prev => [
        `Troca: ${occupant.subjectName} movido p/ ${destSlot.day} ${destSlot.time}. +${data.subjects.find(s => s.id === subjectId)?.name} em ${originalSlot.day}`,
        ...prev
      ]);
    } else if (suggestion.type === 'remote_move') {
      const { remoteMove, targetSlot, targetTeacher } = suggestion;
      // 1. Mover a aula da outra turma (Y) para o novo slot
      const keyY_Old = remoteMove.originalKey;
      const keyY_New = `${remoteMove.classId}-${remoteMove.toTimeKey}`;
      // 2. Adicionar a aula na turma atual (X) no slot liberado
      const keyX_New = `${classId}-${targetSlot.timeKey}`;

      setData(prev => {
        const newSchedule = { ...(prev.schedule || {}) };

        // Move Y
        const entryY = newSchedule[keyY_Old];
        delete newSchedule[keyY_Old];
        newSchedule[keyY_New] = {
          ...entryY,
          timeKey: remoteMove.toTimeKey
        };

        // Add X
        newSchedule[keyX_New] = {
          teacherId: targetTeacher.id,
          subjectId: subjectId,
          classId,
          timeKey: targetSlot.timeKey
        };

        return { ...prev, schedule: newSchedule };
      });

      setManualLog(prev => [
        `Remoto: ${remoteMove.className} movido p/ ${remoteMove.toTime}. +${data.subjects.find(s => s.id === subjectId)?.name} aqui.`,
        ...prev
      ]);
    } else if (suggestion.type === 'remote_swap') {
      const { remoteSwap, targetSlot, targetTeacher } = suggestion;
      // 1. Na turma Remota: Trocar A e B de lugar
      const keyA = remoteSwap.teacherA.entryKey;
      const keyB = remoteSwap.teacherB.entryKey;

      // 2. Na turma Atual: Adicionar A (que agora liberou o horário targetSlot.timeKey)
      const keyX = `${classId}-${targetSlot.timeKey}`;

      setData(prev => {
        const newSchedule = { ...(prev.schedule || {}) };

        const entryA = newSchedule[keyA]; // Teacher A em T1
        const entryB = newSchedule[keyB]; // Teacher B em T2

        // Swap Remote
        // A chave do schedule é "Class-Time".
        // Se trocarmos os tempos, trocamos as chaves.
        // EntryA estava em TimeA -> Vai para TimeB.
        // EntryB estava em TimeB -> Vai para TimeA.

        // Chaves novas
        const newKeyForA = `${remoteSwap.classId}-${remoteSwap.teacherB.timeKey}`; // A vai p/ slot do B
        const newKeyForB = `${remoteSwap.classId}-${remoteSwap.teacherA.timeKey}`; // B vai p/ slot do A

        // Deleta as entradas antigas
        delete newSchedule[keyA];
        delete newSchedule[keyB];

        // Atualiza dados
        newSchedule[newKeyForA] = { ...entryA, timeKey: remoteSwap.teacherB.timeKey };
        newSchedule[newKeyForB] = { ...entryB, timeKey: remoteSwap.teacherA.timeKey };

        // Add Local
        newSchedule[keyX] = {
          teacherId: targetTeacher.id, subjectId,
          classId, timeKey: targetSlot.timeKey
        };

        return { ...prev, schedule: newSchedule };
      });

      setManualLog(prev => [
        `Remoto COMPLEXO: ${remoteSwap.teacherB.name} trocou com ${remoteSwap.teacherA.name} na ${remoteSwap.className}. +${data.subjects.find(s => s.id === subjectId)?.name} aqui.`,
        ...prev
      ]);
    }

    setResolveModal(null);
  };

  const recomputePending = () => {
    try {
      const lines = [];
      let totalExpected = 0;
      let totalAllocated = 0;
      let totalPending = 0;

      const newPendingItems = []; // Lista estruturada

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

      // Coletar todas as atividades esperadas (Agrupado por MATÉRIA/TURMA)
      const expectedByKey = {};
      const teachersByKey = {};
      const seenActivities = new Set();

      (data.activities || []).forEach(act => {
        const checkKey = `${act.classId}-${act.subjectId}-${act.teacherId}`;
        const aggKey = `${act.classId}-${act.subjectId}`;

        if (!seenActivities.has(checkKey)) {
          const qty = parseInt(act.quantity) || 0;
          expectedByKey[aggKey] = (expectedByKey[aggKey] || 0) + qty;
          seenActivities.add(checkKey);

          if (!teachersByKey[aggKey]) teachersByKey[aggKey] = new Set();
          if (act.teacherId) teachersByKey[aggKey].add(act.teacherId);
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
      // Índice de alocação por (turma-matéria)
      const allocatedIndex = {};
      Object.entries(data.schedule || {}).forEach(([key, entry]) => {
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

        if (dayIdx === undefined || dayIdx === -1 || slotIdx === undefined) return;
        if (!isSlotActiveLocal(entry.classId, dayIdx, slotIdx)) return;

        // Chave de agregação simplificada: Class-Subject
        const aggKey = `${entry.classId}-${entry.subjectId}`;
        allocatedIndex[aggKey] = (allocatedIndex[aggKey] || 0) + 1;
      });

      // Coletar totais e calcular pendências por MATÉRIA
      let totalExcess = 0;
      const excessDetails = [];
      const missingDetails = [];

      Object.entries(expectedByKey).forEach(([key, expected]) => {
        const allocated = allocatedIndex[key] || 0;
        const missing = Math.max(0, expected - allocated);
        const excess = Math.max(0, allocated - expected);

        totalExpected += expected;
        totalAllocated += allocated;
        totalPending += missing;
        totalExcess += excess;

        const [classId, subjectId] = key.split('-');
        const className = data.classes.find(c => c.id === classId)?.name || 'Turma';
        const subjectName = data.subjects.find(s => s.id === subjectId)?.name || 'Matéria';

        let teacherDisplay = '';
        const teacherIds = teachersByKey[key];
        if (teacherIds && teacherIds.size > 0) {
          const names = Array.from(teacherIds).map(tid =>
            data.teachers.find(t => t.id === tid)?.name || 'Prof.?'
          ).join(' / ');
          teacherDisplay = names;
        } else {
          teacherDisplay = 'Sem professor';
        }

        if (missing > 0) {
          const item = { className, subjectName, teacherName: teacherDisplay, allocated, expected, missing, classId, subjectId, teacherIds };
          missingDetails.push(item);
          newPendingItems.push(item);
        }

        if (excess > 0) {
          excessDetails.push(`${subjectName} - ${className}: +${excess}`);
        }
      });

      const unknownAllocationsCount = Math.max(0, totalUsedSlots - totalAllocated);
      // totalAllocated aqui soma (Expected ou Reference) + Excess.
      // Se eu tenho 1 planned, 10 allocated. totalAllocated+=10.
      // Se totalUsedSlots=10. Diff=0.
      // Se tenho 0 planned (activity removed), 10 allocated. totalAllocated não soma nada (não entra no loop).
      // totalUsedSlots=10. Diff=10. -> Unknown/Unplanned.

      // Organizar por matéria/turma para exibição NO LOG DE TEXTO (Legado)
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
        `   ✅ Total alocado (Conhecido): ${totalAllocated} aula(s)`,
      ];

      if (totalExcess > 0) {
        header.push(`   ⚠️ Excedentes: ${totalExcess} aula(s) (incluso no total alocado)`);
      }
      if (unknownAllocationsCount > 0) {
        header.push(`   ❓ Alocações desconhecidas/fantasmas: ${unknownAllocationsCount} slot(s)`);
      }

      header.push(`   ⏳ Total de pendências: ${totalPending} aula(s)`);

      const finalLog = [...header];
      if (totalPending === 0) finalLog.push('', '✅ Sem pendências para esta grade.');
      else finalLog.push('', 'Detalhamento das pendências:', '', ...lines);
      if (excessDetails.length > 0) finalLog.push('', 'Detalhamento de Excedentes:', ...excessDetails);

      setPendingLog(finalLog);
      setPendingItems(newPendingItems); // Salva estado estruturado

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

    // Verificar conflito de professor (Agora usando overlap real)
    const conflictEntryKey = findTeacherConflict(newEntry.teacherId, dayIdx, slot.start, slot.end, targetClass);

    if (conflictEntryKey) {
      const conflictEntry = data.schedule[conflictEntryKey];
      const conflictClass = data.classes.find(c => c.id === conflictEntry.classId);
      const conflictSubject = data.subjects.find(s => s.id === conflictEntry.subjectId);

      // Tentar recuperar horário legível do conflito
      let conflictTimeLabel = "?";
      // ... Lógica para pegar slot time do conflictEntry (já fizemos no findTeacherConflict mas não retornamos, vamos re-buscar rapido)
      if (conflictEntry.timeKey) {
        const tParts = conflictEntry.timeKey.split('-');
        const sIdx = parseInt(tParts[1]);
        const sObj = data.timeSlots[sIdx];
        if (sObj) conflictTimeLabel = `${sObj.start}-${sObj.end}`;
      }

      // Em vez de alertar, ativa modo de resolução de conflito no modal
      setConflictToResolve({
        teacherName,
        conflictClass,
        timeKey, // Key do slot que estamos tentando adicionar
        entryKey: conflictEntryKey, // Key da entrada que está bloqueando (overlap)
        slotLabel: `${DAYS[dayIdx]} ${slot?.start || ''}-${slot?.end || ''}`,
        conflictSubjectName: conflictSubject?.name,
        // Adicional: info sobre o horário do conflito para exibir
        conflictTimeLabel: `${DAYS[dayIdx]} ${conflictTimeLabel}`
      });
      return;
    }

    // Sem conflito - Adiciona direto
    executeAddLesson(scheduleKey, targetClass, timeKey, subjectName, teacherName, className, dayIdx, slot);
  };

  const executeAddLesson = (scheduleKey, targetClass, timeKey, subjectName, teacherName, className, dayIdx, slot) => {
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

    setManualLog(prev => [
      `Adicionado: ${subjectName} (${teacherName}) na turma ${className} em ${DAYS[dayIdx]} ${slot?.start || ''}-${slot?.end || ''}`,
      ...prev
    ].slice(0, 200));

    closeAddModal();
  };

  const handleForceAddLesson = () => {
    if (!conflictToResolve || !selectedCell) return;

    const { dayIdx, slotIdx, classId } = selectedCell;
    const targetClass = classId;
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    const scheduleKey = `${targetClass}-${timeKey}`;

    const slot = data.timeSlots[slotIdx];
    const className = data.classes.find(c => c.id === targetClass)?.name || 'Turma';
    const subjectName = data.subjects.find(s => s.id === newEntry.subjectId)?.name || 'Matéria';
    const teacherName = data.teachers.find(t => t.id === newEntry.teacherId)?.name || 'Professor';

    setData(prev => {
      const newSchedule = { ...(prev.schedule || {}) };

      // 1. Remove conflitante
      delete newSchedule[conflictToResolve.entryKey];

      // 2. Adiciona novo
      newSchedule[scheduleKey] = {
        teacherId: newEntry.teacherId,
        subjectId: newEntry.subjectId,
        classId: targetClass,
        timeKey: timeKey
      };

      return { ...prev, schedule: newSchedule };
    });

    setManualLog(prev => [
      `Forçado: Removido ${conflictToResolve.conflictSubjectName} da ${conflictToResolve.conflictClass?.name} e Adicionado ${subjectName} aqui (${className}).`,
      ...prev
    ].slice(0, 200));

    closeAddModal();
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewEntry({ teacherId: '', subjectId: '' });
    setSelectedCell(null);
    setConflictToResolve(null);
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
          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${editMode
                ? 'bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-200'
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

            <button
              onClick={() => exportAllSchedulesToExcel(data)}
              className="bg-indigo-800 text-white px-4 py-3 rounded-lg hover:bg-indigo-900 transition-colors flex items-center justify-center gap-2 shadow-sm"
              title="Baixar todas as grades em Excel"
            >
              <FileSpreadsheet size={20} />
              <span className="text-sm font-medium">Baixar Planilha</span>
            </button>
          </div>
        </div>
      </div>


      {/* Resumo de Pendências (Visual + Ações) */}
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

        {pendingLog.length === 0 && pendingItems.length === 0 ? (
          <p className="text-xs text-slate-500">Calculando...</p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2 text-xs text-slate-700">
            {/* Renderização rica de itens pendentes */}
            {pendingItems.length > 0 && pendingItems.map((item, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded p-2 flex items-center justify-between shadow-sm">
                <div>
                  <div className="font-bold text-indigo-700">{item.subjectName}</div>
                  <div className="text-slate-500">{item.className} — {item.teacherName}</div>
                  <div className="text-amber-600 font-semibold mt-1">
                    Faltam {item.missing} de {item.expected}
                  </div>
                </div>
                <button
                  onClick={() => handleResolveClick(item)}
                  className="flex flex-col items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-2 rounded transition-colors"
                  title="Encontrar horários livres para este professor nesta turma"
                >
                  <span className="text-lg">💡</span>
                  <span className="text-[10px] font-bold">Resolver</span>
                </button>
              </div>
            ))}

            {/* Exibir linhas de log genéricas (totais, excessos) que não são itens acionáveis */}
            {pendingLog.filter(l => !l.startsWith('•')).map((line, idx) => (
              <div key={`log-${idx}`} className="text-slate-500 px-1 border-l-2 border-transparent">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Sugestões (Resolver Pendência) */}
      {resolveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-indigo-50 rounded-t-xl">
              <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                💡 Sugestões de Alocação
              </h3>
              <button onClick={() => setResolveModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <p className="text-sm text-slate-700">
                Resolvendo: <strong>{resolveModal.item.subjectName}</strong> na turma <strong>{resolveModal.item.className}</strong>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Mostrando horários onde a turma está livre E o professor ({resolveModal.item.teacherName}) está disponível.
              </p>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {resolveModal.suggestions.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p className="text-lg mb-2">😕 Nenhum horário encontrado</p>
                  <p className="text-sm">Não há cruzamento livre entre a turma e o professor.</p>
                </div>
              ) : (
                resolveModal.suggestions.map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => applySuggestion(sug)}
                    className="w-full text-left bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 p-3 rounded-lg transition-all group"
                  >
                    {sug.type === 'swap' ? (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 font-bold uppercase tracking-wider">Troca Local</span>
                            <div className="font-bold text-slate-700 group-hover:text-indigo-700">
                              {sug.originalSlot.day} às {sug.originalSlot.time}
                            </div>
                          </div>
                          <div className="text-xs text-slate-600 space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="text-red-500">🔻 Sai:</span>
                              <span>{sug.occupant.subjectName} ({sug.occupant.teacherName.split(' ')[0]})</span>
                              <span className="text-slate-400 mx-1">→</span>
                              <span className="font-semibold">{sug.destSlot.day} {sug.destSlot.time}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-green-600">BV Entra:</span>
                              <span className="font-semibold">{resolveModal.item.subjectName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                          Trocar →
                        </div>
                      </div>
                    ) : sug.type === 'remote_move' ? (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded border border-purple-200 font-bold uppercase tracking-wider">Troca Remota</span>
                            <div className="font-bold text-slate-700 group-hover:text-indigo-700">
                              {sug.targetSlot.day} às {sug.targetSlot.time}
                            </div>
                          </div>
                          <div className="text-xs text-slate-600 space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="text-purple-600">⚡ Desbloqueio:</span>
                              <span className="italic">Move {sug.targetTeacher.name} na {sug.remoteMove.className}</span>
                            </div>
                            <div className="flex items-center gap-1 pl-4 border-l-2 border-purple-100">
                              <span className="text-slate-500">De:</span> {sug.remoteMove.fromTime}
                              <span className="text-slate-400">→</span>
                              <span className="font-semibold">{sug.remoteMove.toTime}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-green-600">BV Entra:</span>
                              <span className="font-semibold">{resolveModal.item.subjectName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                          Mover →
                        </div>
                      </div>
                    ) : sug.type === 'remote_swap' ? (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-fuchsia-100 text-fuchsia-800 text-[10px] px-1.5 py-0.5 rounded border border-fuchsia-200 font-bold uppercase tracking-wider">Troca Remota Dupla</span>
                            <div className="font-bold text-slate-700 group-hover:text-indigo-700">
                              {sug.targetSlot.day} às {sug.targetSlot.time}
                            </div>
                          </div>
                          <div className="text-xs text-slate-600 space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="text-fuchsia-600">⚡ Na {sug.remoteSwap.className}:</span>
                            </div>
                            <div className="pl-4 border-l-2 border-fuchsia-100 space-y-1 my-1">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold text-slate-700">{sug.remoteSwap.teacherB.name}</span>
                                  <span className="text-slate-500 text-[10px] bg-slate-100 px-1 rounded">
                                    {data.subjects.find(s => s.id === sug.remoteSwap.teacherB.subjectId)?.name}
                                  </span>
                                  <span className="text-slate-400 mx-1">↔</span>
                                  <span className="font-semibold text-slate-700">{sug.remoteSwap.teacherA.name}</span>
                                  <span className="text-slate-500 text-[10px] bg-slate-100 px-1 rounded">
                                    {data.subjects.find(s => s.id === sug.remoteSwap.teacherA.subjectId)?.name}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 italic">
                                  (Trocam de horário lá para liberar o Prof. {sug.remoteSwap.teacherA.name})
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-green-600">BV Entra Aqui:</span>
                              <span className="font-semibold">{resolveModal.item.subjectName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                          Resolver →
                        </div>
                      </div>
                    ) : sug.type === 'indirect_swap' ? (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 font-bold uppercase tracking-wider">Troca Tripla (Rotação)</span>
                            <div className="font-bold text-slate-700 group-hover:text-indigo-700">
                              {sug.targetSlot.day} às {sug.targetSlot.time}
                            </div>
                          </div>
                          <div className="text-xs text-slate-600 space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="text-amber-600">⚡ Na {sug.rotation.className}:</span>
                            </div>
                            <div className="pl-4 border-l-2 border-amber-100 space-y-1 my-1 text-[10px]">
                              <div className="flex items-center gap-1">
                                <span className="font-semibold">{sug.rotation.teacherA.name}</span>
                                <span className="text-slate-400">→</span>
                                <span>{sug.rotation.teacherB.timeLabel}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold">{sug.rotation.teacherB.name}</span>
                                <span className="text-slate-400">→</span>
                                <span>{sug.rotation.teacherC.timeLabel}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold">{sug.rotation.teacherC.name}</span>
                                <span className="text-slate-400">→</span>
                                <span>{sug.rotation.teacherA.timeLabel}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-green-600">BV Entra Aqui:</span>
                              <span className="font-semibold">{resolveModal.item.subjectName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                          Rotação →
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded border border-green-200 font-bold uppercase tracking-wider">Direta</span>
                            <div className="font-bold text-slate-700 group-hover:text-indigo-700">
                              {sug.day} às {sug.time}
                            </div>
                          </div>
                          <div className="text-xs text-slate-500">
                            Prof. {sug.teacherName}
                          </div>
                        </div>
                        <div className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ml-2">
                          Alocar →
                        </div>
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
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
              // Une todos os slots ativos APENAS dos dias visíveis (0..4)
              const visibleSlots = new Set();
              for (let d = 0; d < DAYS.length; d++) {
                const daySlots = cls.activeSlotsByDay[d];
                if (Array.isArray(daySlots)) {
                  daySlots.forEach(id => visibleSlots.add(id));
                }
              }
              return Array.from(visibleSlots);
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
                                const isActiveDaySlot = isSlotActiveLocal(cls.id, dayIdx, absoluteIndex);
                                const isEmpty = !entry;
                                const isAvailable = isSlotAvailable(dayIdx, absoluteIndex);

                                // Se o slot não está ativo neste dia (config da turma), renderiza célula bloqueada
                                if (!isActiveDaySlot) {
                                  return (
                                    <td key={dayIdx} className="border border-slate-300 p-2 bg-slate-100">
                                      {/* Célula Vazia / Bloqueada */}
                                    </td>
                                  );
                                }

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
              {conflictToResolve ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="text-red-800 font-bold flex items-center gap-2 mb-2">
                    <AlertCircle size={20} />
                    Conflito de Horário
                  </h4>
                  <p className="text-red-700 text-sm mb-3">
                    O professor <strong>{conflictToResolve.teacherName}</strong> já está alocado neste horário:
                  </p>
                  <div className="bg-white/60 p-3 rounded border border-red-100 text-sm text-red-900">
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold">Turma:</span>
                      <span>{conflictToResolve.conflictClass?.name}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold">Matéria:</span>
                      <span>{conflictToResolve.conflictSubjectName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Horário:</span>
                      <span>{conflictToResolve.slotLabel}</span>
                    </div>
                  </div>
                  <p className="text-red-700 text-xs mt-3">
                    Deseja remover a aula da outra turma e adicionar aqui?
                  </p>
                </div>
              ) : (
                <>
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
                      {data.teachers
                        .filter(t => {
                          if (!selectedCell) return true;
                          // Filter 1: Check if teacher is assigned to this class in activities
                          const hasActivity = (data.activities || []).some(act =>
                            act.classId === selectedCell.classId && act.teacherId === t.id
                          );
                          /* Se não tiver atividades, fallback para mostrar todos? 
                             Não, o user pediu "só apareça o professor atribuido". 
                             Mas se for uma aula de reforço (extra)? 
                             Vamos assumir estrito. Se lista ficar vazia, user vai reclamar, ai relaxamos. */
                          return hasActivity;
                        })
                        .map(t => (
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
                      {data.subjects
                        .filter(s => {
                          if (!newEntry.teacherId) return true;

                          // Filter 2: Check if teacher teaches this subject IN THIS CLASS
                          if (selectedCell) {
                            const validInClass = (data.activities || []).some(act =>
                              act.classId === selectedCell.classId &&
                              act.teacherId === newEntry.teacherId &&
                              act.subjectId === s.id
                            );
                            if (validInClass) return true;
                          }

                          // Fallback: Se não achou na atividade da turma (ex: aula exta), checa global?
                          // O user pediu: "só apareça a matéria atribuida aquele professor".
                          // Vamos ser estritos na turma.
                          return false;
                        })
                        .map(s => (
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
                </>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              {conflictToResolve ? (
                <>
                  <button
                    onClick={() => setConflictToResolve(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleForceAddLesson}
                    className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <AlertCircle size={16} />
                    Remover da outra turma e Adicionar aqui
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      setNewEntry({ teacherId: '', subjectId: '' });
                      setSelectedCell(null);
                      setConflictToResolve(null);
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualEditSection;
