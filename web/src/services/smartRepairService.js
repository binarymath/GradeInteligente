/**
 * Serviço de reparo inteligente
 * Responsabilidade: Estratégias de alocação de aulas pendentes (swap, relocate, etc)
 */

import SynchronousClassValidator from './SynchronousClassValidator';
import { DAYS } from '../utils';
import {
  describeActivity,
  describeEntry,
  formatSlotLabel,
  getEntrySpan,
  buildPendingActivitiesForRepair,
  computeOverAllocations
} from './scheduleHelpers';

/**
 * Busca qualquer aula no slot que possa ser movida para liberar espaço
 */
export function findMovableEntryInSlot(manager, dayIdx, slotIdx, neededTeacherId, data, log, syncValidator) {
  const entriesInSlot = manager.bookedEntries.filter(e => 
    e.dayIdx === dayIdx && e.slotIdx === slotIdx
  );
  
  for (const entry of entriesInSlot) {
    if (entry.teacherId === neededTeacherId) continue;
    if (!syncValidator.canMove(entry.classId, entry.subjectId, entry.teacherId)) continue;
    
    const alternativeSlot = findAlternativeSlotForEntry(manager, entry, data, syncValidator);
    
    if (alternativeSlot) {
      return {
        entry: entry,
        newDayIdx: alternativeSlot.dayIdx,
        newSlotIdx: alternativeSlot.slotIdx
      };
    }
  }
  
  return null;
}

/**
 * Encontra um slot alternativo válido para realocar uma aula
 */
export function findAlternativeSlotForEntry(manager, entry, data, syncValidator) {
  const teacher = data.teachers?.find(t => t.id === entry.teacherId);
  const classData = data.classes?.find(c => c.id === entry.classId);
  
  if (!teacher || !classData) return null;
  
  const MAX_ALTERNATIVE_CHECKS = 15;
  let checks = 0;
  
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    for (const slotIdx of manager.lessonIndices) {
      if (++checks > MAX_ALTERNATIVE_CHECKS) return null;
      
      if (dayIdx === entry.dayIdx && slotIdx === entry.slotIdx) continue;
      
      if (!manager._isStructurallyAvailable({ ...entry, classId: entry.classId }, dayIdx, slotIdx)) continue;
      
      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      if (manager.classSchedule[entry.classId]?.[timeKey]) continue;
      if (manager.teacherSchedule[entry.teacherId]?.[timeKey]) continue;
      
      if (manager._isAvailable(entry.teacherId, entry.classId, entry.subjectId, dayIdx, slotIdx)) {
        return { dayIdx, slotIdx };
      }
    }
  }
  
  return null;
}

/**
 * Tenta alocar uma aula simples seguindo o fluxo Smart Repair
 */
