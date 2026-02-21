/**
 * Funções helper para formatação, descrição e cálculos de agendamento
 * Responsabilidade: Utilitários de transformação de dados para exibição e cálculos
 */

import { DAYS } from '../utils';

/**
 * Descreve uma atividade em formato legível
 */
export function describeActivity(activity, data) {
  const subjectName = data.subjects.find(s => s.id === activity.subjectId)?.name || activity.subjectId;
  const className = data.classes.find(c => c.id === activity.classId)?.name || activity.classId;
  const teacherName = data.teachers.find(t => t.id === activity.teacherId)?.name || activity.teacherId || 'Sem professor';
  return `${subjectName} / ${className} (Prof. ${teacherName})`;
}

/**
 * Descreve uma entrada de agendamento (booked entry)
 */
export function describeEntry(entry, data) {
  const subjectName = data.subjects.find(s => s.id === entry.subjectId)?.name || entry.subjectId;
  const className = data.classes.find(c => c.id === entry.classId)?.name || entry.classId;
  const teacherName = data.teachers.find(t => t.id === entry.teacherId)?.name || entry.teacherId;
  return `${subjectName} em ${className} (Prof. ${teacherName})`;
}

/**
 * Formata um rótulo de slot de tempo
 */
export function formatSlotLabel(timeSlots, dayIdx, slotIdx) {
  // Validação de segurança
  if (slotIdx === undefined || slotIdx === null || slotIdx < 0 || slotIdx >= timeSlots.length) {
    return `${DAYS[dayIdx] || 'Dia?'}-${slotIdx || '?'}`;
  }

  const slot = timeSlots[slotIdx];
  return slot ? `${DAYS[dayIdx]} ${slot.start}-${slot.end}` : `${DAYS[dayIdx]}-${slotIdx}`;
}

/**
 * Calcula aulas excedentes (acima do planejado) por turma/matéria e por professor
 */
export function computeOverAllocations(data, bookedEntries) {
  const expectedBySubject = new Map();
  const expectedByTeacher = new Map();

  for (const act of data.activities || []) {
    const key = `${act.classId}-${act.subjectId}`;
    expectedBySubject.set(key, (expectedBySubject.get(key) || 0) + (Number(act.quantity) || 0));

    const tKey = `${act.classId}-${act.subjectId}-${act.teacherId || 'none'}`;
    expectedByTeacher.set(tKey, (expectedByTeacher.get(tKey) || 0) + (Number(act.quantity) || 0));
  }

  const allocatedBySubject = new Map();
  const allocatedByTeacher = new Map();

  for (const entry of bookedEntries || []) {
    const key = `${entry.classId}-${entry.subjectId}`;
    allocatedBySubject.set(key, (allocatedBySubject.get(key) || 0) + 1);

    const tKey = `${entry.classId}-${entry.subjectId}-${entry.teacherId || 'none'}`;
    allocatedByTeacher.set(tKey, (allocatedByTeacher.get(tKey) || 0) + 1);
  }

  const subjectExcess = [];
  const teacherExcess = [];

  for (const [key, allocated] of allocatedBySubject.entries()) {
    const expected = expectedBySubject.get(key) || 0;
    if (allocated > expected) {
      const [classId, subjectId] = key.split('-');
      subjectExcess.push({ classId, subjectId, allocated, expected, excess: allocated - expected });
    }
  }

  for (const [key, allocated] of allocatedByTeacher.entries()) {
    const expected = expectedByTeacher.get(key) || 0;
    if (allocated > expected) {
      const [classId, subjectId, teacherId] = key.split('-');
      teacherExcess.push({ classId, subjectId, teacherId, allocated, expected, excess: allocated - expected });
    }
  }

  const totalExcess = subjectExcess.reduce((s, e) => s + e.excess, 0) + teacherExcess.reduce((s, e) => s + e.excess, 0);

  return { subjectExcess, teacherExcess, totalExcess };
}

/**
 * Calcula o span (intervalo) de uma entrada (aula simples ou dupla)
 */
