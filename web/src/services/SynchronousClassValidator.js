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

    // 1. LEGACY: REMOVIDO
    // O sistema agora suporta apenas configurações granulares (v2.0)
    // para garantir consistência e evitar conflitos de lógica.

    // 2. NOVO (v2.0): Via subject.synchronousConfigs (Granular)
    for (const subject of this.data.subjects || []) {
      if (!subject.isSynchronous || !subject.synchronousConfigs) continue;

      for (const config of subject.synchronousConfigs) {
        if (!config.isActive) continue;
        if (!config.classes || config.classes.length === 0) continue;

        // Group Key única para configurações granulares
        const groupKey = `granular-${subject.id}-${config.id || Math.random().toString(36).substr(2, 5)}`;

        const groupData = {
          id: groupKey,
          classes: config.classes,
          subjectId: subject.id,
          teacherId: null, // Granular aceita QUALQUER professor (wildcard)
          preferredSlots: config.timeSlots || [],
          preferredDayIdx: null,
          preferredSlotIdx: null,
          isGranular: true
        };

        // Parse do slot (Granular format: Day-Index or Legacy)
        if (config.timeSlots && config.timeSlots.length > 0) {
          const slotStr = config.timeSlots[0];
          let dayName = null;
          let slotIdx = null;

          if (slotStr.includes('-slot')) {
            const match = slotStr.match(/(.+?)-slot(\d+)/);
            if (match) { dayName = match[1]; slotIdx = parseInt(match[2]); }
          } else {
            const parts = slotStr.split('-');
            if (parts.length >= 2) {
              dayName = parts[0];
              slotIdx = parseInt(parts[1]);
            }
          }

          if (dayName) {
            const dayIdx = DAYS.indexOf(dayName);
            // Aceita slotIdx 0 (segunda fix check)
            if (dayIdx >= 0 && slotIdx != null && !isNaN(slotIdx)) {
              groupData.preferredDayIdx = dayIdx;
              groupData.preferredSlotIdx = slotIdx;
            }
          }
        }

        groups.set(groupKey, groupData);
        console.log(`✅ [Validator] Config Granular Detectada: ${groupKey}, Slot: ${groupData.preferredSlots[0]}`);
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
        group.classes &&
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
        group.classes &&
        group.classes.includes(classId) &&
        group.subjectId === subjectId &&
        // Se for granular (teacherId null), aceita qualquer professor. Se não, exige match.
        (group.teacherId === null || group.teacherId === teacherId)
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
        (group.teacherId === null || e.teacherId === teacherId) // Wildcard support
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
    if (group.preferredDayIdx == null || group.preferredSlotIdx == null) return true; // Sem horário reservado

    // Coleta posições de todas as turmas
    for (const classInGroup of group.classes) {
      const entries = manager.bookedEntries.filter(e =>
        e.classId === classInGroup &&
        e.subjectId === subjectId &&
        (group.teacherId === null || e.teacherId === teacherId) // Wildcard support
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
        (group.teacherId === null || e.teacherId === teacherId) // Wildcard support
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
        (group.teacherId === null || entry.teacherId === teacherId) // Wildcard support
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

    if (group.preferredDayIdx == null || group.preferredSlotIdx == null) {
      log.push('⚠️ Sem horário reservado para aulas síncronas');
      return false;
    }

    // Remove todas as entradas do grupo
    const entries = [];
    for (const cls of group.classes) {
      const classEntries = manager.bookedEntries.filter(e =>
        e.classId === cls &&
        e.subjectId === subjectId &&
        (group.teacherId === null || e.teacherId === teacherId) // Wildcard support
      );
      entries.push(...classEntries);
    }

    for (const entry of entries) {
      manager._unbook(entry.classId, entry.dayIdx, entry.slotIdx);
    }

    // Aloca todas no slot reservado
    let allocated = 0;
    for (const cls of group.classes) {
      // Encontra a atividade correta para esta turma e matéria
      const activity = this.data.activities.find(a =>
        a.classId === cls &&
        a.subjectId === subjectId &&
        // Se teacherId for fixo (Legacy), exige match. Se for null (Granular), aceita qualquer um.
        (group.teacherId === null || a.teacherId === teacherId) &&
        // Se for Legacy, exige a flag. Se for Granular, ignora.
        (group.isGranular ? true : a.synchronizedClasses)
      );

      if (activity) {
        // Usa o professor REAL da atividade, não o do grupo (que pode ser null)
        const realTeacherId = activity.teacherId;

        if (manager._isAvailable(realTeacherId, cls, subjectId, group.preferredDayIdx, group.preferredSlotIdx)) {
          manager._book(activity, group.preferredDayIdx, group.preferredSlotIdx, false, true);
          allocated++;
        } else {
          // Tenta 'Force Book' removendo quem estiver lá?
          // Por enquanto apenas loga falha, mas idealmente deveria limpar o slot target antes de loopar.
          // Já fizemos unbook das AULAS DO GRUPO. Mas se tiver OUTRA aula lá (conflito exógeno), falha.
          // Vamos tentar limpar o slot target se estiver ocupado por OUTRA coisa?
          // Risco alto. Deixar falhar e logar é mais seguro por enquanto.
        }
      }
    }

    if (allocated === group.classes.length) {
      const dayName = DAYS[group.preferredDayIdx];
      log.push(`✅ ${group.classes.length} aulas síncronas corrigidas para ${dayName}-slot${group.preferredSlotIdx}`);
      return true;
    } else {
      log.push(`❌ Apenas ${allocated}/${group.classes.length} aulas síncronas foram realocadas durante correção.`);
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
        teacher: group.teacherId === 'T-PLACEHOLDER' ? '⚠️ Placeholder' : (this.data.teachers.find(t => t.id === group.teacherId)?.name),
        reservedSlot: group.preferredSlots[0] || 'Nenhum'
      }))
    };
  }
}

export default SynchronousClassValidator;