export function tryRepairSingle(activity, manager, data, log, splitMode = false, syncValidator) {
  const MAX_SWAP_ATTEMPTS = 2;
  let swapAttempts = 0;

  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    for (const slotIdx of manager.lessonIndices) {
      if (!manager._isStructurallyAvailable(activity, dayIdx, slotIdx)) continue;

      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      if (manager.classSchedule[activity.classId]?.[timeKey]) continue;

      const teacherBusy = manager.teacherSchedule[activity.teacherId]?.[timeKey];

      if (!teacherBusy) {
        if (manager._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
          manager._book(activity, dayIdx, slotIdx, false, true);
          const modeLabel = splitMode ? ' (quebra)' : '';
          log.push(`✅ ${describeActivity(activity, data)} em ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)}${modeLabel}.`);
          return 1;
        }
      } else if (swapAttempts < MAX_SWAP_ATTEMPTS) {
        swapAttempts++;
        
        const blocker = manager.bookedEntries.find(e =>
          e.teacherId === activity.teacherId &&
          e.dayIdx === dayIdx &&
          e.slotIdx === slotIdx
        );

        if (blocker && syncValidator.canMove(blocker.classId, blocker.subjectId, blocker.teacherId) && relocateBlockingEntry(manager, blocker, data, log, syncValidator)) {
          if (manager._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
            manager._book(activity, dayIdx, slotIdx, false, true);
            const modeLabel = splitMode ? ' (quebra)' : '';
            log.push(`✅ Swap bem-sucedido: ${describeActivity(activity, data)} em ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)}${modeLabel}.`);
            return 1;
          }
        }
        
        const movableEntry = findMovableEntryInSlot(manager, dayIdx, slotIdx, activity.teacherId, data, log, syncValidator);
        
        if (movableEntry) {
          const movedClass = data.classes?.find(c => c.id === movableEntry.entry.classId);
          const movedSubject = data.subjects?.find(s => s.id === movableEntry.entry.subjectId);
          const movedTeacher = data.teachers?.find(t => t.id === movableEntry.entry.teacherId);
          
          manager._unbook(movableEntry.entry.classId, movableEntry.entry.dayIdx, movableEntry.entry.slotIdx);
          
          const moveActivity = {
            ...activity,
            teacherId: movableEntry.entry.teacherId,
            subjectId: movableEntry.entry.subjectId,
            classId: movableEntry.entry.classId,
            quantity: 1
          };
          
          manager._book(moveActivity, movableEntry.newDayIdx, movableEntry.newSlotIdx, false, true);
          
          log.push(`   🔄 Moveu ${movedClass?.name || movableEntry.entry.classId} - ${movedSubject?.name || movableEntry.entry.subjectId} (${movedTeacher?.name || movableEntry.entry.teacherId}) para liberar slot`);
          
          if (manager._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
            manager._book(activity, dayIdx, slotIdx, false, true);
            const modeLabel = splitMode ? ' (quebra)' : '';
            log.push(`✅ ${describeActivity(activity, data)} alocada no slot liberado em ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)}${modeLabel}.`);
            return 1;
          }
        }
      }
      
      if (teacherBusy && swapAttempts >= MAX_SWAP_ATTEMPTS) {
        const blocker = manager.bookedEntries.find(e =>
          e.teacherId === activity.teacherId &&
          e.dayIdx === dayIdx &&
          e.slotIdx === slotIdx
        );
        
        if (blocker && relocateBlockingEntry(manager, blocker, data, log)) {
          if (manager._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
            manager._book(activity, dayIdx, slotIdx, false, true);
            const modeLabel = splitMode ? ' (quebra de dupla)' : '';
            log.push(`✅ Swap bem-sucedido: ${describeActivity(activity, data)} em ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)}${modeLabel}.`);
            return 1;
          }
        } else {
          log.push(`↪️ Swap falhou para ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)}.`);
        }
      }
    }
  }
  return 0;
}

/**
 * Tenta alocar uma aula dupla respeitando slots consecutivos
 */