export function getEntrySpan(manager, entry) {
  const baseSlot = entry.slotIdx;
  const dayIdx = entry.dayIdx;
  const baseKey = `${entry.classId}-${DAYS[dayIdx]}-${baseSlot}`;
  const current = manager.schedule[baseKey];

  if (current?.isDoubleLesson) {
    return [baseSlot, baseSlot + 1];
  }

  const prevKey = `${entry.classId}-${DAYS[dayIdx]}-${baseSlot - 1}`;
  const prev = manager.schedule[prevKey];
  if (prev?.isDoubleLesson && prev.teacherId === entry.teacherId && prev.subjectId === entry.subjectId) {
    return [baseSlot - 1, baseSlot];
  }

  return [baseSlot];
}

/**
 * Monta lista de pendências (quantidade a alocar) sem modificar a grade
 */
export function buildPendingActivitiesForRepair(data, manager) {
  const timeSlots = data.timeSlots || [];

  // Helper: Validar se uma alocação é realmente válida (slot de aula + ativo)
  const isValidAllocation = (entry) => {
    if (!entry.classId || !entry.subjectId) return false;
    
    let slotIdx = entry.slotIdx;
    let dayIdx = entry.dayIdx;
    
    // Se não tem slotIdx/dayIdx, tenta extrair do timeKey
    if ((slotIdx === undefined || dayIdx === undefined) && entry.timeKey) {
      const parts = entry.timeKey.split('-');
      const dayStr = parts[0];
      const slotStr = parts[1];
      
      dayIdx = DAYS.indexOf(dayStr);
      slotIdx = parseInt(slotStr, 10);
    }
    
    if (dayIdx === undefined || dayIdx < 0 || slotIdx === undefined) return false;
    
    const slot = timeSlots[slotIdx];
    if (!slot || slot.type !== 'aula') return false;
    
    const classData = data.classes?.find(c => c.id === entry.classId);
    if (!classData) return false;
    
    // Verificar se slot está ativo
    const slotId = slot.id ?? String(slotIdx);
    if (classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
      const activeSlotsForDay = classData.activeSlotsByDay[dayIdx];
      if (!activeSlotsForDay || !Array.isArray(activeSlotsForDay) || !activeSlotsForDay.includes(slotId)) {
        return false;
      }
    } else if (classData.activeSlots && Array.isArray(classData.activeSlots)) {
      if (!classData.activeSlots.includes(slotId)) return false;
    }
    
    return true;
  };

  const bookedCounts = {};

  for (const entry of manager.bookedEntries) {
    // Filtrar apenas alocações válidas
    if (!isValidAllocation(entry)) continue;
    
    const key = `${entry.classId}-${entry.subjectId}`;
    bookedCounts[key] = (bookedCounts[key] || 0) + 1;
  }

  const demandMap = {};

  for (const activity of data.activities) {
    const key = `${activity.classId}-${activity.subjectId}`;
    if (!demandMap[key]) demandMap[key] = { totalNeeded: 0, activities: [] };
    demandMap[key].totalNeeded += Number(activity.quantity) || 0;
    demandMap[key].activities.push(activity);
  }

  const pending = [];

  for (const [key, demand] of Object.entries(demandMap)) {
    const alreadyBooked = bookedCounts[key] || 0;
    let missing = demand.totalNeeded - alreadyBooked;
    if (missing <= 0) continue;

    for (const activity of demand.activities) {
      if (missing <= 0) break;
      const qty = Math.min(missing, Number(activity.quantity) || 0);
      if (qty > 0) {
        pending.push({ ...activity, quantity: qty });
        missing -= qty;
      }
    }
  }

  return pending;
}

/**
 * Verifica se um slot é ativo para uma turma
 */
