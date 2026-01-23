import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';
import { SCORING, LIMITS } from '../constants/schedule';

/**
 * Resolver de backtracking com constraint satisfaction para resolver pendências de alocação.
 * Funciona como um "Sudoku Solver" - tenta diferentes combinações respeitando restrições.
 */
class BacktrackingResolver {
  constructor(data, existingSchedule, limits = {}) {
    this.data = data;
    this.limits = { ...LIMITS, ...limits };
    this.schedule = { ...existingSchedule }; // Cópia do schedule existente
    
    this.teacherSchedule = {};
    this.classSchedule = {};
    this.bookedEntries = [];
    this.timeSlots = data.timeSlots;
    this.lessonIndices = this.timeSlots.map((_, i) => i).filter(i => this.timeSlots[i].type === 'aula');
    
    this.maxTimeMs = 30000; // 30 segundos máximo
    this.startTime = Date.now();
    this.attemptCount = 0;
    this.maxAttempts = 10000;
    this.log = [];
  }

  /**
   * Inicia o processo de resolução de backtracking
   * @param {Array} pendingActivities - Atividades que falharam na alocação
   * @returns {Object} { schedule, bookedEntries, resolved, attemptCount }
   */
  resolve(pendingActivities) {
    this._initializeFromExistingSchedule();
    this.log = [];
    this.attemptCount = 0;

    if (!pendingActivities || pendingActivities.length === 0) {
      return { schedule: this.schedule, bookedEntries: this.bookedEntries, resolved: true, attemptCount: 0 };
    }

    this.log.push(`🔧 Iniciando backtracking para resolver ${pendingActivities.length} atividade(s) pendente(s)...`);

    // Ordena atividades por dificuldade (aulas duplas primeiro)
    const sorted = this._sortByDifficulty(pendingActivities);

    // Tenta resolver com backtracking
    const resolved = this._backtrack(sorted, 0);

    if (resolved) {
      this.log.push(`✅ Backtracking encontrou solução em ${this.attemptCount} tentativas!`);
    } else {
      this.log.push(`❌ Backtracking não encontrou solução (${this.attemptCount} tentativas, timeout/limite atingido)`);
    }

    return {
      schedule: this.schedule,
      bookedEntries: this.bookedEntries,
      resolved,
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

    // Reconstrói as estruturas de rastreamento
    for (const [key, entry] of Object.entries(this.schedule)) {
      // Formato da chave: "classId-day-slot"
      const [classId, dayStr, slotStr] = key.split('-');
      const dayIdx = DAYS.indexOf(dayStr);
      const slotIdx = parseInt(slotStr);

      if (dayIdx >= 0 && slotIdx >= 0) {
        const timeKey = `${dayStr}-${slotIdx}`;

        // Rastreia professor
        if (entry.teacherId) {
          if (!this.teacherSchedule[entry.teacherId]) {
            this.teacherSchedule[entry.teacherId] = {};
          }
          this.teacherSchedule[entry.teacherId][timeKey] = true;
        }

        // Rastreia turma
        if (!this.classSchedule[classId]) {
          this.classSchedule[classId] = {};
        }
        this.classSchedule[classId][timeKey] = true;

        // Adiciona ao array de entradas
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
   * Algoritmo de backtracking recursivo
   * @private
   */
  _backtrack(pendingActivities, index) {
    // Verifica timeout
    if (Date.now() - this.startTime > this.maxTimeMs) {
      this.log.push('⏱️ Timeout: 30 segundos atingidos');
      return false;
    }

    // Verifica limite de tentativas
    if (this.attemptCount > this.maxAttempts) {
      this.log.push(`⏱️ Limite de ${this.maxAttempts} tentativas atingido`);
      return false;
    }

    // Base case: todas as atividades foram alocadas
    if (index === pendingActivities.length) {
      return true;
    }

    const activity = pendingActivities[index];
    this.attemptCount++;

    // Mostra progresso a cada 1000 tentativas
    if (this.attemptCount % 1000 === 0) {
      this.log[this.log.length - 1] = `🔧 Tentativa ${this.attemptCount}... (${Math.round((Date.now() - this.startTime) / 1000)}s)`;
    }

    // Tenta cada slot disponível para esta atividade
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        // Verifica se este slot é válido para a atividade
        if (this._isSlotAvailable(activity, dayIdx, slotIdx)) {
          // Aloca a atividade
          this._allocateSlot(activity, dayIdx, slotIdx);

          // Recursão para a próxima atividade
          if (this._backtrack(pendingActivities, index + 1)) {
            return true;
          }

          // Backtrack: desaloca se não funcionou
          this._deallocateSlot(activity, dayIdx, slotIdx);
        }
      }
    }

    // Nenhum slot funcionou para esta atividade
    return false;
  }

  /**
   * Verifica se um slot está disponível para a atividade
   * @private
   */
  _isSlotAvailable(activity, dayIdx, slotIdx) {
    const day = DAYS[dayIdx];
    const timeKey = `${day}-${slotIdx}`;
    const slot = this.timeSlots[slotIdx];

    // Turno da atividade
    const activityTurno = activity.shift || 'Todos';

    // Verifica se o turno da turma permite este horário
    if (activityTurno !== 'Todos') {
      const classObj = this.data.classes?.find(c => c.id === activity.classId);
      if (classObj && classObj.shift && classObj.shift !== 'Todos' && classObj.shift !== activityTurno) {
        return false;
      }
    }

    // Verifica se o turno do slot bate
    const slotShift = computeSlotShift(this.timeSlots, slotIdx);
    if (slotShift && activityTurno !== 'Todos' && slotShift !== activityTurno) {
      return false;
    }

    // Verifica se a turma já tem aula neste horário
    if (this.classSchedule[activity.classId]?.[timeKey]) {
      return false;
    }

    // Verifica se o professor já tem aula neste horário
    if (this.teacherSchedule[activity.teacherId]?.[timeKey]) {
      return false;
    }

    // Verifica se há limite de aulas consecutivas
    const maxConsecutive = this.limits.MAX_CONSECUTIVE_LESSONS || 3;
    if (this._hasExcessiveConsecutiveLessons(activity.teacherId, dayIdx, slotIdx, maxConsecutive)) {
      return false;
    }

    // Verifica se há conflito com intervalo de aula dupla
    if (activity.isDoubleLesson && slotIdx + 1 >= this.timeSlots.length) {
      return false; // Não há espaço para aula dupla
    }

    if (activity.isDoubleLesson) {
      const nextSlot = this.timeSlots[slotIdx + 1];
      // Validação de segurança
      if (!nextSlot || nextSlot.type !== 'aula') {
        return false; // Próximo slot não existe ou é intervalo
      }

      // Verifica turma e professor no próximo slot também
      if (this.classSchedule[activity.classId]?.[(nextSlot.start + '-' + nextSlot.end)]) {
        return false;
      }
      if (this.teacherSchedule[activity.teacherId]?.[(nextSlot.start + '-' + nextSlot.end)]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Aloca uma atividade em um slot
   * @private
   */
  _allocateSlot(activity, dayIdx, slotIdx) {
    const day = DAYS[dayIdx];
    const key = `${activity.classId}-${day}-${slotIdx}`;
    const slot = this.timeSlots[slotIdx];

    this.schedule[key] = {
      subjectId: activity.subjectId,
      teacherId: activity.teacherId,
      classId: activity.classId,
      timeKey: `${day}-${slotIdx}`,
      isDoubleLesson: activity.isDoubleLesson || false
    };

    // Marca como ocupado
    const timeKey = `${day}-${slotIdx}`;
    if (!this.teacherSchedule[activity.teacherId]) {
      this.teacherSchedule[activity.teacherId] = {};
    }
    this.teacherSchedule[activity.teacherId][timeKey] = true;

    if (!this.classSchedule[activity.classId]) {
      this.classSchedule[activity.classId] = {};
    }
    this.classSchedule[activity.classId][timeKey] = true;

    // Adiciona ao array de entradas
    this.bookedEntries.push({
      teacherId: activity.teacherId,
      classId: activity.classId,
      subjectId: activity.subjectId,
      dayIdx,
      slotIdx,
      start: slot.start,
      end: slot.end
    });

    // Se for aula dupla, aloca também o próximo slot
    if (activity.isDoubleLesson) {
      const nextSlotIdx = slotIdx + 1;
      const nextSlot = this.timeSlots[nextSlotIdx];
      
      // Validação de segurança
      if (!nextSlot) {
        console.warn(`⚠️ Tentativa de alocar dupla mas próximo slot (${nextSlotIdx}) não existe`);
        return;
      }
      
      const nextTimeKey = `${day}-${nextSlotIdx}`;

      this.schedule[`${activity.classId}-${day}-${nextSlotIdx}`] = {
        subjectId: activity.subjectId,
        teacherId: activity.teacherId,
        classId: activity.classId,
        timeKey: nextTimeKey,
        isDoubleLesson: true
      };

      this.teacherSchedule[activity.teacherId][nextTimeKey] = true;
      this.classSchedule[activity.classId][nextTimeKey] = true;

      this.bookedEntries.push({
        teacherId: activity.teacherId,
        classId: activity.classId,
        subjectId: activity.subjectId,
        dayIdx,
        slotIdx: nextSlotIdx,
        start: nextSlot.start,
        end: nextSlot.end
      });
    }
  }

  /**
   * Desaloca uma atividade de um slot
   * @private
   */
  _deallocateSlot(activity, dayIdx, slotIdx) {
    const day = DAYS[dayIdx];
    const key = `${activity.classId}-${day}-${slotIdx}`;
    const timeKey = `${day}-${slotIdx}`;

    delete this.schedule[key];

    // Remove do rastreamento
    if (this.teacherSchedule[activity.teacherId]) {
      delete this.teacherSchedule[activity.teacherId][timeKey];
    }
    if (this.classSchedule[activity.classId]) {
      delete this.classSchedule[activity.classId][timeKey];
    }

    // Remove do array de entradas
    this.bookedEntries = this.bookedEntries.filter(e =>
      !(e.teacherId === activity.teacherId && 
        e.classId === activity.classId && 
        e.dayIdx === dayIdx && 
        e.slotIdx === slotIdx)
    );

    // Se for aula dupla, desaloca também o próximo slot
    if (activity.isDoubleLesson) {
      const nextSlotIdx = slotIdx + 1;
      const nextTimeKey = `${day}-${nextSlotIdx}`;

      delete this.schedule[`${activity.classId}-${day}-${nextSlotIdx}`];

      if (this.teacherSchedule[activity.teacherId]) {
        delete this.teacherSchedule[activity.teacherId][nextTimeKey];
      }
      if (this.classSchedule[activity.classId]) {
        delete this.classSchedule[activity.classId][nextTimeKey];
      }

      this.bookedEntries = this.bookedEntries.filter(e =>
        !(e.teacherId === activity.teacherId && 
          e.classId === activity.classId && 
          e.dayIdx === dayIdx && 
          e.slotIdx === nextSlotIdx)
      );
    }
  }

  /**
   * Verifica se há muitas aulas consecutivas
   * @private
   */
  _hasExcessiveConsecutiveLessons(teacherId, dayIdx, slotIdx, maxConsecutive) {
    const day = DAYS[dayIdx];
    let count = 0;

    // Conta aulas consecutivas antes
    for (let i = slotIdx - 1; i >= 0; i--) {
      if (this.timeSlots[i].type !== 'aula') break;
      if (this.teacherSchedule[teacherId]?.[`${day}-${i}`]) {
        count++;
      } else {
        break;
      }
    }

    // Conta aulas consecutivas depois
    for (let i = slotIdx + 1; i < this.timeSlots.length; i++) {
      if (this.timeSlots[i].type !== 'aula') break;
      if (this.teacherSchedule[teacherId]?.[`${day}-${i}`]) {
        count++;
      } else {
        break;
      }
    }

    return count >= maxConsecutive;
  }

  /**
   * Ordena atividades por dificuldade (heurística para melhor performance)
   * @private
   */
  _sortByDifficulty(activities) {
    return activities.sort((a, b) => {
      // Aulas duplas primeiro (mais restritas)
      if (a.isDoubleLesson && !b.isDoubleLesson) return -1;
      if (!a.isDoubleLesson && b.isDoubleLesson) return 1;

      // Depois atividades com turno específico
      const aHasTurno = a.shift && a.shift !== 'Todos' ? 1 : 0;
      const bHasTurno = b.shift && b.shift !== 'Todos' ? 1 : 0;
      if (aHasTurno !== bHasTurno) return bHasTurno - aHasTurno;

      return 0;
    });
  }

  /**
   * Retorna o log de execução
   */
  getLog() {
    return this.log;
  }
}

export default BacktrackingResolver;