export function tryRepairDouble(activity, manager, data, log, syncValidator) {
  const MAX_POSITIONS = 10;
  let tested = 0;

  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    for (const slotIdx of manager.lessonIndices) {
      if (++tested > MAX_POSITIONS) return 0;

      const nextSlot = slotIdx + 1;
      if (!manager._areConsecutive(slotIdx, nextSlot)) continue;
      if (!manager.lessonIndices.includes(nextSlot)) continue;

      if (!manager._isStructurallyAvailable(activity, dayIdx, slotIdx)) continue;
      if (!manager._isStructurallyAvailable(activity, dayIdx, nextSlot)) continue;

      const timeKeyA = `${DAYS[dayIdx]}-${slotIdx}`;
      const timeKeyB = `${DAYS[dayIdx]}-${nextSlot}`;

      if (manager.classSchedule[activity.classId]?.[timeKeyA]) continue;
      if (manager.classSchedule[activity.classId]?.[timeKeyB]) continue;

      const blockers = [];
      if (manager.teacherSchedule[activity.teacherId]?.[timeKeyA]) {
        const entryA = manager.bookedEntries.find(e => e.teacherId === activity.teacherId && e.dayIdx === dayIdx && e.slotIdx === slotIdx);
        if (entryA) blockers.push(entryA);
      }
      if (manager.teacherSchedule[activity.teacherId]?.[timeKeyB]) {
        const entryB = manager.bookedEntries.find(e => e.teacherId === activity.teacherId && e.dayIdx === dayIdx && e.slotIdx === nextSlot);
        if (entryB) blockers.push(entryB);
      }

      if (blockers.length > 1) continue;

      let movedAll = true;
      for (const blocker of blockers) {
        if (!syncValidator.canMove(blocker.classId, blocker.subjectId, blocker.teacherId)) {
          movedAll = false;
          break;
        }
        
        if (!relocateBlockingEntry(manager, blocker, data, log)) {
          movedAll = false;
          break;
        }
      }

      if (!movedAll) continue;

      if (manager._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx) &&
        manager._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, nextSlot)) {
        manager._book(activity, dayIdx, slotIdx, false);
        manager._book(activity, dayIdx, nextSlot, true);
        log.push(`✅ ${describeActivity(activity, data)} alocada como aula dupla em ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)} e ${formatSlotLabel(manager.timeSlots, dayIdx, nextSlot)}.`);
        return 2;
      }
    }
  }
  return 0;
}

/**
 * Move a aula que está bloqueando o professor para outro slot válido
 */
export function relocateBlockingEntry(manager, entry, data, log, syncValidator) {
  if (!syncValidator) syncValidator = new SynchronousClassValidator(data);
  if (!syncValidator.canMove(entry.classId, entry.subjectId, entry.teacherId)) {
    return false;
  }

  const span = getEntrySpan(manager, entry);
  const isDouble = span.length === 2;

  const moveActivity = {
    id: `smart-move-${entry.classId}-${entry.subjectId}-${entry.slotIdx}`,
    teacherId: entry.teacherId,
    subjectId: entry.subjectId,
    classId: entry.classId,
    quantity: span.length,
    doubleLesson: isDouble
  };

  const MAX_RELOCATE_ATTEMPTS = 8;
  let attempts = 0;

  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    for (const slotIdx of manager.lessonIndices) {
      if (++attempts > MAX_RELOCATE_ATTEMPTS) return false;
      const targetSlots = isDouble ? [slotIdx, slotIdx + 1] : [slotIdx];

      if (isDouble) {
        if (!manager.lessonIndices.includes(slotIdx + 1)) continue;
        if (!manager._areConsecutive(slotIdx, slotIdx + 1)) continue;
      }

      if (dayIdx === entry.dayIdx && targetSlots.every(s => span.includes(s))) continue;

      const originalSpan = [...span];
      originalSpan.forEach(s => manager._unbook(entry.classId, entry.dayIdx, s));

      const canPlace = targetSlots.every(s =>
        manager._isAvailable(moveActivity.teacherId, moveActivity.classId, moveActivity.subjectId, dayIdx, s)
      );

      if (canPlace) {
        if (isDouble) {
          manager._book(moveActivity, dayIdx, targetSlots[0], false);
          manager._book(moveActivity, dayIdx, targetSlots[1], true);
        } else {
          manager._book(moveActivity, dayIdx, targetSlots[0], false, true);
        }

        log.push(`   ✅ ${describeEntry(entry, data)} movida para ${formatSlotLabel(manager.timeSlots, dayIdx, targetSlots[0])}${isDouble ? `/${formatSlotLabel(manager.timeSlots, dayIdx, targetSlots[1])}` : ''}.`);
        return true;
      }

      if (isDouble) {
        manager._book(moveActivity, entry.dayIdx, originalSpan[0], false);
        manager._book(moveActivity, entry.dayIdx, originalSpan[1], true);
      } else {
        manager._book(moveActivity, entry.dayIdx, originalSpan[0], false, true);
      }
    }
  }

  return false;
}

