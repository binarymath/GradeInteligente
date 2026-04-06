/**
 * Centralizador de todas as validações e proteções de aulas síncronas.
 * Responsável por garantir que aulas sincronizadas sejam tratadas consistentemente
 * respeitando Matéria, Professor e Turma.
 */

import { DAYS } from '../utils';

class SynchronousClassValidator {
  constructor(data) {
    this.data = data;
    this._ensureActivitiesForSyncClasses(); // Criar activities antes de construir grupos
    this.syncGroups = this._buildSyncGroups();
  }

  /**
   * Garante que todas as turmas síncronas tenham activities criadas
   * Cria automaticamente se não existirem
   * @private
   */
  _ensureActivitiesForSyncClasses() {

    if (!this.data.activities) {
      this.data.activities = [];
    }

    let created = 0;
    const syncSubjects = this.data.subjects?.filter(s => s.isSynchronous) || [];

    for (const subject of syncSubjects) {
      if (!subject.synchronousConfigs) continue;

      for (const config of subject.synchronousConfigs) {
        if (!config.isActive || !config.classes) continue;

        for (const classId of config.classes) {
          // Verificar se já existe activity para esta turma+matéria
          const exists = this.data.activities.some(a =>
            a.classId === classId && a.subjectId === subject.id
          );

          if (!exists) {
            // Pegar primeiro professor disponível ou criar um padrão
            const teacherId = this.data.teachers?.[0]?.id || config.teachers?.[0] || 'auto_teacher';

            const newActivity = {
              id: `sync_auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              subjectId: subject.id,
              classId: classId,
              teacherId: teacherId,
              quantity: 1,
              doubleLesson: false
            };

            this.data.activities.push(newActivity);
            created++;

            const className = this.data.classes?.find(c => c.id === classId)?.name || classId;
          }
        }
      }
    }

    if (created > 0) {
    } else {
    }
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

      if (!subject.isSynchronous || !subject.synchronousConfigs) {
        continue;
      }


      for (const config of subject.synchronousConfigs) {

        if (!config.isActive) {
          continue;
        }
        if (!config.classes || config.classes.length === 0) {
          continue;
        }

        // Group Key única para configurações granulares
        const groupKey = `granular-${subject.id}-${config.id || Math.random().toString(36).substr(2, 5)}`;

        const groupData = {
          id: groupKey,
          classes: config.classes,
          subjectId: subject.id,
          teacherId: null, // Granular aceita QUALQUER professor (wildcard)
          preferredSlots: config.timeSlots || [],
          mandatorySlots: [],
          isGranular: true
        };

        // Parse do slot (Granular format: Day-Index or Legacy)
        if (config.timeSlots && config.timeSlots.length > 0) {
          for (const slotStr of config.timeSlots) {
            let dayName = null;
            let slotIdx = null;

            if (slotStr.includes('-slot')) {
              const match = slotStr.match(/(.+?)-slot(\d+)/);
              if (match) {
                dayName = match[1];
                slotIdx = parseInt(match[2]);
              }
            } else {
              const parts = slotStr.split('-');
              if (parts.length >= 2) {
                dayName = parts[0];
                slotIdx = parseInt(parts[1]);
              }
            }

            if (dayName) {
              // Normalizar dia (Português/Inglês)
              const ENGLISH_DAYS = {
                'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4,
                'Segunda': 0, 'Terça': 1, 'Terca': 1, 'Quarta': 2, 'Quinta': 3, 'Sexta': 4,
                'Segunda-feira': 0, 'Terça-feira': 1, 'Quarta-feira': 2, 'Quinta-feira': 3, 'Sexta-feira': 4
              };

              let dayIdx = -1;

              // Tenta mapear direto
              if (ENGLISH_DAYS[dayName] !== undefined) {
                dayIdx = ENGLISH_DAYS[dayName];
              } else {
                // Tenta via array DAYS (case sensitive original)
                dayIdx = DAYS.indexOf(dayName);
              }

              // Aceita slotIdx 0 (segunda fix check)
              if (dayIdx >= 0 && slotIdx != null && !isNaN(slotIdx)) {
                groupData.mandatorySlots.push({ dayIdx, slotIdx });
              }
            }
          }
        }

        groups.set(groupKey, groupData);
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
        (group.teacherId === null || group.teacherId === teacherId)
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
   * @param {Array|Object} managerOrEntries - ScheduleManager ou array de bookedEntries
   */
  areAllInSameSlot(managerOrEntries, classId, subjectId, teacherId) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return true; // Não é síncrona, não há restrição

    // ✅ Suporta tanto manager quanto array direto
    const bookedEntries = Array.isArray(managerOrEntries)
      ? managerOrEntries
      : managerOrEntries.bookedEntries;

    // Coleta posições de todas as turmas do grupo
    const positions = new Map();

    for (const classInGroup of group.classes) {
      const entries = bookedEntries.filter(e =>
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
   * @param {Array|Object} managerOrEntries - ScheduleManager ou array de bookedEntries
   */
  areInReservedSlot(managerOrEntries, classId, subjectId, teacherId) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return true; // Não é síncrona
    if (!group.mandatorySlots || group.mandatorySlots.length === 0) return true; // Sem horário reservado

    // ✅ Suporta tanto manager quanto array direto
    const bookedEntries = Array.isArray(managerOrEntries)
      ? managerOrEntries
      : managerOrEntries.bookedEntries;

    // Coleta posições de todas as turmas
    for (const classInGroup of group.classes) {
      const entries = bookedEntries.filter(e =>
        e.classId === classInGroup &&
        e.subjectId === subjectId &&
        (group.teacherId === null || e.teacherId === teacherId) // Wildcard support
      );

      for (const entry of entries) {
        const isMatch = group.mandatorySlots.some(
          slot => slot.dayIdx === entry.dayIdx && slot.slotIdx === entry.slotIdx
        );
        if (!isMatch) {
          return false; // Encontrou aula em posição diferente do reservado
        }
      }
    }

    return true;
  }

  /**
   * Valida se movimento quebraria sincronização
   * @param {Array|Object} managerOrEntries - ScheduleManager ou array de bookedEntries
   */
  wouldBreakSynchronization(managerOrEntries, classId, subjectId, teacherId, targetDayIdx, targetSlotIdx) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return false; // Não é síncrona, não quebra nada

    // ✅ Suporta tanto manager quanto array direto
    const bookedEntries = Array.isArray(managerOrEntries)
      ? managerOrEntries
      : managerOrEntries.bookedEntries;


    // Se alguma outra turma do grupo está em outro lugar, quebraria
    for (const otherClass of group.classes) {
      if (otherClass === classId) continue;

      const otherEntries = bookedEntries.filter(e =>
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

    if (!group.mandatorySlots || group.mandatorySlots.length === 0) {
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

        for (const slotObj of group.mandatorySlots) {
          const { dayIdx, slotIdx } = slotObj;

          if (manager._isAvailable(realTeacherId, cls, subjectId, dayIdx, slotIdx)) {
            manager._book(activity, dayIdx, slotIdx, false, true);
            allocated++;
          } else {
            // FORCE BOOK SUPER-IMPROVED: Remove TUDO que estiver no caminho (Class Slot e Teacher)

            // 1. Limpar o slot da turma (quem estiver ocupando a sala)
            const classConflicts = manager.bookedEntries.filter(e =>
              e.classId === cls &&
              e.dayIdx === dayIdx &&
              e.slotIdx === slotIdx
            );

            for (const conflict of classConflicts) {
              manager._unbook(conflict.classId, conflict.dayIdx, conflict.slotIdx);
              log.push(`⚠️ Removendo ocupante da sala para forçar síncrona: Turma ${conflict.classId}, Matéria ${conflict.subjectId}`);
            }

            // 2. Limpar o professor (se ele estiver dando aula em OUTRA turma)
            if (realTeacherId) {
              const teacherConflicts = manager.bookedEntries.filter(e =>
                e.teacherId === realTeacherId &&
                e.dayIdx === dayIdx &&
                e.slotIdx === slotIdx
              );

              for (const tConflict of teacherConflicts) {
                manager._unbook(tConflict.classId, tConflict.dayIdx, tConflict.slotIdx);
                log.push(`⚠️ Removendo professor ${realTeacherId} da turma ${tConflict.classId} para forçar síncrona`);
              }
            }

            // Tenta novamente após limpar tudo
            if (manager._isAvailable(realTeacherId, cls, subjectId, dayIdx, slotIdx)) {
              manager._book(activity, dayIdx, slotIdx, false, true);
              allocated++;
              log.push(`✅ Síncrona forçada com sucesso após limpeza total no slot ${dayIdx}-${slotIdx}.`);
            } else {
              // ULTIMATE FORCE: Se ainda falhar (por regras de turno, activeSlots ou limites),
              // Ignora as regras e aloca mesmo assim. O usuário mandou!
              log.push(`⚠️ Constraints check failed (Turno/ActiveSlots). Executando ULTIMATE FORCE no slot ${dayIdx}-${slotIdx}.`);

              try {
                manager._book(activity, dayIdx, slotIdx, false, true);
                allocated++;
                log.push(`✅ Síncrona alocada via ULTIMATE FORCE (Regras ignoradas) no slot ${dayIdx}-${slotIdx}.`);
              } catch (e) {
                log.push(`❌ Falha crítica real no ULTIMATE FORCE no slot ${dayIdx}-${slotIdx}: ${e.message}`);
              }
            }
          }
        }
      }
    }

    const totalToAllocate = group.classes.length * group.mandatorySlots.length;
    if (allocated === totalToAllocate) {
      log.push(`✅ ${allocated} aulas síncronas corrigidas com os slots obrigatórios.`);
      return true;
    } else {
      log.push(`❌ Apenas ${allocated}/${totalToAllocate} aulas síncronas foram realocadas durante correção.`);
      return false;
    }
  }

  /**
   * Verifica se um slot é o reservado para uma aula síncrona
   */
  isReservedSlot(classId, subjectId, teacherId, dayIdx, slotIdx) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return true; // Não é síncrona
    if (!group.mandatorySlots || group.mandatorySlots.length === 0) return true; // Sem reserva

    return group.mandatorySlots.some(slot => slot.dayIdx === dayIdx && slot.slotIdx === slotIdx);
  }

  /**
   * Obtém o slot OBRIGATÓRIO para uma aula síncrona
   * Retorna {dayIdx, slotIdx, groupId} ou null se não houver restrição
   */
  getMandatorySlot(classId, subjectId, teacherId) {
    const group = this.getSyncGroup(classId, subjectId, teacherId);
    if (!group) return null;



    if (!group.mandatorySlots || group.mandatorySlots.length === 0) return null;

    return group.mandatorySlots;
  }

  /**
   * Lista TODAS as atividades síncronas que devem ser alocadas neste slot
   * Retorna array de {activity, group, mandatory: true}
   */
  getActivitiesByMandatorySlot(dayIdx, slotIdx) {
    const activities = [];


    if (this.data.activities && this.data.activities.length > 0) {

    }

    for (const group of this.syncGroups.values()) {

      if (group.mandatorySlots && group.mandatorySlots.some(slot => slot.dayIdx === dayIdx && slot.slotIdx === slotIdx)) {

        // Encontra todas as atividades deste grupo (uma por turma)
        for (const classId of group.classes) {

          const activity = this.data.activities.find(a =>
            a.classId === classId &&
            a.subjectId === group.subjectId &&
            // ✅ CORREÇÃO: Respeita wildcard (null = aceita qualquer professor)
            (group.teacherId === null || a.teacherId === group.teacherId)
          );

          if (activity) {


            activities.push({
              activity,
              group,
              mandatory: true
            });
          } else {

            // Debug: mostrar todas as activities que tem este subjectId
            const withSubject = this.data.activities.filter(a => a.subjectId === group.subjectId);
            if (withSubject.length > 0) {
            }

            // Debug: mostrar todas as activities que tem este classId
            const withClass = this.data.activities.filter(a => a.classId === classId);
            if (withClass.length > 0) {
            }
          }
        }
      }
    }

    return activities;
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