export function isSlotActive(classData, dayIdx, slotId) {
  if (!classData) return false;

  // Prioriza activeSlotsByDay se existir (Verificação Estrita: mesmo que vazio, deve ser respeitado)
  if (classData.activeSlotsByDay && typeof classData.activeSlotsByDay === 'object') {
    const activeSlotsForDay = classData.activeSlotsByDay[dayIdx];
    // Se activeSlotsForDay for undefined (não configurado para o dia), retorna false (inativo)
    return !!(activeSlotsForDay && Array.isArray(activeSlotsForDay) && activeSlotsForDay.includes(slotId));
  }

  // Fallback para activeSlots (global/legado)
  if (classData.activeSlots && Array.isArray(classData.activeSlots) && classData.activeSlots.length > 0) {
    return classData.activeSlots.includes(slotId);
  }

  // Se não houver nenhuma configuração de slots ativos (nem nova nem legada),
  // assumimos que a turma NÃO TEM slots disponíveis (segurança contra alocação fantasma).
  // Isso força o usuário a configurar a turma.
  return false;
}

/**
 * Remove entradas inválidas da grade (Deep Clean)
 * Retorna uma nova grade limpa.
 */
export function cleanSchedule(data) {
  const newSchedule = {};
  const schedule = data.schedule || {};
  const timeSlots = data.timeSlots || [];

  let removedCount = 0;
  const totalEntries = Object.keys(schedule).length;

  Object.entries(schedule).forEach(([key, entry]) => {
    // Validação básica de integridade
    if (!entry || !entry.classId) {
      removedCount++;
      return;
    }

    // Recuperar índices
    let dayIdx = entry.dayIdx;
    let slotIdx = entry.slotIdx;

    // Parse key se necessário
    if (entry.timeKey) {
      const parts = entry.timeKey.split('-');
      const dIdx = DAYS.indexOf(parts[0]);
      if (dIdx >= 0) dayIdx = dIdx;
      else {
        const maybe = parseInt(parts[0]);
        if (!isNaN(maybe) && maybe >= 0 && maybe < DAYS.length) dayIdx = maybe;
      }
    }

    if (dayIdx === undefined || slotIdx === undefined) {
      const parts = key.split('-');
      if (parts.length >= 3) {
        slotIdx = parseInt(parts[2]);
        // Try day from parts[1]
        const dIdx = DAYS.indexOf(parts[1]);
        if (dIdx >= 0) dayIdx = dIdx;
        else {
          const m = parseInt(parts[1]);
          if (!isNaN(m)) dayIdx = m;
        }
      }
    }

    // Se ainda inválido, lixo.
    if (dayIdx === undefined || dayIdx === -1 || slotIdx === undefined) {
      removedCount++;
      return;
    }

    // Validação de Slot Ativo
    const cls = data.classes.find(c => c.id === entry.classId);
    if (!cls) {
      removedCount++; // Turma não existe mais
      return;
    }

    // FIX: Resolver o Slot ID real a partir do índice para validar corretamente
    const slotObj = timeSlots[slotIdx];
    const realSlotId = slotObj ? slotObj.id : String(slotIdx);

    if (!isSlotActive(cls, dayIdx, realSlotId)) {
      removedCount++; // Slot inativo (GHOST)
      return;
    }

    // Validação de Key Canônica
    const expectedKey = `${entry.classId}-${DAYS[dayIdx]}-${slotIdx}`;

    newSchedule[expectedKey] = {
      ...entry,
      timeKey: `${DAYS[dayIdx]}-${slotIdx}`, // Garante formato padrão
      dayIdx,
      slotIdx
    };
  });

  // Safety Circuit Breaker: Se remover mais de 30% dos dados, aborta!
  // Evita bugs de validação que limpem a grade inteira.
  if (totalEntries > 0 && (removedCount / totalEntries) > 0.3) {
    console.warn(`⚠️ Deep Clean ABORTED: Tried to remove ${removedCount}/${totalEntries} entries (${Math.round(removedCount / totalEntries * 100)}%). Verification logic mismatch suspected.`);
    return schedule; // Retorna o original intacto
  }

  if (removedCount > 0) {
    console.log(`🧹 Deep Clean: Removed ${removedCount} invalid entries.`);
  }

  return newSchedule;
}