/**
 * Relocação com profundidade (tenta mover bloqueadores em cadeia)
 */
export function relocateBlockingEntryDeep(manager, entry, data, log, depth, totalAttempts = 0, syncValidator) {
  if (depth <= 0) return false;
  if (totalAttempts > 50) return false;
  
  if (!syncValidator.canMove(entry.classId, entry.subjectId, entry.teacherId)) {
    return false;
  }

  const span = getEntrySpan(manager, entry);
  const isDouble = span.length === 2;

  const moveActivity = {
    id: `smart-move-${entry.classId}-${entry.subjectId}-${entry.slotIdx}`,
    teacherId: entry.teacherId,
    subjectId: entry.subjectId,
    classId: entry.classId,
    quantity: span.length,
    doubleLesson: isDouble
  };

  const MAX_POSITION_ATTEMPTS = 15;
  let positionAttempts = 0;

  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    for (const slotIdx of manager.lessonIndices) {
      if (++positionAttempts > MAX_POSITION_ATTEMPTS) return false;
      const targetSlots = isDouble ? [slotIdx, slotIdx + 1] : [slotIdx];

      if (isDouble) {
        if (!manager.lessonIndices.includes(slotIdx + 1)) continue;
        if (!manager._areConsecutive(slotIdx, slotIdx + 1)) continue;
      }

      if (dayIdx === entry.dayIdx && targetSlots.every(s => span.includes(s))) continue;

      const originalSpan = [...span];
      originalSpan.forEach(s => manager._unbook(entry.classId, entry.dayIdx, s));

      let canPlace = true;
      const blockersInTarget = [];

      for (const s of targetSlots) {
        if (!manager._isAvailable(moveActivity.teacherId, moveActivity.classId, moveActivity.subjectId, dayIdx, s)) {
          const timeKey = `${DAYS[dayIdx]}-${s}`;
          const blocker = manager.bookedEntries.find(e =>
            (e.teacherId === moveActivity.teacherId || e.classId === moveActivity.classId) &&
            e.dayIdx === dayIdx &&
            e.slotIdx === s
          );

          if (blocker && depth > 1) {
            blockersInTarget.push(blocker);
          } else {
            canPlace = false;
            break;
          }
        }
      }

      if (canPlace && blockersInTarget.length > 0) {
        for (const blocker of blockersInTarget) {
          if (!relocateBlockingEntryDeep(manager, blocker, data, log, depth - 1, totalAttempts + 1, syncValidator)) {
            canPlace = false;
            break;
          }
        }
      }

      if (canPlace) {
        canPlace = targetSlots.every(s =>
          manager._isAvailable(moveActivity.teacherId, moveActivity.classId, moveActivity.subjectId, dayIdx, s)
        );
      }

      if (canPlace) {
        if (isDouble) {
          manager._book(moveActivity, dayIdx, targetSlots[0], false);
          manager._book(moveActivity, dayIdx, targetSlots[1], true);
        } else {
          manager._book(moveActivity, dayIdx, targetSlots[0], false, true);
        }

        log.push(`   ✅ ${describeEntry(entry, data)} movida (profundidade ${depth}) para ${formatSlotLabel(manager.timeSlots, dayIdx, targetSlots[0])}.`);
        return true;
      }

      if (isDouble) {
        manager._book(moveActivity, entry.dayIdx, originalSpan[0], false);
        manager._book(moveActivity, entry.dayIdx, originalSpan[1], true);
      } else {
        manager._book(moveActivity, entry.dayIdx, originalSpan[0], false, true);
      }
    }
  }

  return false;
}

/**
 * Tenta colocar aula simples em qualquer lugar válido
 */
export function tryPlaceSimpleElsewhere(manager, moveActivity, excludeDay, excludeSlot, data, log) {
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    for (const slotIdx of manager.lessonIndices) {
      if (dayIdx === excludeDay && slotIdx === excludeSlot) continue;

      if (manager._isAvailable(moveActivity.teacherId, moveActivity.classId, moveActivity.subjectId, dayIdx, slotIdx)) {
        manager._book(moveActivity, dayIdx, slotIdx, false, true);
        return true;
      }
    }
  }
  return false;
}

