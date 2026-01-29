import { DAYS } from '../utils';
import SynchronousClassValidator from './SynchronousClassValidator';

class SynchronousScheduler {
  constructor(data, schedule) {
    this.data = data;
    this.schedule = schedule || {}; // Pode iniciar vazio
    this.log = [];
    this.processedActivities = new Set();
    this.validator = new SynchronousClassValidator(data);
  }

  /**
   * Processa TODOS os grupos síncronos (Legacy + Granular)
   * Fonte da verdade: SynchronousClassValidator
   */
  processAllGroups() {
    const groups = this.validator.getAllSyncGroups();

    if (groups.length === 0) {
      this.log.push('ℹ️ Nenhum grupo síncrono identificado.');
      return { success: true, schedule: this.schedule, log: this.log, allocatedActivityIds: [] };
    }

    this.log.push(`🎯 PROCESSANDO ${groups.length} GRUPOS SÍNCRONOS (UNIFICADO)`);

    for (const group of groups) {
      this.processGroup(group);
    }

    const hasErrors = this.log.filter(l => l.includes('❌') || l.includes('falhou')).length > 0;

    return {
      success: !hasErrors,
      schedule: this.schedule,
      log: this.log,
      allocatedActivityIds: Array.from(this.processedActivities)
    };
  }

  processGroup(group) {
    this.log.push(`\n   👥 Grupo Síncrono: ${group.id}`);

    // 1. Identificar Slot Preferido (Hard Constraint)
    // O Validator já normalizou isso em preferredDayIdx/preferredSlotIdx ou preferredSlots[]

    let targetSlots = [];

    // Normalização robusta de slots
    if (group.preferredDayIdx != null && group.preferredSlotIdx != null) {
      // Legacy or Single Slot
      targetSlots.push(`${DAYS[group.preferredDayIdx]}-${group.preferredSlotIdx}`);
    } else if (group.preferredSlots && group.preferredSlots.length > 0) {
      // Granular / Multiple Slots
      targetSlots = group.preferredSlots.map(s => {
        // Limpar formato 'Day-slotN' para 'Day-N'
        if (s.includes('-slot')) {
          const m = s.match(/(.+?)-slot(\d+)/);
          return m ? `${m[1]}-${m[2]}` : s;
        }
        return s;
      });
    }

    if (targetSlots.length === 0) {
      this.log.push(`      ⚠️ Ignorado: Sem horários definidos.`);
      return;
    }

    this.log.push(`      📅 Horários Alvo: ${targetSlots.join(', ')}`);

    // 2. Para cada slot alvo, alocar as atividades correspondentes
    for (const slotKey of targetSlots) {
      this.allocateGroupInSlot(group, slotKey);
    }
  }

  allocateGroupInSlot(group, slotKey) {
    const [dayName, slotIdxStr] = slotKey.split('-');
    const slotIdx = parseInt(slotIdxStr);
    const dayIdx = DAYS.indexOf(dayName);

    if (dayIdx === -1 || isNaN(slotIdx)) {
      this.log.push(`      ❌ Erro de formato de slot: ${slotKey}`);
      return;
    }

    this.log.push(`         -> Tentando alocar em ${slotKey}...`);

    // IMPLEMENTAÇÃO "FORCE RESERVATION":
    // O usuário mandou, a gente obedece. 
    // Se não der para alocar a atividade real (conflito, falta de aula),
    // alocamos um PLACEHOLDER para bloquear o horário e impedir que outra matéria entre.

    let successCount = 0;

    for (const classId of group.classes) {
      let activity = this.findBestActivityForGroup(group, classId);
      let isPlaceholder = false;
      let conflictReason = null;

      if (!activity) {
        conflictReason = 'Sem atividade disponível';
        isPlaceholder = true;
      } else {
        const reason = this.checkAvailability(classId, activity, dayIdx, slotIdx, group);
        if (reason !== 'OK') {
          conflictReason = reason;
          isPlaceholder = true;
        }
      }

      if (isPlaceholder) {
        this.log.push(`            ⚠️ FORCE BOOK: Turma ${classId} bloqueada com Placeholder (${conflictReason})`);
        // Cria uma atividade 'fake' para reservar o slot
        // IMPORTANTE: Passamos o ID da atividade (se existir) para marcá-la como processada
        // e evitar que o algoritmo principal tente alocá-la novamente (duplicidade).
        this.bookPlaceholder(classId, group.subjectId, dayIdx, slotIdx, conflictReason, activity ? activity.id : null);
      } else {
        // Alocação Real
        this.bookActivity(activity, dayIdx, slotIdx);
        successCount++;
      }
    }

    if (successCount === group.classes.length) {
      this.log.push(`            ✅ Sucesso Total: Todas as turmas alocadas com atividades reais.`);
    } else {
      this.log.push(`            ⚠️ Parcial: ${successCount} reais, ${group.classes.length - successCount} placeholders.`);
    }
  }

