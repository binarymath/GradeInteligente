/**
 * Centralizador de todas as validações e proteções de aulas síncronas.
 * Responsável por garantir que aulas sincronizadas sejam tratadas consistentemente
 * respeitando Matéria, Professor e Turma.
 */

import { DAYS } from '../utils';

class SynchronousClassValidator {
  constructor(data) {
    this.data = data;
    this.syncGroups = this._buildSyncGroups();
  }

  /**
   * Constrói mapa de grupos síncronos com suas restrições
   */
  _buildSyncGroups() {
    const groups = new Map();

    for (const activity of this.data.activities || []) {
      if (!activity.synchronizedClasses || activity.synchronizedClasses.length === 0) continue;

      const groupKey = activity.synchronizedClasses.sort().join('|');
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          classes: activity.synchronizedClasses,
          subjectId: activity.subjectId,
          teacherId: activity.teacherId,
          preferredSlots: activity.preferredTimeSlots || [],
          preferredDayIdx: null,
          preferredSlotIdx: null
        });

        // Parse do primeiro slot preferido
        if (activity.preferredTimeSlots && activity.preferredTimeSlots.length > 0) {
          const match = activity.preferredTimeSlots[0].match(/(.+?)-slot(\d+)/);
          if (match) {
            const dayIdx = DAYS.indexOf(match[1]);
            if (dayIdx >= 0) {
              groups.get(groupKey).preferredDayIdx = dayIdx;
              groups.get(groupKey).preferredSlotIdx = parseInt(match[2]);
            }
          }
        }
      }
    }

    return groups;
  }

  /**
   * Verifica se uma aula pertence a um grupo síncrono
   */
  isSynchronized(classId, subjectId, teacherId) {
    for (const group of this.syncGroups.values()) {
      if (
        group.classes.includes(classId) &&
        group.subjectId === subjectId &&
        group.teacherId === teacherId
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Obtém o grupo síncrono de uma aula
   */
  getSyncGroup(classId, subjectId, teacherId) {
    for (const group of this.syncGroups.values()) {
      if (
        group.classes.includes(classId) &&
        group.subjectId === subjectId &&
        group.teacherId === teacherId
      ) {
        return group;
      }
    }
    return null;
  }

  /**
   * Verifica se uma aula PODE ser movida
   * Retorna false se pertence a grupo sincronizado protegido
   */
  canMove(classId, subjectId, teacherId) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    
    // Se não é síncrona, pode mover
    if (!group) return true;
    
    // Se é síncrona, NÃO pode mover individualmente
    return false;
  }

  /**
   * Verifica se TODAS as aulas de um grupo estão no mesmo horário
   */
  areAllInSameSlot(manager, classId, subjectId, teacherId) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return true; // Não é síncrona, não há restrição

    // Coleta posições de todas as turmas do grupo
    const positions = new Map();
    
    for (const classInGroup of group.classes) {
      const entries = manager.bookedEntries.filter(e =>
        e.classId === classInGroup &&
        e.subjectId === subjectId &&
        e.teacherId === teacherId
      );

      if (entries.length > 0) {
        const pos = `${entries[0].dayIdx}-${entries[0].slotIdx}`;
        positions.set(classInGroup, pos);
      }
    }

    if (positions.size === 0) return true; // Nenhuma alocada ainda

    // Verifica se todas estão no mesmo slot
    const firstPos = positions.values().next().value;
    for (const pos of positions.values()) {
      if (pos !== firstPos) {
        return false; // Estão em posições diferentes!
      }
    }

    return true;
  }

  /**
   * Verifica se aulas estão no horário reservado
   */
  areInReservedSlot(manager, classId, subjectId, teacherId) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return true; // Não é síncrona
    if (!group.preferredDayIdx) return true; // Sem horário reservado

    // Coleta posições de todas as turmas
    for (const classInGroup of group.classes) {
      const entries = manager.bookedEntries.filter(e =>
        e.classId === classInGroup &&
        e.subjectId === subjectId &&
        e.teacherId === teacherId
      );

      for (const entry of entries) {
        if (
          entry.dayIdx !== group.preferredDayIdx ||
          entry.slotIdx !== group.preferredSlotIdx
        ) {
          return false; // Encontrou aula em posição diferente do reservado
        }
      }
    }

    return true;
  }

  /**
   * Valida se movimento quebraria sincronização
   */
  wouldBreakSynchronization(manager, classId, subjectId, teacherId, targetDayIdx, targetSlotIdx) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return false; // Não é síncrona, não quebra nada

    // Se alguma outra turma do grupo está em outro lugar, quebraria
    for (const otherClass of group.classes) {
      if (otherClass === classId) continue;

      const otherEntries = manager.bookedEntries.filter(e =>
        e.classId === otherClass &&
        e.subjectId === subjectId &&
        e.teacherId === teacherId
      );

      for (const entry of otherEntries) {
        if (
          entry.dayIdx !== targetDayIdx ||
          entry.slotIdx !== targetSlotIdx
        ) {
          return true; // Quebraria sincronização
        }
      }
    }

    return false;
  }

  /**
   * Valida todas as restrições de um grupo síncrono
   */
  validateSyncGroup(manager, classId, subjectId, teacherId) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return { valid: true }; // Não é síncrona

    const issues = [];

    // Verifica se todas estão no mesmo slot
    if (!this.areAllInSameSlot(manager, classId, subjectId, teacherId)) {
      issues.push('Turmas sincronizadas em horários diferentes');
    }

    // Verifica se todas estão no horário reservado
    if (!this.areInReservedSlot(manager, classId, subjectId, teacherId)) {
      issues.push('Turmas sincronizadas fora do horário reservado');
    }

    // Verifica se todas as turmas têm alocação
    const allocatedClasses = new Set();
    for (const entry of manager.bookedEntries) {
      if (
        group.classes.includes(entry.classId) &&
        entry.subjectId === subjectId &&
        entry.teacherId === teacherId
      ) {
        allocatedClasses.add(entry.classId);
      }
    }

    if (allocatedClasses.size !== group.classes.length) {
      issues.push(`Apenas ${allocatedClasses.size}/${group.classes.length} turmas alocadas`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Corrige aulas síncronas para o horário reservado
   */
  fixSyncGroupPosition(manager, classId, subjectId, teacherId, log = []) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return false; // Não é síncrona

    if (!group.preferredDayIdx) {
      log.push('⚠️ Sem horário reservado para aulas síncronas');
      return false;
    }

    // Remove todas as entradas do grupo
    const entries = [];
    for (const cls of group.classes) {
      const classEntries = manager.bookedEntries.filter(e =>
        e.classId === cls &&
        e.subjectId === subjectId &&
        e.teacherId === teacherId
      );
      entries.push(...classEntries);
    }

    for (const entry of entries) {
      manager._unbook(entry.classId, entry.dayIdx, entry.slotIdx);
    }

    // Aloca todas no slot reservado
    let allocated = 0;
    for (const cls of group.classes) {
      if (manager._isAvailable(teacherId, cls, subjectId, group.preferredDayIdx, group.preferredSlotIdx)) {
        const activity = this.data.activities.find(a =>
          a.classId === cls &&
          a.subjectId === subjectId &&
          a.teacherId === teacherId &&
          a.synchronizedClasses
        );

        if (activity) {
          manager._book(activity, group.preferredDayIdx, group.preferredSlotIdx, false, true);
          allocated++;
        }
      }
    }

    if (allocated === group.classes.length) {
      const dayName = DAYS[group.preferredDayIdx];
      log.push(`✅ ${group.classes.length} aulas síncronas corrigidas para ${dayName}-slot${group.preferredSlotIdx}`);
      return true;
    } else {
      log.push(`❌ Apenas ${allocated}/${group.classes.length} aulas síncronas foram alocadas`);
      return false;
    }
  }

  /**
   * Lista todos os grupos síncronos
   */
  getAllSyncGroups() {
    return Array.from(this.syncGroups.values());
  }

  /**
   * Retorna resumo de proteções
   */
  getSummary() {
    return {
      totalSyncGroups: this.syncGroups.size,
      groups: Array.from(this.syncGroups.entries()).map(([key, group]) => ({
        classes: group.classes,
        subject: this.data.subjects.find(s => s.id === group.subjectId)?.name,
        teacher: this.data.teachers.find(t => t.id === group.teacherId)?.name,
        reservedSlot: group.preferredSlots[0] || 'Nenhum'
      }))
    };
  }
}

export default SynchronousClassValidator;