/**
 * Tenta alocação forçada relaxando limites temporariamente
 */
export function tryForceRepair(activity, manager, data, log) {
  log.push(`   🔥 Tentando alocação forçada (relaxando limites)...`);

  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    for (const slotIdx of manager.lessonIndices) {
      if (!manager._isStructurallyAvailable(activity, dayIdx, slotIdx)) continue;

      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      
      if (manager.classSchedule[activity.classId]?.[timeKey]) continue;
      if (manager.teacherSchedule[activity.teacherId]?.[timeKey]) continue;

      manager._book(activity, dayIdx, slotIdx, false, true);
      log.push(`   ⚠️ Alocação forçada: ${describeActivity(activity, data)} em ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)} (limites relaxados).`);
      return 1;
    }
  }

  return 0;
}

/**
 * Tenta alocação simples com swap em cadeia (profundidade configurável)
 */
export function tryRepairSingleDeep(activity, manager, data, log, syncValidator, maxDepth = 2) {
  const MAX_DEEP_ATTEMPTS = 20;
  let attempts = 0;

  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    for (const slotIdx of manager.lessonIndices) {
      if (++attempts > MAX_DEEP_ATTEMPTS) {
        log.push(`⚠️ Limite de tentativas profundas atingido (${MAX_DEEP_ATTEMPTS}).`);
        return 0;
      }

      if (!manager._isStructurallyAvailable(activity, dayIdx, slotIdx)) continue;

      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      if (manager.classSchedule[activity.classId]?.[timeKey]) continue;

      const teacherBusy = manager.teacherSchedule[activity.teacherId]?.[timeKey];

      if (!teacherBusy) {
        if (manager._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
          manager._book(activity, dayIdx, slotIdx, false, true);
          log.push(`✅ ${describeActivity(activity, data)} alocada em ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)} (professor livre, profundidade).`);
          return 1;
        }
      } else if (maxDepth > 0) {
        const blocker = manager.bookedEntries.find(e =>
          e.teacherId === activity.teacherId &&
          e.dayIdx === dayIdx &&
          e.slotIdx === slotIdx
        );

        if (blocker && relocateBlockingEntryDeep(manager, blocker, data, log, maxDepth, 0, syncValidator)) {
          if (manager._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
            manager._book(activity, dayIdx, slotIdx, false, true);
            log.push(`✅ Swap profundo bem-sucedido: ${describeActivity(activity, data)} em ${formatSlotLabel(manager.timeSlots, dayIdx, slotIdx)}.`);
            return 1;
          }
        }
      }
    }
  }
  return 0;
}

/**
 * ⭐ ESTRATÉGIA 3: Remoção AGRESSIVA de excessos para liberar espaço
 * Remove aulas excedentes de forma estratégica (menos importantes primeiro)
 * 
 * Prioridade de remoção:
 * 1. Aulas de turmas que TAMBÉM têm pendências (libera espaço para "competidores")
 * 2. Aulas não-síncronas (síncronas são críticas)
 * 3. Aulas de professores "ocupados" (reduz conflitos)
 */