  /**
   * Encontra a melhor atividade para preencher o slot.
   * Considera Wildcard e Saldo de Aulas.
   */
  findBestActivityForGroup(group, classId) {
    // 1. Tentar encontrar atividade exata que ainda não foi totalmente processada
    // PROBLEMA: processedActivities é boolean (set de IDs). 
    // Mas uma atividade com quantity=2 deve poder ser usada 2 vezes.
    // Vamos calcular o 'saldo' real consultando o schedule atual.

    // Candidatos: atividades da turma/matéria
    const candidates = this.data.activities.filter(a =>
      a.classId === classId &&
      a.subjectId === group.subjectId &&
      (group.teacherId === null || a.teacherId === group.teacherId)
    );

    for (const activity of candidates) {
      // Contar quantas vezes já aparece no schedule
      let currentUses = 0;
      for (const key in this.schedule) {
        const entry = this.schedule[key];
        // Precisamos inferir se é ESTA atividade. 
        // ScheduleEntry tem: subjectId, teacherId, classId.
        // Se a atividade for 'genérica' (mesmo prof/matéria/turma), qualquer uma serve.
        if (entry.subjectId === activity.subjectId &&
          entry.classId === activity.classId &&
          entry.teacherId === activity.teacherId) {
          currentUses++;
        }
      }

      // Se quantity permite mais usos, retorna ela
      if (currentUses < activity.quantity) {
        return activity;
      }
    }

    return null;
  }

  checkAvailability(classId, activity, dayIdx, slotIdx, group) {
    const scheduleKey = `${classId}-${DAYS[dayIdx]}-${slotIdx}`;
    const existing = this.schedule[scheduleKey];

    // 1. Slot Ocupado?
    if (existing) {
      if (existing.isSynchronous) {
        if (existing.subjectId === activity.subjectId) return 'OK'; // O próprio
        return `Slot ocupado por outra síncrona (${existing.subjectId})`;
      }
      // Se for normal, podemos chutar. OK.
    }

    // 2. Conflito Físico de Professor (Professor em DOIS lugares ao mesmo tempo)
    // Verificar se o professor já está em outra turma NESTE slot.
    // Cuidado: Ao verificar o grupo, não podemos conflitar com nós mesmos (outras aulas do mesmo grupo que estamos planejando).
    // Mas como a alocação é atômica e ainda não escrevemos, só verificamos o schedule ATUAL (que não tem nada do grupo ainda).
    if (activity.teacherId) {
      for (const key in this.schedule) {
        const entry = this.schedule[key];
        if (entry.timeKey === `${DAYS[dayIdx]}-${slotIdx}` &&
          entry.teacherId === activity.teacherId &&
          !group.classes.includes(entry.classId)) { // Ignora se for do mesmo grupo (mas isso não devia acontecer pois grupo ainda não foi escrito)

          return `Prof. ${activity.teacherId} já alocado na turma ${entry.classId}`;
        }
      }
    }

    return 'OK';
  }

  bookActivity(activity, dayIdx, slotIdx) {
    const scheduleKey = `${activity.classId}-${DAYS[dayIdx]}-${slotIdx}`;

    // KICK SE NECESSÁRIO
    if (this.schedule[scheduleKey]) {
      // Já verificamos que não é síncrona na fase checkAvailability
      delete this.schedule[scheduleKey];
    }

    this.schedule[scheduleKey] = {
      subjectId: activity.subjectId,
      teacherId: activity.teacherId,
      classId: activity.classId,
      timeKey: `${DAYS[dayIdx]}-${slotIdx}`,
      isSynchronous: true,
      isGranularSync: true,
      isFixed: true,
      locked: true
    };

    // Rastreamento para filtro posterior
    this.processedActivities.add(activity.id);
  }

  bookPlaceholder(classId, subjectId, dayIdx, slotIdx, reason, activityId = null) {
    const scheduleKey = `${classId}-${DAYS[dayIdx]}-${slotIdx}`;

    // KICK SE NECESSÁRIO (Sempre ganha de não-síncronas)
    if (this.schedule[scheduleKey]) {
      delete this.schedule[scheduleKey];
    }

    this.schedule[scheduleKey] = {
      subjectId: subjectId,
      teacherId: 'T-PLACEHOLDER', // ID Especial
      classId: classId,
      timeKey: `${DAYS[dayIdx]}-${slotIdx}`,
      isSynchronous: true,
      isGranularSync: true,
      isFixed: true,
      locked: true,
      isPlaceholder: true,
      placeholderReason: reason
    };

    // Marca atividade como "usada" para não sobrar para o agendador principal
    if (activityId) {
      this.processedActivities.add(activityId);
    }
  }
}

export default SynchronousScheduler;
