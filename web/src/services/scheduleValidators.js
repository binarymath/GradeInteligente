/**
 * Validators para agendamento
 * Responsabilidade: Validações de conflitos, pendências e problemas de agendamento
 */

import SynchronousClassValidator from './SynchronousClassValidator';
import { DAYS } from '../utils';

/**
 * Valida posição de aulas síncronas e move para o horário reservado
 * OTIMIZADO para performance
 */
export function validateAndFixSynchronizedClasses(manager, data, log) {
  const validator = new SynchronousClassValidator(data);
  let fixed = 0;

  for (const group of validator.getAllSyncGroups()) {
    const classId = group.classes[0];
    
    const validation = validator.validateSyncGroup(manager, classId, group.subjectId, group.teacherId);
    
    if (!validation.valid) {
      const result = validator.fixSyncGroupPosition(manager, classId, group.subjectId, group.teacherId, log);
      if (result) {
        fixed++;
      }
    }
  }

  return fixed;
}

/**
 * Remove aulas excedentes para liberar espaço na grade
 */
export function removeExcessAllocations(manager, overInfo, data, log, syncValidator) {
  let removed = 0;
  const alreadyRemoved = new Set();

  // Remove excessos por matéria/turma (mais geral)
  for (const item of overInfo.subjectExcess) {
    const entries = manager.bookedEntries.filter(e =>
      e.classId === item.classId &&
      e.subjectId === item.subjectId &&
      syncValidator.canMove(e.classId, e.subjectId, e.teacherId)
    );

    entries.sort((a, b) => {
      if (a.dayIdx !== b.dayIdx) return b.dayIdx - a.dayIdx;
      return b.slotIdx - a.slotIdx;
    });

    let toRemove = item.excess;
    for (const entry of entries) {
      if (toRemove <= 0) break;
      
      const entryKey = `${entry.classId}-${entry.dayIdx}-${entry.slotIdx}`;
      if (alreadyRemoved.has(entryKey)) continue;
      
      manager._unbook(entry.classId, entry.dayIdx, entry.slotIdx);
      alreadyRemoved.add(entryKey);
      removed++;
      toRemove--;
      
      const { formatSlotLabel, describeEntry } = require('./scheduleHelpers');
      const label = describeEntry(entry, data);
      log.push(`   🗑️ Removida aula excedente: ${label} em ${formatSlotLabel(manager.timeSlots, entry.dayIdx, entry.slotIdx)}`);
    }
  }

  // Remove excessos por professor (mais específico)
  for (const item of overInfo.teacherExcess) {
    const entries = manager.bookedEntries.filter(e =>
      e.classId === item.classId &&
      e.subjectId === item.subjectId &&
      e.teacherId === item.teacherId &&
      syncValidator.canMove(e.classId, e.subjectId, e.teacherId)
    );

    entries.sort((a, b) => {
      if (a.dayIdx !== b.dayIdx) return b.dayIdx - a.dayIdx;
      return b.slotIdx - a.slotIdx;
    });

    let toRemove = item.excess;
    for (const entry of entries) {
      if (toRemove <= 0) break;
      
      const entryKey = `${entry.classId}-${entry.dayIdx}-${entry.slotIdx}`;
      if (alreadyRemoved.has(entryKey)) continue;
      
      manager._unbook(entry.classId, entry.dayIdx, entry.slotIdx);
      alreadyRemoved.add(entryKey);
      removed++;
      toRemove--;
      
      const { formatSlotLabel, describeEntry } = require('./scheduleHelpers');
      const label = describeEntry(entry, data);
      log.push(`   🗑️ Removida aula excedente (professor): ${label} em ${formatSlotLabel(manager.timeSlots, entry.dayIdx, entry.slotIdx)}`);
    }
  }

  if (removed > 0) {
    log.push(`   ✅ Total de ${removed} aula(s) excedente(s) removida(s).`);
  }
}
