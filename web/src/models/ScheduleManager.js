import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';
import { SCORING, LIMITS } from '../constants/schedule';

/**
 * Gerenciador responsável pela criação da grade de horários.
 * Utiliza um algoritmo guloso (greedy) com heurísticas de preferência e fallback.
 */
class ScheduleManager {
  /**
   * Cria uma nova instância do ScheduleManager.
   * @param {Object} data - Dados do sistema (teachers, classes, subjects, timeSlots, activities).
   */
  constructor(data) {
    this.data = data;
    this.schedule = {}; // Resultado final: { "classId-day-slot": info }
    this.log = [];      // Log de execução para debug/feedback visual

    // Estado interno (reiniciado a cada geração)
    this.teacherSchedule = {}; // Rastreia ocupação dos professores { teacherId: { timeKey: true } }
    this.classSchedule = {};   // Rastreia ocupação das turmas { classId: { timeKey: true } }
    this.bookedEntries = [];   // Lista plana de agendamentos para verificação fácil de limites e conflitos
    this.timeSlots = [];       // Cache dos slots de tempo
    this.lessonIndices = [];   // Índices dos slots que são realmente 'aula' (ignora intervalos)
  }

  /**
   * Converte string de horário "HH:MM" para minutos absolutos.
   * @private
   */
  _minutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Adiciona uma mensagem ao log de execução com timestamp.
   * @param {string} msg - Mensagem a ser logada.
   */
  logMessage(msg) {
    this.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  /**
   * Executa o algoritmo de geração da grade.
   * 1. Reseta o estado.
   * 2. Ordena atividades por prioridade.
   * 3. Tenta alocar cada atividade (com suporte a aula dupla e fallback).
   * 4. Valida conflitos finais.
   * @returns {Object} Objeto contendo { schedule, log, conflicts }.
   */
  generate() {
    this._resetState();
    this.logMessage("Iniciando geração de grade...");

    // 1. Ordenação: Define a ordem crítica de alocação.
    // Aulas duplas e professores com muitas restrições vêm primeiro pois são mais difíceis de encaixar.
    const activities = this._getSortedActivities();
    this.logMessage(`Ordenadas ${activities.length} atividades por prioridade (aulas duplas e restrições).`);

    // 2. Alocação
    for (const activity of activities) {
      this._allocateActivity(activity);
    }

    // 3. Validação
    const conflicts = this._detectConflicts();

    this.logMessage("Geração concluída.");
    return { schedule: this.schedule, log: this.log, conflicts };
  }

  /**
   * Reinicia o estado interno para começar uma nova geração limpa.
   * @private
   */
  _resetState() {
    this.schedule = {};
    this.log = [];
    this.teacherSchedule = {};
    this.classSchedule = {};
    this.bookedEntries = [];
    this.timeSlots = this.data.timeSlots;
    // Filtra apenas os slots que são de aula (ignora intervalo/almoço)
    this.lessonIndices = this.timeSlots.map((_, i) => i).filter(i => this.timeSlots[i].type === 'aula');
  }

  /**
   * Retorna uma cópia das atividades ordenadas por prioridade.
   * Critérios:
   * 1. Aulas duplas (mais difícil de achar 2 slots seguidos).
   * 2. Professores com mais restrições (menos janelas de oportunidade).
   * @private
   */
  _getSortedActivities() {
    // Embaralhar para evitar viés de ordem de entrada (ex: todas turmas A antes da B)
    // Isso ajuda a distribuir as aulas ao longo da semana ao invés de preencher sequencialmente
    const shuffled = [...this.data.activities].sort(() => Math.random() - 0.5);

    return shuffled.sort((a, b) => {
      // 1. Priorizar aulas duplas
      if (a.doubleLesson && !b.doubleLesson) return -1;
      if (!a.doubleLesson && b.doubleLesson) return 1;

      // 2. Priorizar professores com mais restrições de horário
      const teacherA = this.data.teachers.find(t => t.id === a.teacherId);
      const teacherB = this.data.teachers.find(t => t.id === b.teacherId);
      const constraintsA = teacherA?.unavailable?.length || 0;
      const constraintsB = teacherB?.unavailable?.length || 0;
      return constraintsB - constraintsA;
    });
  }

  /**
   * Tenta alocar todas as aulas de uma atividade específica.
   * Usa uma abordagem de tentativas: tenta duplas primeiro (se solicitado), depois simples.
   * @private
   * @param {Object} activity - A atividade a ser agendada.
   */
  _allocateActivity(activity) {
    let remaining = activity.quantity;
    const activityName = this.data.subjects.find(s => s.id === activity.subjectId)?.name || activity.subjectId;
    const className = this.data.classes.find(c => c.id === activity.classId)?.name || activity.classId;

    this.logMessage(`Alocando ${activity.quantity} aulas de ${activityName} para ${className}${activity.doubleLesson ? ' (duplas)' : ''}...`);

    let attempts = 0;
    const maxAttempts = LIMITS.MAX_ATTEMPTS_PER_ACTIVITY; // Evita loops infinitos em casos impossíveis

    while (remaining > 0 && attempts < maxAttempts) {
      attempts++;

      // Estratégia A: Aula Dupla (Prioridade 1)
      if (activity.doubleLesson && remaining >= 2) {
        if (this._tryBookDouble(activity)) {
          remaining -= 2;
          this.logMessage(`  ✓ Alocada aula dupla (${remaining} restantes)`);
          continue; // Sucesso! Tenta próxima iteração (pode caber mais uma dupla)
        }
      }

      // Estratégia B: Aula Simples (Fallback ou Padrão)
      // Se a dupla falhou ou se só resta 1 aula, tenta alocar slots individuais
      if (remaining > 0) {
        if (this._tryBookSingle(activity)) {
          remaining--;
          if (remaining > 0) {
            this.logMessage(`  ✓ Alocada aula simples (${remaining} restantes)`);
          }
        }
      }

      // Critério de parada de emergência se não conseguir progredir
      if (attempts > LIMITS.EMERGENCY_STOP_THRESHOLD && remaining === activity.quantity) {
        break;
      }
    }

    if (remaining > 0) {
      this.logMessage(`  ⚠ Não foi possível alocar ${remaining} de ${activity.quantity} aulas de ${activityName} para ${className}.`);
    } else {
      this.logMessage(`  ✓ Todas as ${activity.quantity} aulas alocadas com sucesso!`);
    }
  }

  /**
   * Verifica se um slot específico está livre e é válido para uma alocação.
   * @private
   * @returns {boolean} True se disponível, False caso contrário.
   */
  _isAvailable(teacherId, classId, subjectId, dayIdx, slotIdx) {
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

    // 1. Disponibilidade do Professor (Indisponibilidades cadastradas)
    const teacher = this.data.teachers.find(t => t.id === teacherId);
    if (teacher && teacher.unavailable.includes(timeKey)) return false;

    // 2. Disponibilidade da Turma (Slots ativos na grade da turma)
    const cls = this.data.classes.find(c => c.id === classId);
    if (cls && !cls.activeSlots.includes(this.timeSlots[slotIdx].id)) return false;

    // 3. Compatibilidade de Turno (Manhã/Tarde/Noite/Integral)
    // Garante que uma turma da Manhã não tenha aula à Tarde, etc.
    if (cls) {
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
    }

    // 4. Preferências/Bloqueios da Matéria (se houver)
    const subject = this.data.subjects.find(s => s.id === subjectId);
    if (subject && subject.unavailable && subject.unavailable.includes(timeKey)) return false;

    // 5. Verifica se o horário já está ocupado (Colisão)
    if (this.teacherSchedule[teacherId]?.[timeKey]) return false; // Professor já ocupado
    if (this.classSchedule[classId]?.[timeKey]) return false;     // Turma já ocupada

    // 6. Regras de Negócio (Limites Diários)

    // Regra: Máximo 2 aulas da MESMA MATÉRIA por dia na turma
    const sameSubjectInClassOnDay = this.bookedEntries.filter(e =>
      e.classId === classId &&
      e.dayIdx === dayIdx &&
      e.subjectId === subjectId
    ).length;
    if (sameSubjectInClassOnDay >= LIMITS.MAX_SAME_SUBJECT_PER_DAY) return false;

    // Regra: Máximo 3 aulas do MESMO PROFESSOR por dia na turma (evita sobrecarga/cansaço)
    const teacherLessonsInClassOnDay = this.bookedEntries.filter(e =>
      e.teacherId === teacherId &&
      e.classId === classId &&
      e.dayIdx === dayIdx
    ).length;
    if (teacherLessonsInClassOnDay >= LIMITS.MAX_TEACHER_LOGGED_PER_DAY) return false;

    // 7. Verificação de Conflito de Horário Real (Smart Conflict Avoidance)
    // Impede que o professor seja agendado em slots diferentes que se sobrepõem no tempo real
    if (!this._isTeacherTimeCompatible(teacherId, dayIdx, slotIdx)) return false;

    return true;
  }

  /**
   * Verifica se dois slots são consecutivos temporalmente.
   * @private
   */
  _areConsecutive(slotIdx1, slotIdx2) {
    return Math.abs(slotIdx1 - slotIdx2) === 1 &&
      this.timeSlots[slotIdx1].type === 'aula' &&
      this.timeSlots[slotIdx2].type === 'aula';
  }

  /**
   * Calcula um score de "qualidade" para um slot, usado para desempate.
   * Quanto maior o score, melhor o slot.
   * @private
   */
  _getPreferenceScore(teacherId, subjectId, dayIdx, slotIdx) {
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    let score = 0;

    // 1. Preferência declarada da matéria (Peso Alto)
    const subject = this.data.subjects.find(s => s.id === subjectId);
    if (subject && subject.preferred && subject.preferred.includes(timeKey)) {
      score += SCORING.PREFERRED_SUBJECT;
    }

    // 2. Distribuição de Carga do Professor (Heurística)
    // Tenta espalhar as aulas do professor ao longo da semana ao invés de concentrar tudo num dia só.
    const lessonsOnDay = this.bookedEntries.filter(e => e.teacherId === teacherId && e.dayIdx === dayIdx).length;
    if (lessonsOnDay === 0) {
      score += SCORING.EMPTY_DAY; // Ótimo dia para começar (está vazio)
    } else if (lessonsOnDay === 1) {
      score += SCORING.ONE_LESSON; // Bom dia (ficará com 2 aulas)
    } else if (lessonsOnDay === 2) {
      score += SCORING.TWO_LESSONS; // Evitar sobrecarregar com 3ª aula se possível
    }

    return score;
  }

  /**
   * Verifica se o slot candidato conflita temporalmente com outros agendamentos do professor no mesmo dia.
   * @private
   */
  _isTeacherTimeCompatible(teacherId, dayIdx, candidateSlotIdx) {
    const candidateSlot = this.timeSlots[candidateSlotIdx];

    const candStart = this._minutes(candidateSlot.start);
    const candEnd = this._minutes(candidateSlot.end);

    // Filtra agendamentos deste professor neste dia
    const teacherEntries = this.bookedEntries.filter(e => e.teacherId === teacherId && e.dayIdx === dayIdx);

    for (const entry of teacherEntries) {
      const entryStart = this._minutes(entry.start);
      const entryEnd = this._minutes(entry.end);

      // Check overlap: StartA < EndB && EndA > StartB
      if (candStart < entryEnd && candEnd > entryStart) {
        return false; // Conflito de tempo real detectado
      }
    }
    return true;
  }

  /**
   * Efetiva o agendamento de uma aula na grade.
   * Salva nos mapas de lookup rápida e na lista plana de logs.
   * @private
   */
  _book(activity, dayIdx, slotIdx, isDoubleSecondPart = false, forceSingle = false) {
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    const scheduleKey = `${activity.classId}-${timeKey}`;

    this.schedule[scheduleKey] = {
      subjectId: activity.subjectId,
      teacherId: activity.teacherId,
      classId: activity.classId,
      timeKey,
      isDoubleLesson: forceSingle ? false : (isDoubleSecondPart ? false : activity.doubleLesson) // Apenas a 1ª da dupla leva a flag true
    };


    // Marca ocupação
    if (!this.teacherSchedule[activity.teacherId]) this.teacherSchedule[activity.teacherId] = {};
    this.teacherSchedule[activity.teacherId][timeKey] = true;

    if (!this.classSchedule[activity.classId]) this.classSchedule[activity.classId] = {};
    this.classSchedule[activity.classId][timeKey] = true;

    this.bookedEntries.push({
      teacherId: activity.teacherId,
      classId: activity.classId,
      subjectId: activity.subjectId,
      dayIdx,
      slotIdx,
      start: this.timeSlots[slotIdx].start,
      end: this.timeSlots[slotIdx].end
    });
  }

  /**
   * Tenta encontrar e agendar DOIS slots consecutivos (Aula Dupla).
   * @private
   */
  _tryBookDouble(activity) {
    const candidates = [];

    // Busca exaustiva por pares consecutivos livres
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (let i = 0; i < this.lessonIndices.length - 1; i++) {
        const slot1 = this.lessonIndices[i];
        const slot2 = this.lessonIndices[i + 1];

        // Verifica se são vizinhos E se ambos estão livres
        if (this._areConsecutive(slot1, slot2) &&
          this._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slot1) &&
          this._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slot2)) {

          const score = this._getPreferenceScore(activity.teacherId, activity.subjectId, dayIdx, slot1) +
            this._getPreferenceScore(activity.teacherId, activity.subjectId, dayIdx, slot2);
          candidates.push({ dayIdx, slot1, slot2, score });
        }
      }
    }

    if (candidates.length === 0) return false;

    // Escolhe o melhor candidato.
    candidates.sort((a, b) => b.score - a.score);

    // Aleatoriedade entre os melhores scores (empates)
    const maxScore = candidates[0].score;
    const topCandidates = candidates.filter(c => c.score === maxScore);
    const best = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    this._book(activity, best.dayIdx, best.slot1, false);
    this._book(activity, best.dayIdx, best.slot2, true); // Segundo slot marcado como parte da dupla
    return true;
  }

  /**
   * Tenta encontrar e agendar UM slot (Aula Simples).
   * @private
   */
  _tryBookSingle(activity) {
    const candidates = [];

    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        if (this._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
          const score = this._getPreferenceScore(activity.teacherId, activity.subjectId, dayIdx, slotIdx);
          candidates.push({ dayIdx, slotIdx, score });
        }
      }
    }

    if (candidates.length === 0) return false;

    // Escolhe o melhor. Em caso de empate, aleatoriedade para não viciar a grade sempre nos mesmos dias
    candidates.sort((a, b) => b.score - a.score);
    const maxScore = candidates[0].score;
    const topCandidates = candidates.filter(c => c.score === maxScore);
    const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    this._book(activity, chosen.dayIdx, chosen.slotIdx, false, true);
    return true;
  }

  /**
   * Detecta conflitos "reais" baseados na sobreposição de horários.
   * Isso é necessário porque o algoritmo principal usa 'slots' (índices), mas os horários reais
   * podem se sobrepor se houver turnos complexos ou cadastros inconsistentes.
   * @private
   */
  _detectConflicts() {
    const conflicts = [];
    // Agrupa todos os agendamentos por Professor+Dia
    const byTeacherDay = {};

    for (const entry of this.bookedEntries) {
      const key = `${entry.teacherId}-${entry.dayIdx}`;
      if (!byTeacherDay[key]) byTeacherDay[key] = [];
      byTeacherDay[key].push(entry);
    }

    // Verifica sobreposição dentro de cada grupo
    for (const key in byTeacherDay) {
      const sessions = byTeacherDay[key];
      // Ordena por horário de início
      sessions.sort((a, b) => a.start.localeCompare(b.start));

      for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
          const A = sessions[i];
          const B = sessions[j];
          if (A.classId === B.classId) continue; // Mesma turma ok (sequencial)
          if (A.end <= B.start) break; // Sem overlap, e como está ordenado, os próximos também não terão

          // Cálculo detalhado da sobreposição
          const overlapStart = A.start > B.start ? A.start : B.start;
          const overlapEnd = A.end < B.end ? A.end : B.end;
          const overlapDur = Math.max(0, this._minutes(overlapEnd) - this._minutes(overlapStart));
          const dayIdx = A.dayIdx;

          const timeKeyA = `${DAYS[dayIdx]}-${A.slotIdx}`;
          const timeKeyB = `${DAYS[dayIdx]}-${B.slotIdx}`;
          const scheduleKeyA = `${A.classId}-${timeKeyA}`;
          const scheduleKeyB = `${B.classId}-${timeKeyB}`;
          const subjAId = this.schedule[scheduleKeyA]?.subjectId;
          const subjBId = this.schedule[scheduleKeyB]?.subjectId;
          const subjectA = this.data.subjects.find(s => s.id === subjAId)?.name || subjAId || 'Matéria';
          const subjectB = this.data.subjects.find(s => s.id === subjBId)?.name || subjBId || 'Matéria';

          const reason = overlapDur > 0
            ? `Sobreposição de ${overlapDur} min (${overlapStart}-${overlapEnd}) entre aulas de ${subjectA} e ${subjectB}.`
            : `Intervalos encostados entre ${A.start}-${A.end} e ${B.start}-${B.end}. Verifique se há margem suficiente.`;

          conflicts.push({
            teacherId: A.teacherId,
            dayIdx,
            classes: [A.classId, B.classId],
            slots: [A.slotIdx, B.slotIdx],
            intervals: [{ start: A.start, end: A.end }, { start: B.start, end: B.end }],
            overlapMinutes: overlapDur,
            reason
          });
        }
      }
    }

    if (conflicts.length > 0) {
      conflicts.forEach(c => {
        this.logMessage(`Conflito: Professor ${c.teacherId} (${c.reason}) Turmas: ${c.classes.join(' & ')} Dia ${c.dayIdx}`);
      });
      this.logMessage(`Total de conflitos detectados: ${conflicts.length}`);
    } else {
      this.logMessage('Nenhum conflito de professor detectado.');
    }

    return conflicts;
  }
}

export default ScheduleManager;
