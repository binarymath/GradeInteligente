import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';
import { LIMITS } from '../constants/schedule';

/**
 * Resolver que quebra aulas duplas seletivamente para zerar pendências.
 * Apenas as aulas duplas das atividades incompletas são quebradas.
 */
class DoubleBreakResolver {
  constructor(data, existingSchedule, limits = {}) {
    this.data = data;
    this.limits = { ...LIMITS, ...limits };
    this.schedule = { ...existingSchedule };
    
    this.teacherSchedule = {};
    this.classSchedule = {};
    this.bookedEntries = [];
    this.timeSlots = data.timeSlots;
    this.lessonIndices = this.timeSlots.map((_, i) => i).filter(i => this.timeSlots[i].type === 'aula');
    
    this.maxTimeMs = 20000; // 20 segundos máximo
    this.startTime = Date.now();
    this.attemptCount = 0;
    this.maxAttempts = 5000;
    this.log = [];
    this.brokenDoubles = []; // Rastreia quais duplas foram quebradas
  }

  /**
   * Inicia o processo de resolução quebrando aulas duplas
   * @param {Array} incompleteActivities - Atividades que ainda estão incompletas
   * @returns {Object} { schedule, bookedEntries, resolved, brokenDoubles, attemptCount }
   */
  resolve(incompleteActivities) {
    this._initializeFromExistingSchedule();
    this.log = [];
    this.brokenDoubles = [];
    this.attemptCount = 0;

    if (!incompleteActivities || incompleteActivities.length === 0) {
      return { 
        schedule: this.schedule, 
        bookedEntries: this.bookedEntries, 
        resolved: true, 
        brokenDoubles: [], 
        attemptCount: 0 
      };
    }

    this.log.push(`🔨 Ativando modo de quebra seletiva de aulas duplas...`);
    this.log.push(`   Analisando ${incompleteActivities.length} aula(s) incompleta(s)...`);

    // Encontra atividades que são duplas e podem ser quebradas
    const doubleActivitiesToBreak = this._findBreakableDoubles(incompleteActivities);

    if (doubleActivitiesToBreak.length === 0) {
      this.log.push(`⚠️ Nenhuma aula dupla encontrada para quebrar.`);
      return { 
        schedule: this.schedule, 
        bookedEntries: this.bookedEntries, 
        resolved: false, 
        brokenDoubles: [], 
        attemptCount: 0 
      };
    }

    this.log.push(`   ${doubleActivitiesToBreak.length} aula(s) dupla(s) identificada(s) para quebra.`);

    // Tenta quebrar e alocar
    const resolved = this._breakAndAllocate(doubleActivitiesToBreak);

    if (resolved) {
      this.log.push(`✅ Quebra de duplas bem-sucedida! ${this.brokenDoubles.length} aula(s) quebrada(s).`);
    } else {
      this.log.push(`⚠️ Quebra de duplas parcial (${this.attemptCount} tentativas)`);
    }

    return {
      schedule: this.schedule,
      bookedEntries: this.bookedEntries,
      resolved,
      brokenDoubles: this.brokenDoubles,
      attemptCount: this.attemptCount,
      log: this.log
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
   * Encontra aulas duplas que podem ser quebradas (das atividades incompletas)
   * @private
   */
  _findBreakableDoubles(incompleteActivities) {
    const doubleActivities = [];
    const seenIds = new Set();

    incompleteActivities.forEach(act => {
      // Verificar se é dupla e não foi processada
      if (act.isDoubleLesson && !seenIds.has(act.id)) {
        // Contar quantas duplas desta atividade já foram alocadas
        const alreadyBooked = this.bookedEntries.filter(e =>
          e.classId === act.classId && 
          e.subjectId === act.subjectId &&
          e.teacherId === act.teacherId
        ).length;

        // Se ainda faltam aulas desta atividade, ela é candidata à quebra
        if (alreadyBooked < act.quantity) {
          doubleActivities.push(act);
          seenIds.add(act.id);
        }
      }
    });

    return doubleActivities;
  }

  /**
   * Quebra aulas duplas e tenta alocar como 2 aulas simples
   * @private
   */
  _breakAndAllocate(doubleActivities) {
    // Tenta cada combinação de dias/horários para as duplas quebradas
    for (const activity of doubleActivities) {
      if (Date.now() - this.startTime > this.maxTimeMs) {
        this.log.push(`⏱️ Timeout ao quebrar duplas`);
        break;
      }

      if (this.attemptCount > this.maxAttempts) {
        break;
      }

      // Quantas aulas simples precisam ser alocadas (dupla = 2 aulas)
      const bookedCount = this.bookedEntries.filter(e =>
        e.classId === activity.classId && 
        e.subjectId === activity.subjectId
      ).length;

      const missing = activity.quantity - bookedCount;

      if (missing <= 0) continue; // Já está completa

      // Tenta alocar 'missing' aulas simples
      if (this._allocateSimpleLessons(activity, missing)) {
        // Registra qual dupla foi quebrada
        this.brokenDoubles.push({
          activityId: activity.id,
          subject: activity.subjectId,
          classId: activity.classId,
          teacherId: activity.teacherId,
          originalQuantity: activity.quantity,
          brokenIntoSimple: true
        });
      }
    }

    // Verifica se todas as pendências foram resolvidas
    const allResolved = doubleActivities.every(act => {
      const bookedCount = this.bookedEntries.filter(e =>
        e.classId === act.classId && 
        e.subjectId === act.subjectId
      ).length;
      return bookedCount >= act.quantity;
    });

    return allResolved;
  }

  /**
   * Aloca aulas simples (resultado da quebra de dupla)
   * @private
   */
  _allocateSimpleLessons(activity, numToAllocate) {
    let allocated = 0;

    for (let dayIdx = 0; dayIdx < DAYS.length && allocated < numToAllocate; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        if (allocated >= numToAllocate) break;

        this.attemptCount++;

        if (this._isSlotAvailableForSimple(activity, dayIdx, slotIdx)) {
          this._allocateSlot(activity, dayIdx, slotIdx);
          allocated++;
        }
      }
    }

    return allocated === numToAllocate;
  }

  /**
   * Verifica se um slot está disponível para alocar aula simples
   * @private
   */
  _isSlotAvailableForSimple(activity, dayIdx, slotIdx) {
    const day = DAYS[dayIdx];
    const timeKey = `${day}-${slotIdx}`;

    // Turno da atividade
    const activityTurno = activity.shift || 'Todos';

    // Verifica turno da turma
    if (activityTurno !== 'Todos') {
      const classObj = this.data.classes?.find(c => c.id === activity.classId);
      if (classObj && classObj.shift && classObj.shift !== 'Todos' && classObj.shift !== activityTurno) {
        return false;
      }
    }

    // Verifica turno do slot
    const slotShift = computeSlotShift(this.timeSlots, slotIdx);
    if (slotShift && activityTurno !== 'Todos' && slotShift !== activityTurno) {
      return false;
    }

    // Turma ocupada
    if (this.classSchedule[activity.classId]?.[timeKey]) {
      return false;
    }

    // Professor ocupado
    if (this.teacherSchedule[activity.teacherId]?.[timeKey]) {
      return false;
    }

    return true;
  }

  /**
   * Aloca uma aula simples (não dupla)
   * @private
   */
  _allocateSlot(activity, dayIdx, slotIdx) {
    const day = DAYS[dayIdx];
    const key = `${activity.classId}-${day}-${slotIdx}`;
    const slot = this.timeSlots[slotIdx];
    const timeKey = `${day}-${slotIdx}`;

    this.schedule[key] = {
      subjectId: activity.subjectId,
      teacherId: activity.teacherId,
      classId: activity.classId,
      timeKey,
      isDoubleLesson: false, // Agora é simples!
      wasBrokenFromDouble: true // Marca que veio de quebra de dupla
    };

    if (!this.teacherSchedule[activity.teacherId]) {
      this.teacherSchedule[activity.teacherId] = {};
    }
    this.teacherSchedule[activity.teacherId][timeKey] = true;

    if (!this.classSchedule[activity.classId]) {
      this.classSchedule[activity.classId] = {};
    }
    this.classSchedule[activity.classId][timeKey] = true;

    this.bookedEntries.push({
      teacherId: activity.teacherId,
      classId: activity.classId,
      subjectId: activity.subjectId,
      dayIdx,
      slotIdx,
      start: slot.start,
      end: slot.end,
      wasBrokenFromDouble: true
    });
  }

  /**
   * Retorna o log de execução
   */
  getLog() {
    return this.log;
  }

  /**
   * Retorna detalhes das aulas quebradas
   */
  getBrokenDetails() {
    return this.brokenDoubles;
  }
}

export default DoubleBreakResolver;
