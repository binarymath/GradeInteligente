import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';
import { LIMITS } from '../constants/schedule';

/**
 * Resolver final/extremo que força alocação ignorando conflitos menores de professor.
 * Usado quando há >20 pendências e outras estratégias falharam.
 * 
 * Estratégia: Aloca considerando APENAS restrições críticas (turma, turno, indisponibilidade)
 * Ignora: Conflito com professor (pois o professor terá aulas em tempos que se conflitam)
 * 
 * AVISO: Isso pode gerar horários com professor em 2 turmas simultâneas (~5 min de intervalo)
 */
class ForceAllocationResolver {
  constructor(data, existingSchedule, limits = {}) {
    this.data = data;
    this.limits = { ...LIMITS, ...limits };
    this.schedule = { ...existingSchedule };
    
    this.teacherSchedule = {};
    this.classSchedule = {};
    this.bookedEntries = [];
    this.timeSlots = data.timeSlots;
    this.lessonIndices = this.timeSlots.map((_, i) => i).filter(i => this.timeSlots[i].type === 'aula');
    
    this.maxTimeMs = 30000; // 30 segundos máximo
    this.startTime = Date.now();
    this.log = [];
    this.warnings = [];
  }

  /**
   * Tenta forçar alocação das atividades pendentes
   * @param {Array} pendingActivities - Atividades que falharam em todas as outras estratégias
   * @returns {Object} { schedule, bookedEntries, resolved, warnings, log }
   */
  resolve(pendingActivities) {
    this._initializeFromExistingSchedule();
    this.log = [];
    this.warnings = [];

    if (!pendingActivities || pendingActivities.length === 0) {
      return { schedule: this.schedule, bookedEntries: this.bookedEntries, resolved: true, warnings: [], log: [] };
    }

    this.log.push(`⚠️ Modo FORÇA: Alocando ${pendingActivities.length} aula(s) ignorando conflitos menores...`);

    let allocatedCount = 0;

    for (const activity of pendingActivities) {
      if (Date.now() - this.startTime > this.maxTimeMs) {
        this.log.push('⏱️ Timeout atingido');
        break;
      }

      // Tenta alocar esta atividade
      const result = this._forceAllocate(activity);
      if (result) {
        allocatedCount++;
      }
    }

    if (allocatedCount > 0) {
      this.log.push(`✅ Força alocação: ${allocatedCount}/${pendingActivities.length} aula(s) alocada(s)`);
    }

    if (this.warnings.length > 0) {
      this.log.push('');
      this.log.push('⚠️ AVISOS:');
      this.warnings.forEach(w => this.log.push(`   ${w}`));
    }

    return {
      schedule: this.schedule,
      bookedEntries: this.bookedEntries,
      resolved: allocatedCount === pendingActivities.length,
      warnings: this.warnings,
      log: this.log,
      allocatedCount
    };
  }

  /**
   * Inicializa estruturas internas a partir do schedule existente
   * @private
   */
  _initializeFromExistingSchedule() {
    this.teacherSchedule = {};
    this.classSchedule = {};
    this.bookedEntries = [];

    for (const [key, entry] of Object.entries(this.schedule)) {
      const [classId, dayStr, slotStr] = key.split('-');
      const dayIdx = DAYS.indexOf(dayStr);
      const slotIdx = parseInt(slotStr);

      if (dayIdx >= 0 && slotIdx >= 0) {
        const timeKey = `${dayStr}-${slotIdx}`;

        if (entry.teacherId) {
          if (!this.teacherSchedule[entry.teacherId]) {
            this.teacherSchedule[entry.teacherId] = {};
          }
          this.teacherSchedule[entry.teacherId][timeKey] = true;
        }

        if (!this.classSchedule[classId]) {
          this.classSchedule[classId] = {};
        }
        this.classSchedule[classId][timeKey] = true;

        this.bookedEntries.push({
          teacherId: entry.teacherId,
          classId: entry.classId,
          subjectId: entry.subjectId,
          dayIdx,
          slotIdx,
          start: this.timeSlots[slotIdx].start,
          end: this.timeSlots[slotIdx].end
        });
      }
    }
  }