export function aggressiveExcessRemoval(manager, data, overInfo, syncValidator, log = []) {
  if (!overInfo.totalExcess || overInfo.totalExcess <= 0) {
    return 0; // Nada a remover
  }

  const toRemove = [];
  const entries = manager.bookedEntries;

  // Mapear quais turma-matéria têm excessos
  const excessBySubject = new Map();

  if (Array.isArray(overInfo.subjectExcess)) {
    overInfo.subjectExcess.forEach(item => {
      const key = `${item.classId}-${item.subjectId}`;
      excessBySubject.set(key, (excessBySubject.get(key) || 0) + (item.excess || 0));
    });
  } else if (overInfo.subjectExcess && typeof overInfo.subjectExcess === 'object') {
    Object.entries(overInfo.subjectExcess).forEach(([key, value]) => {
      excessBySubject.set(key, Number(value) || 0);
    });
  }

  // Encontrar todas as entradas excedentes
  for (const entry of entries) {
    if (!entry.classId || !entry.subjectId) continue;
    if (entry.isSynchronous || entry.isGranularSync || entry.isFixed) continue; // ⚠️ Não remover síncronas

    const key = `${entry.classId}-${entry.subjectId}`;
    const excessAmount = excessBySubject.get(key) || 0;

    if (excessAmount > 0) {
      toRemove.push({
        entry,
        excessAmount,
        // Score para priorização (menor = remove primeiro)
        removalScore: calculateRemovalScore(entry, manager, data, syncValidator)
      });
    }
  }

  // Ordenar por removalScore (remove más candidatas primeiro)
  toRemove.sort((a, b) => a.removalScore - b.removalScore);

  // Remover até cobrir o excesso total
  let removed = 0;
  let actuallyRemoved = [];

  for (const { entry } of toRemove) {
    if (removed >= overInfo.totalExcess) break;

    // Tenta remover
    const wasBooked = manager.bookedEntries.some(e =>
      e.classId === entry.classId &&
      e.dayIdx === entry.dayIdx &&
      e.slotIdx === entry.slotIdx
    );

    if (wasBooked) {
      manager._unbook(entry.classId, entry.dayIdx, entry.slotIdx);
      actuallyRemoved.push(entry);
      removed++;
    }
  }

  if (actuallyRemoved.length > 0) {
    const classNames = new Set(actuallyRemoved.map(e => {
      const cls = data.classes?.find(c => c.id === e.classId);
      return cls?.name || e.classId;
    }));

    log.push(`🧹 Removidas ${actuallyRemoved.length} aula(s) excedente(s) para liberar espaço`);
    log.push(`   Turmas afetadas: ${Array.from(classNames).slice(0, 3).join(', ')}${classNames.size > 3 ? '...' : ''}`);
  }

  return actuallyRemoved.length;
}

/**
 * Calcula score de "preferência de remoção" para uma entrada
 * Menor score = remove com MAIS prioridade
 * 
 * Fatores:
 * - Aulas não-síncronas têm lower score (mais provavelmente removidas)
 * - Aulas de professores "sobrecarregados" têm lower score
 * - Aulas de turmas sem pendências têm lower score (não prejudica)
 */
function calculateRemovalScore(entry, manager, data, syncValidator) {
  let score = 100; // Default neutro

  // Fator 1: Se é síncrona, aumenta score (nunca remover)
  if (entry.isSynchronous || entry.isGranularSync || entry.isFixed) {
    return 9999; // Máximo, nunca remover
  }

  // Fator 2: Professores com pouco trabalho = score menor (remove mais facilmente)
  if (entry.teacherId) {
    const teacherLoad = manager.bookedEntries.filter(e => e.teacherId === entry.teacherId).length;
    score -= Math.max(0, 50 - teacherLoad); // Quanto menos trabalho, menor score
  }

  // Fator 3: Turmas com muitos horários = score menor (tem alternativas)
  if (entry.classId) {
    const classData = data.classes?.find(c => c.id === entry.classId);
    let availableSlots = 0;
    if (classData?.activeSlotsByDay) {
      availableSlots = Object.values(classData.activeSlotsByDay).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    } else if (classData?.activeSlots) {
      availableSlots = classData.activeSlots.length;
    }
    score -= Math.max(0, availableSlots - 10); // Turmas com muitos slots = mais fácil remover
  }

  // Fator 4: Aulas duplas são menos valiosas (dois slots = uma aula, remover libera 1 slot)
  if (entry.doubleLesson) {
    score -= 20; // Mais fácil remover
  }

  return Math.max(0, score);
}