  /**
   * Força alocação de uma atividade ignorando conflitos de professor
   * @private
   */
  _forceAllocate(activity) {
    // Tenta vários slots até encontrar algum que funcione (ignora professor)
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        if (this._canForceAllocateSlot(activity, dayIdx, slotIdx)) {
          this._allocateSlot(activity, dayIdx, slotIdx);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Verifica se é possível forçar alocação neste slot (ignora conflito de professor)
   * @private
   */
  _canForceAllocateSlot(activity, dayIdx, slotIdx) {
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    const day = DAYS[dayIdx];

    // 1. CRÍTICO: Turma NÃO pode estar ocupada
    if (this.classSchedule[activity.classId]?.[timeKey]) {
      return false;
    }

    // 2. CRÍTICO: Turma deve ter aquele horário ativo
    const cls = this.data.classes.find(c => c.id === activity.classId);
    if (!cls) return false;

    const slotId = this.timeSlots[slotIdx]?.id || String(slotIdx);
    let isSlotActive = false;

    const hasActiveSlotsByDay = cls.activeSlotsByDay && Object.keys(cls.activeSlotsByDay).length > 0;
    const hasActiveSlots = cls.activeSlots && Array.isArray(cls.activeSlots) && cls.activeSlots.length > 0;

    if (!hasActiveSlotsByDay && !hasActiveSlots) {
      return false; // Turma sem horários = impossível
    }

    if (hasActiveSlotsByDay) {
      const activeSlotsForDay = cls.activeSlotsByDay[dayIdx];
      isSlotActive = activeSlotsForDay && activeSlotsForDay.includes(slotId);
    } else if (hasActiveSlots) {
      isSlotActive = cls.activeSlots.includes(slotId);
    }

    if (!isSlotActive) return false;

    // 3. CRÍTICO: Compatibilidade de turno
    const slotShift = computeSlotShift(this.timeSlots[slotIdx]);
    const classShift = cls.shift;
    let isShiftCompatible = false;

    if (classShift === 'Integral (Manhã e Tarde)') {
      isShiftCompatible = (slotShift === 'Manhã' || slotShift === 'Tarde' || slotShift === 'Integral (Manhã e Tarde)');
    } else if (classShift === 'Integral (Tarde e Noite)') {
      isShiftCompatible = (slotShift === 'Tarde' || slotShift === 'Noite' || slotShift === 'Integral (Tarde e Noite)');
    } else {
      isShiftCompatible = (slotShift === classShift);
    }

    if (!isShiftCompatible) return false;

    // 4. CRÍTICO: Professor não pode estar INDISPONÍVEL
    const teacher = this.data.teachers.find(t => t.id === activity.teacherId);
    if (teacher && teacher.unavailable && teacher.unavailable.includes(timeKey)) {
      return false;
    }

    // 5. IGNORADO: Conflito de professor com outra turma (permite para força)

    // 6. Opcional: Matéria indisponível
    const subject = this.data.subjects.find(s => s.id === activity.subjectId);
    if (subject && subject.unavailable && subject.unavailable.includes(timeKey)) {
      return false;
    }

    return true;
  }

  /**
   * Aloca uma aula forçadamente no schedule
   * @private
   */
  _allocateSlot(activity, dayIdx, slotIdx) {
    const day = DAYS[dayIdx];
    const timeKey = `${day}-${slotIdx}`;
    const key = `${activity.classId}-${day}-${slotIdx}`;

    this.schedule[key] = {
      classId: activity.classId,
      subjectId: activity.subjectId,
      teacherId: activity.teacherId,
      dayIdx,
      slotIdx,
      isForcedAllocation: true // Marca como alocação forçada
    };

    // Registra nas estruturas internas
    if (activity.teacherId) {
      if (!this.teacherSchedule[activity.teacherId]) {
        this.teacherSchedule[activity.teacherId] = {};
      }
      // Marca com símbolo especial para detectar conflito
      this.teacherSchedule[activity.teacherId][timeKey] = 'FORCED';
    }

    if (!this.classSchedule[activity.classId]) {
      this.classSchedule[activity.classId] = {};
    }
    this.classSchedule[activity.classId][timeKey] = true;

    this.bookedEntries.push({
      teacherId: activity.teacherId,
      classId: activity.classId,
      subjectId: activity.subjectId,
      dayIdx,
      slotIdx
    });

    // Registra aviso se há conflito de professor
    if (this.teacherSchedule[activity.teacherId]) {
      const teacherName = this.data.teachers.find(t => t.id === activity.teacherId)?.name || activity.teacherId;
      const className = this.data.classes.find(c => c.id === activity.classId)?.name || activity.classId;
      const subjectName = this.data.subjects.find(s => s.id === activity.subjectId)?.name || activity.subjectId;
      
      // Conta quantas aulas o professor tem neste horário
      const conflictCount = Object.values(this.teacherSchedule[activity.teacherId]).filter(v => v === 'FORCED').length;
      if (conflictCount > 1) {
        this.warnings.push(`⚠️ Prof. ${teacherName} alocado em múltiplas turmas: ${subjectName} (${className}) tem múltiplos horários`);
      }
    }
  }
}

export default ForceAllocationResolver;
