import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';
import { SCORING, LIMITS } from '../constants/schedule';

/**
 * Gerenciador responsável pela criação da grade de horários.
 * Utiliza um algoritmo guloso (greedy) com heurísticas de preferência e fallback.
 */
class ScheduleManager {
  /**
   * @param {Object} data - Dados do sistema.
   * @param {Object} customLimits - (Opcional) Sobrescrita de limites padrão.
   * @param {Array} priorityFocus - (Opcional) IDs de atividades para priorizar.
   */
  constructor(data, customLimits = {}, priorityFocus = []) {
    this.data = data;
    this.limits = { ...LIMITS, ...customLimits }; // Merge com padrões
    this.priorityFocus = priorityFocus;

    this.schedule = {}; // Resultado final: { "classId-day-slot": info }
    this.log = [];      // Log de execução para debug/feedback visual

    // Estado interno (reiniciado a cada geração)
    this.teacherSchedule = {}; // Rastreia ocupação dos professores { teacherId: { timeKey: true } }
    this.classSchedule = {};   // Rastreia ocupação das turmas { classId: { timeKey: true } }
    this.bookedEntries = [];   // Lista plana de agendamentos para verificação fácil de limites e conflitos
    this.timeSlots = [];       // Cache dos slots de tempo
    this.lessonIndices = [];   // Índices dos slots que são realmente 'aula' (ignora intervalos)
    this.failures = [];        // Lista de atividades que não puderam ser alocadas
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
    // IMPORTANTE: Só resetar se não houver schedule existente (aulas síncronas)
    // Se importExistingSchedule foi chamado, preserva o schedule já preenchido
    if (Object.keys(this.schedule).length === 0) {
      this._resetState();
    }
    
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
    this.failures = [];
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

    const sorted = shuffled.sort((a, b) => {
      // 0. Prioridade ABSOLUTA (IA Focus) - ID based
      const isPriorityA = this.priorityFocus.includes(a.id) || this.priorityFocus.includes(`${a.subjectId}-${a.classId}`);
      const isPriorityB = this.priorityFocus.includes(b.id) || this.priorityFocus.includes(`${b.subjectId}-${b.classId}`);

      if (isPriorityA && !isPriorityB) return -1;
      if (!isPriorityA && isPriorityB) return 1;

      // 1. Priorizar atividades com PREFERÊNCIAS DE HORÁRIO (User Wishlist)
      // Se o usuário marcou slots verdes, ele quer muito que caiam lá. Alocar primeiro aumenta a chance.
      const subjectA = this.data.subjects.find(s => s.id === a.subjectId);
      const subjectB = this.data.subjects.find(s => s.id === b.subjectId);

      const hasPrefA = subjectA && subjectA.preferred && subjectA.preferred.length > 0;
      const hasPrefB = subjectB && subjectB.preferred && subjectB.preferred.length > 0;

      if (hasPrefA && !hasPrefB) return -1;
      if (!hasPrefA && hasPrefB) return 1;

      // 2. Priorizar atividades MAIS RESTRITAS (Menos slots disponíveis)
      // Calcula quantos slots reais existem para cada atividade (considerando turno, prof indisponível, etc.)
      const slotsA = this._countPotentialSlots(a);
      const slotsB = this._countPotentialSlots(b);

      if (slotsA < slotsB) return -1; // A tem menos slots, logo é mais difícil -> Prioridade
      if (slotsA > slotsB) return 1;

      // 3. Priorizar Aulas Duplas (soft constraint / optimization)
      if (a.doubleLesson && !b.doubleLesson) return -1;
      if (!a.doubleLesson && b.doubleLesson) return 1;

      return 0;
    });

    if (this.log.length < 20) { // Logar apenas no início para não poluir
      this.logMessage(`📋 Ordenação Inicial (Top 5):`);
      sorted.slice(0, 5).forEach(a => {
        const slots = this._countPotentialSlots(a);
        this.logMessage(`   ${a.subjectId} (${a.classId}): ${slots} slots válidos. Priority? ${this.priorityFocus.includes(a.id)}`);
      });
    }

    return sorted;
  }

  /**
   * Conta quantos slots na grade são teoricamente viáveis para esta atividade
   * (Considerando indisp. de professor, turno da turma e indisp. de matéria)
   * Ignora conflitos com outras aulas (pois ainda não foram alocadas)
   * @private
   */
  _countPotentialSlots(activity) {
    let count = 0;
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        // Checagem simplificada de disponibilidade estrutural
        if (this._isStructurallyAvailable(activity, dayIdx, slotIdx)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Verifica se o slot é estruturalmente viável (Turno, Indisponibilidades Fixas)
   * Ignora ocupação dinâmica (já que estamos ordenando antes de alocar)
   */
  _isStructurallyAvailable(activity, dayIdx, slotIdx) {
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

    // 1. Professor Indisponível (Hard Constraint)
    // Otimização: buscar obj professor só uma vez se fosse crítico, mas aqui é inicialização
    const teacher = this.data.teachers.find(t => t.id === activity.teacherId);
    if (teacher && teacher.unavailable.includes(timeKey)) return false;

    // 2. Turno da Turma
    const cls = this.data.classes.find(c => c.id === activity.classId);
    // Se a turma não tem esse slot na grade (activeSlots), não dá
    if (cls && !cls.activeSlots.includes(this.timeSlots[slotIdx].id)) return false;

    // 3. Matéria Indisponível (se houver)
    const subject = this.data.subjects.find(s => s.id === activity.subjectId);
    if (subject && subject.unavailable && subject.unavailable.includes(timeKey)) return false;

    return true;
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
      const diagnosis = this._diagnoseFailure(activity);
      this.logMessage(`  ⚠ Não foi possível alocar ${remaining} de ${activity.quantity} aulas de ${activityName} para ${className}.`);
      this.logMessage(`     Motivos prováveis (slots bloqueados): ${diagnosis}`);

      this.failures.push({
        activityId: activity.id,
        subjectId: activity.subjectId,
        teacherId: activity.teacherId,
        classId: activity.classId,
        remaining,
        reason: diagnosis
      });
    } else {
      this.logMessage(`  ✓ Todas as ${activity.quantity} aulas alocadas com sucesso!`);
    }
  }

  /**
   * Diagnostica por que uma atividade não conseguiu ser alocada, contando os motivos de bloqueio.
   * @private
   */
  _diagnoseFailure(activity) {
    const stats = {
      teahcherUnavailable: 0,
      classInactive: 0,
      shiftMismatch: 0,
      subjectUnavailable: 0,
      teacherBusy: 0,
      classBusy: 0,
      limitSubjectDay: 0,
      limitTeacherDay: 0,
      timeConflict: 0
    };

    const teacherId = activity.teacherId;
    const classId = activity.classId;
    const subjectId = activity.subjectId;

    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

        // Copia da lógica de _isAvailable para contagem
        const teacher = this.data.teachers.find(t => t.id === teacherId);
        if (teacher && teacher.unavailable.includes(timeKey)) { stats.teahcherUnavailable++; continue; }

        const cls = this.data.classes.find(c => c.id === classId);
        if (cls && !cls.activeSlots.includes(this.timeSlots[slotIdx].id)) { stats.classInactive++; continue; }

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
          if (!isShiftCompatible) { stats.shiftMismatch++; continue; }
        }

        const subject = this.data.subjects.find(s => s.id === subjectId);
        if (subject && subject.unavailable && subject.unavailable.includes(timeKey)) { stats.subjectUnavailable++; continue; }

        if (this.teacherSchedule[teacherId]?.[timeKey]) { stats.teacherBusy++; continue; }
        if (this.classSchedule[classId]?.[timeKey]) { stats.classBusy++; continue; }

        const sameSubjectInClassOnDay = this.bookedEntries.filter(e =>
          e.classId === classId && e.dayIdx === dayIdx && e.subjectId === subjectId
        ).length;
        if (sameSubjectInClassOnDay >= LIMITS.MAX_SAME_SUBJECT_PER_DAY) { stats.limitSubjectDay++; continue; }

        const teacherLessonsInClassOnDay = this.bookedEntries.filter(e =>
          e.teacherId === teacherId && e.classId === classId && e.dayIdx === dayIdx
        ).length;
        if (teacherLessonsInClassOnDay >= LIMITS.MAX_TEACHER_LOGGED_PER_DAY) { stats.limitTeacherDay++; continue; }

        if (!this._isTeacherTimeCompatible(teacherId, dayIdx, slotIdx)) { stats.timeConflict++; continue; }
      }
    }

    // Formatar saída
    const parts = [];
    if (stats.teahcherUnavailable > 0) parts.push(`Prof. Indisp: ${stats.teahcherUnavailable}`);
    if (stats.classInactive > 0) parts.push(`Turma Inativa: ${stats.classInactive}`);
    if (stats.shiftMismatch > 0) parts.push(`Turno Incomp: ${stats.shiftMismatch}`);
    if (stats.subjectUnavailable > 0) parts.push(`Matéria Indisp: ${stats.subjectUnavailable}`);
    if (stats.teacherBusy > 0) parts.push(`Prof. Ocupado: ${stats.teacherBusy}`);
    if (stats.classBusy > 0) parts.push(`Turma Ocupada: ${stats.classBusy}`);
    if (stats.limitSubjectDay > 0) parts.push(`Max Matéria/Dia: ${stats.limitSubjectDay}`);
    if (stats.limitTeacherDay > 0) parts.push(`Max Prof/Dia: ${stats.limitTeacherDay}`);
    if (stats.timeConflict > 0) parts.push(`Conflito Horário: ${stats.timeConflict}`);

    return parts.join(', ');
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
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score; // Maior score primeiro
      // Desempate: Menor slotIdx primeiro (Prefere aulas mais cedo: 1ª, 2ª...)
      if (a.slot1 !== b.slot1) return a.slot1 - b.slot1;
      return a.dayIdx - b.dayIdx; // Manter ordem dos dias se empatar slot
    });

    // Pega o vencedor (sem aleatoriedade se houver desempate claro)
    const best = candidates[0];

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

    // Sort: Score DESC -> Slot ASC -> Day ASC
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.slotIdx !== b.slotIdx) return a.slotIdx - b.slotIdx;
      return a.dayIdx - b.dayIdx;
    });

    const best = candidates[0];
    this._book(activity, best.dayIdx, best.slotIdx, false);
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

  /**
   * Tenta otimizar a grade após a geração inicial, focando em resolver falhas (aulas não alocadas).
   * Usa estratégias de "Swap" (troca) e "Move" (rearranjo).
   */
  optimize() {
    if (this.failures.length === 0) return { schedule: this.schedule, log: this.log, conflicts: this._detectConflicts() };

    this.logMessage(`Iniciando otimização via Swap/Move para ${this.failures.length} pendências...`);

    // Limite de iterações para evitar loop infinito
    const MAX_OPTIMIZATION_STEPS = 50;
    let solvedCount = 0;

    // Clone da lista de falhas para iterar (pois vamos remover itens dela se resolvermos)
    // Ordena falhas: aulas duplas primeiro, pois são mais difíceis
    const failuresToSolve = [...this.failures].sort((a, b) => (a.remaining >= 2 ? -1 : 1));

    // Array para rastrear quais já tentamos resolver nessa passada
    const processedFailures = new Set();

    // Tenta resolver cada falha
    for (let i = 0; i < failuresToSolve.length; i++) {
      if (solvedCount >= MAX_OPTIMIZATION_STEPS) break;

      const failure = failuresToSolve[i];
      if (processedFailures.has(failure.activityId)) continue;
      processedFailures.add(failure.activityId);

      // A failure tem estrutura: { activityId, subjectId, teacherId, classId, remaining, reason }
      // Precisamos reconstruir um objeto "activity" temporário para passar para os métodos de alocação
      const activityMock = {
        id: failure.activityId,
        subjectId: failure.subjectId,
        teacherId: failure.teacherId,
        classId: failure.classId,
        quantity: failure.remaining,
        doubleLesson: failure.remaining >= 2 // Tenta dupla se faltar > 2, senão simples
      };

      let resolved = false;

      // 1. Tenta resolver normal (Dupla se possível)
      if (this._resolveFailureWithSwap(activityMock)) {
        resolved = true;
      }
      // 2. Se falhou e era dupla, tenta QUEBRAR A AULA (Split Strategy)
      else if (activityMock.doubleLesson) {
        activityMock.doubleLesson = false; // Força simples
        if (this._resolveFailureWithSwap(activityMock)) {
          resolved = true;
          this.logMessage(`  🔨 Strategy: Aula dupla quebrada em simples para alocar ${activityMock.subjectId}.`);
        }
      }

      if (resolved) {
        solvedCount++;
        // Atualiza failure original (reduz remaining) ou remove se zerou
        failure.remaining -= (activityMock.doubleLesson ? 2 : 1);
        if (failure.remaining > 0) {
          // Se ainda falta, reseta o processamento pra tentar de novo na próxima
          processedFailures.delete(failure.activityId);
          i--; // Retenta mesma falha
        }
      }
    }

    // Atualiza lista oficial de falhas removendo as que foram zeradas
    this.failures = this.failures.filter(f => f.remaining > 0);

    if (solvedCount > 0) {
      this.logMessage(`✨ Otimização concluída: ${solvedCount} aulas recuperadas via Swap/Move.`);
    } else {
      this.logMessage(`Otimização finalizada. Nenhuma melhora possível encontrada.`);
    }

    return { schedule: this.schedule, log: this.log, conflicts: this._detectConflicts() };
  }

  /**
   * Tenta resolver uma falha específica movendo ou trocando aulas que estão ocupando o lugar.
   * @private
   */
  _resolveFailureWithSwap(activity) {
    // 1. Identificar slots candidatos na turma (onde CABERIA se não fosse o professor/bloqueio)
    // Para simplificar, buscamos slots onde a TURMA está livre, mas o PROFESSOR está ocupado (ou vice-versa).

    const candidates = [];
    // Varre todos slots
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        // Verifica se seria um slot válido SE estivesse vazio
        // Ignora verificação de occupied agora, checaremos manualmente quem ocupa

        // Se a TURMA já tem aula aqui, quem ocupa?
        const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
        const classOccupant = this.classSchedule[activity.classId]?.[timeKey]; // true/false

        // Se turma ocupada, precisamos ver se dá pra mover a aula da turma pra outro lugar
        // Se turma livre, mas professor ocupado, precisamos mover a aula do professor (em outra turma) pra outro lugar

        if (classOccupant) {
          candidates.push({ type: 'CLASS_BLOCKED', dayIdx, slotIdx });
        } else {
          // Turma livre. Checar professor.
          if (this.teacherSchedule[activity.teacherId]?.[timeKey]) {
            candidates.push({ type: 'TEACHER_BLOCKED', dayIdx, slotIdx });
          } else {
            // Turma livre E Professor livre.
            // Se falhou, foi LIMITE (Subject ou Teacher daily limit).
            // Verificar se o slot é fisicamente válido (turno, etc)
            // Se for válido, marcamos como candidato a resolver limite.
            // Simplificação: Assumimos que shift está ok (verificado em allocate, mas aqui n checamos).
            // Vamos checar activeSlots da turma pra ser seguro.
            const classObj = this.data.classes.find(c => c.id === activity.classId);
            const slotId = this.timeSlots[slotIdx].id;
            // Se turma pode ter aula nesse slot, então é um candidato LIMIT_BLOCKED
            if (classObj && classObj.activeSlots.includes(slotId)) {
              candidates.push({ type: 'LIMIT_BLOCKED', dayIdx, slotIdx });
            }
          }
        }
      }
    }

    // Tenta consertar cada candidato
    for (const cand of candidates) {
      if (cand.type === 'CLASS_BLOCKED') {
        // A turma tem aula X no slot S.
        // Se movermos aula X para slot S', S fica livre para nossa failure.
        if (this._tryMoveBlockingEntry(activity.classId, cand.dayIdx, cand.slotIdx, activity)) {
          return true;
        }
      } else if (cand.type === 'TEACHER_BLOCKED') {
        // O professor está dando aula na turma Y no slot S.
        // Se movermos essa aula da turma Y para slot S', o professor libera S.
        if (this._tryMoveTeacherBlockingEntry(activity.teacherId, cand.dayIdx, cand.slotIdx, activity)) {
          return true;
        }
      } else if (cand.type === 'LIMIT_BLOCKED') {
        // O slot está livre, mas não podemos usar por causa de LIMITE (max aulas dia).
        // Solução: Mover UMA OUTRA aula dessa mesma matéria/professor DESSE DIA para OUTRO DIA.
        if (this._tryResolveLimit(activity, cand.dayIdx, cand.slotIdx)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Tenta resolver problema de limite diário (Limit Blocked).
   * Procura uma aula JA AGENDADA que esteja causando o limite (mesma materia/prof no mesmo dia)
   * e tenta movê-la para UM OUTRO DIA.
   */
  _tryResolveLimit(targetActivity, dayIdx, targetSlotIdx) {
    // 1. Descobrir quem está contando para o limite.
    // É aula da mesma matéria (subjectId) na mesma turma (classId) nesse dia (dayIdx).
    // OU aula do mesmo professor (teacherId) nesse dia (dayIdx).

    // Vamos tentar mover aula da MESMA MATÉRIA/TURMA primeiro (Subject Limit).
    const subjectVictims = this.bookedEntries.filter(e =>
      e.classId === targetActivity.classId &&
      e.subjectId === targetActivity.subjectId &&
      e.dayIdx === dayIdx &&
      !e.isDoubleLesson // Simplificação
    );

    for (const victim of subjectVictims) {
      if (this._tryMoveVictimToAnotherDay(victim, targetActivity, dayIdx, targetSlotIdx)) return true;
    }

    // Se não resolveu, talvez seja Limite de Professor (muitas aulas dele no dia).
    // Tenta mover qualquer aula desse professor nesse dia (em qualquer turma).
    const teacherVictims = this.bookedEntries.filter(e =>
      e.teacherId === targetActivity.teacherId &&
      e.dayIdx === dayIdx &&
      !e.isDoubleLesson
    );

    for (const victim of teacherVictims) {
      if (this._tryMoveVictimToAnotherDay(victim, targetActivity, dayIdx, targetSlotIdx)) return true;
    }

    return false;
  }

  /**
   * Tenta mover uma aula 'victim' do dia atual para OUTRO dia,
   * e depois tenta alocar 'targetActivity' no 'targetSlotIdx'.
   */
  _tryMoveVictimToAnotherDay(victim, targetActivity, currentDayIdx, targetSlotIdx) {
    // Tentar mover victim para qualquer OUTRO dia
    for (let newDay = 0; newDay < DAYS.length; newDay++) {
      if (newDay === currentDayIdx) continue; // Tem que ser outro dia pra aliviar o limite

      for (const newSlot of this.lessonIndices) {
        if (this._isAvailable(victim.teacherId, victim.classId, victim.subjectId, newDay, newSlot)) {
          // Mover vítima
          this._unbook(victim.classId, victim.dayIdx, victim.slotIdx);

          const moveActivity = {
            id: 'moved_limit',
            teacherId: victim.teacherId,
            subjectId: victim.subjectId,
            classId: victim.classId,
            quantity: 1,
            doubleLesson: false
          };
          this._book(moveActivity, newDay, newSlot, false, true);

          // Agora tenta alocar o target no slot original desejado
          if (this._isAvailable(targetActivity.teacherId, targetActivity.classId, targetActivity.subjectId, currentDayIdx, targetSlotIdx)) {
            this._book(targetActivity, currentDayIdx, targetSlotIdx, false, true);
            this.logMessage(`  ♻ Limit Solved: Aula de ${victim.subjectId} movida para ${DAYS[newDay]}, liberando limite dia ${DAYS[currentDayIdx]}.`);
            return true;
          } else {
            // Reverter
            this._unbook(victim.classId, newDay, newSlot);
            // Re-book no lugar antigo
            this._book(moveActivity, currentDayIdx, victim.slotIdx, false, true); // victim.slotIdx original
            return false; // Não adiantou mover essa, ou deu erro ao alocar target
          }
        }
      }
    }
    return false;
  }

  /**
   * Tenta mover a aula que está bloqueando a turma no slot (dayIdx, slotIdx)
   * para liberar espaço para 'targetActivity'.
   * @param {number} depth - Profundidade da recursão (evitar loops infinitos)
   */
  _tryMoveBlockingEntry(classId, dayIdx, slotIdx, targetActivity, depth = 0) {
    if (depth > 2) return false; // Limite de recursão (Corrente de deslocamento)

    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    const scheduleKey = `${classId}-${timeKey}`;
    const existingEntry = this.schedule[scheduleKey];

    if (!existingEntry) return false; // Estranho, devia ter
    if (existingEntry.isDoubleLesson) return false; // Simplificação: não movemos aulas duplas por enquanto (complexo)

    // Tentar achar OUTRO slot livre para 'existingEntry'
    const teacherId = existingEntry.teacherId;
    const subjectId = existingEntry.subjectId;

    // Busca novo slot
    for (let newDay = 0; newDay < DAYS.length; newDay++) {
      for (const newSlot of this.lessonIndices) {
        if (newDay === dayIdx && newSlot === slotIdx) continue;

        // Verifica disponibilidade
        const isFree = this._isAvailable(teacherId, classId, subjectId, newDay, newSlot);

        if (isFree) {
          // Achamos um lugar VAZIO! Realizar a "troca" (Move)
          if (this._performMove(classId, dayIdx, slotIdx, newDay, newSlot, existingEntry, targetActivity)) return true;
        } else {
          // Se não está livre, podemos tentar DESLOCAR quem está lá?
          const targetKey = `${DAYS[newDay]}-${newSlot}`;
          const occupier = this.schedule[`${classId}-${targetKey}`];

          if (occupier && !occupier.isDoubleLesson) {
            // Verificar se 'existingEntry' PODE IR para 'newSlot' se ele estivesse vazio
            if (this._isAvailableIgnoringClassCollision(teacherId, classId, subjectId, newDay, newSlot)) {
              // Tenta Mover o Ocupante (Recursão)
              if (this._tryMoveBlockingEntry(classId, newDay, newSlot, existingEntry, depth + 1)) {
                // Sucesso! Ocupante saiu. Agora newSlot está livre.
                if (this._performMove(classId, dayIdx, slotIdx, newDay, newSlot, existingEntry, targetActivity)) {
                  this.logMessage(`    ↳ Chain Move (Depth ${depth}): Deslocamento em cadeia realizado.`);
                  return true;
                }
              }
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Helper para efetivar o movimento e tentar alocar o target original.
   */
  _performMove(classId, oldDay, oldSlot, newDay, newSlot, movingEntry, targetActivity) {
    // 1. Remove existingEntry da posição antiga
    this._unbook(classId, oldDay, oldSlot);

    // 2. Coloca existingEntry na nova posição
    const moveActivity = {
      id: 'moved',
      teacherId: movingEntry.teacherId,
      subjectId: movingEntry.subjectId,
      classId: movingEntry.classId,
      quantity: 1, doubleLesson: false
    };

    // Tenta agendar na nova posição
    // (Supomos que cabe, ou que foi liberado pela recursão)
    this._book(moveActivity, newDay, newSlot, false, true);

    // 3. Tenta alocar a targetActivity ORIGINAL no buraco que abriu
    const targetDay = oldDay;
    const targetSlot = oldSlot;

    if (this._isAvailable(targetActivity.teacherId, targetActivity.classId, targetActivity.subjectId, targetDay, targetSlot)) {
      this._book(targetActivity, targetDay, targetSlot, false, true);
      return true;
    } else {
      // Rollback
      this._unbook(classId, newDay, newSlot);
      this._book(moveActivity, oldDay, oldSlot, false, true);
      return false;
    }
  }

  /**
   * Verifica disponibilidade ignorando colisão de horário da própria turma.
   */
  /**
   * Verifica disponibilidade ignorando colisão de horário da própria turma E do próprio professor (se for swap).
   */
  _isAvailableIgnoringClassCollision(teacherId, classId, subjectId, dayIdx, slotIdx) {
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

    // 1. Ignorar colisão de TURMA
    const wasClassOccupied = this.classSchedule[classId]?.[timeKey];
    if (wasClassOccupied) delete this.classSchedule[classId][timeKey];

    // 2. Ignorar colisão de PROFESSOR (caso estejamos tentando mover pra um lugar onde O MESMO PROFESSOR já está)
    // Isso é crucial para permitir que o prof troque duas de suas aulas de lugar (Swap A <-> B)
    const wasTeacherOccupied = this.teacherSchedule[teacherId]?.[timeKey];
    if (wasTeacherOccupied) delete this.teacherSchedule[teacherId][timeKey];

    const result = this._isAvailable(teacherId, classId, subjectId, dayIdx, slotIdx);

    // Restaurar estado
    if (wasClassOccupied) this.classSchedule[classId][timeKey] = true;
    if (wasTeacherOccupied) this.teacherSchedule[teacherId][timeKey] = true;

    return result;
  }

  /**
  * Tenta mover a aula do PROFESSOR (que está na turma Y) para outro lugar,
  * liberando o professor para dar aula na turma X (targetActivity).
  */
  _tryMoveTeacherBlockingEntry(teacherId, dayIdx, slotIdx, targetActivity) {
    // Descobrir qual turma o professor está atendendo nesse slot
    // Precisamos varrer bookedEntries ou ter um mapa reverso melhor.
    // bookedEntries é um array, podemos filtrar.

    const entry = this.bookedEntries.find(e =>
      e.teacherId === teacherId &&
      e.dayIdx === dayIdx &&
      e.slotIdx === slotIdx
    );

    if (!entry) return false;

    // entry tem classId (Turma Y)
    const otherClassId = entry.classId;
    if (otherClassId === targetActivity.classId) return false; // Já tratamos 'mesma turma' no outro método

    // Tentar mover 'entry' para outro slot (na turma Y)
    const subjectId = entry.subjectId;

    // Busca novo slot para o professor na turma Y
    for (let newDay = 0; newDay < DAYS.length; newDay++) {
      for (const newSlot of this.lessonIndices) {
        if (newDay === dayIdx && newSlot === slotIdx) continue;

        if (this._isAvailable(teacherId, otherClassId, subjectId, newDay, newSlot)) {
          // Mover!
          this._unbook(otherClassId, dayIdx, slotIdx);

          const moveActivity = {
            id: 'moved_teacher',
            teacherId, subjectId, classId: otherClassId,
            quantity: 1, doubleLesson: false
          };

          this._book(moveActivity, newDay, newSlot, false, true);

          // Tenta alocar o target no slot liberado
          if (this._isAvailable(targetActivity.teacherId, targetActivity.classId, targetActivity.subjectId, dayIdx, slotIdx)) {
            this._book(targetActivity, dayIdx, slotIdx, false, true);
            this.logMessage(`  ♻ Swap Professor: Aula de ${teacherId} na turma ${otherClassId} movida, liberando professor.`);
            return true;
          } else {
            // Reverter
            this._unbook(otherClassId, newDay, newSlot);
            this._book(moveActivity, dayIdx, slotIdx, false, true);
            return false;
          }
        }
      }
    }
    return false;
  }

  /**
   * Remove um agendamento da grade (usado para movimentos).
   * @private
   */
  _unbook(classId, dayIdx, slotIdx) {
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    const scheduleKey = `${classId}-${timeKey}`;
    const entry = this.schedule[scheduleKey];

    if (!entry) return;

    delete this.schedule[scheduleKey];
    delete this.teacherSchedule[entry.teacherId][timeKey];
    delete this.classSchedule[classId][timeKey];

    // Remover de bookedEntries é O(N), mas ok
    this.bookedEntries = this.bookedEntries.filter(e =>
      !(e.classId === classId && e.dayIdx === dayIdx && e.slotIdx === slotIdx)
    );
  }

  /**
   * Importa uma grade existente e reconstrói o estado interno (bookedEntries, teacherSchedule, etc).
   * Usado para o "Modo Correção".
   * @param {Object} existingSchedule - Objeto schedule { "classId-day-slot": info }
   */
  importExistingSchedule(existingSchedule) {
    this._resetState();
    this.schedule = { ...existingSchedule };

    // Reconstrói índices baseados na grade importada
    for (const [key, entry] of Object.entries(this.schedule)) {
      // Extrai dayIdx e slotIdx da key "classId-DayName-SlotIdx" ? 
      // Não, a key é "classId-timeKey", onde timeKey é "DayName-SlotIdx"
      // entry tem: { subjectId, teacherId, classId, timeKey, isDoubleLesson }

      const [dayName, slotIdxStr] = entry.timeKey.split('-');
      const dayIdx = DAYS.indexOf(dayName);
      const slotIdx = parseInt(slotIdxStr, 10);

      if (dayIdx === -1 || isNaN(slotIdx)) continue;

      // FIX CRÍTICO: Ignorar slots que não sejam de aula (Ex: Intervalos)
      // Se não filtrarmos, eles contam como "aula dada" e impedem o preenchimento dos slots reais.
      if (!this.lessonIndices.includes(slotIdx)) continue;

      // Marca ocupação
      if (!this.teacherSchedule[entry.teacherId]) this.teacherSchedule[entry.teacherId] = {};
      this.teacherSchedule[entry.teacherId][entry.timeKey] = true;

      if (!this.classSchedule[entry.classId]) this.classSchedule[entry.classId] = {};
      this.classSchedule[entry.classId][entry.timeKey] = true;

      const slot = this.timeSlots[slotIdx];

      this.bookedEntries.push({
        teacherId: entry.teacherId,
        classId: entry.classId,
        subjectId: entry.subjectId,
        dayIdx,
        slotIdx,
        start: slot ? slot.start : '00:00',
        end: slot ? slot.end : '00:00'
      });
    }

    this.logMessage(`Grade importada com sucesso. ${this.bookedEntries.length} aulas já alocadas.`);
  }

  /**
   * Tenta preencher apenas as aulas que faltam (diferença entre esperado e já alocado).
   * Mantém o que já foi importado.
   */
  fillPendingOnly() {
    this.logMessage("Iniciando preenchimento de pendências (Modo Correção)...");

    // 0. LIMPEZA DE ZUMBIS (CRÍTICO)
    // Verifica se existem entradas em 'bookedEntries' que NÃO estão no 'schedule' oficial.
    // Isso resolve o problema de "Falso Sucesso" onde a contagem está alta mas a grade está vazia.
    const initialCount = this.bookedEntries.length;
    this.bookedEntries = this.bookedEntries.filter(entry => {
      const scheduleKey = `${entry.classId}-${DAYS[entry.dayIdx]}-${entry.slotIdx}`;
      const realEntry = this.schedule[scheduleKey];
      if (!realEntry) return false; // Zumbi (não existe na grade)

      // Verifica se é a mesma matéria (pode ter sido sobrescrito)
      if (realEntry.subjectId !== entry.subjectId) return false; // Zumbi (sobrescrito)
      return true;
    });
    const purged = initialCount - this.bookedEntries.length;
    if (purged > 0) {
      this.logMessage(`💀 Removidos ${purged} agendamentos fantasmas (Zumbis) detectados na memória.`);
    }

    // 1. Mapa de Ocupação Atual (O que já está na grade)
    // Chave: "classId-subjectId" -> Quantidade alocada
    // Nota: Ignoramos teacherId na chave para o total, pois o foco é "Matéria na Turma".
    // Mas para alocação precisamos do teacherId da atividade original.
    // Assumimos que para uma mesma "Turma-Matéria", o professor é constante ou irrelevante para a contagem de "vagas preenchidas".

    const bookedCounts = {};

    for (const entry of this.bookedEntries) {
      const key = `${entry.classId}-${entry.subjectId}`;
      bookedCounts[key] = (bookedCounts[key] || 0) + 1;
    }

    // 2. Mapa de Demanda Total (O que precisa ter)
    // Chave: "classId-subjectId" -> { totalNeeded: N, activities: [] }
    const demandMap = {};

    for (const activity of this.data.activities) {
      const key = `${activity.classId}-${activity.subjectId}`;
      if (!demandMap[key]) demandMap[key] = { totalNeeded: 0, activities: [] };

      demandMap[key].totalNeeded += (Number(activity.quantity) || 0);
      demandMap[key].activities.push(activity);
    }

    const pendingActivities = [];

    // 3. Calcula o Delta (O que falta) e distribui entre as atividades disponíveis
    for (const [key, demand] of Object.entries(demandMap)) {
      const alreadyBooked = bookedCounts[key] || 0;
      let itemsToAllocate = demand.totalNeeded - alreadyBooked;

      if (itemsToAllocate <= 0) {
        // Debug: Mostrar Onde estão essas aulas
        const myEntries = this.bookedEntries.filter(e => e.classId === key.split('-')[0] && e.subjectId === key.split('-')[1]);
        const locations = myEntries.map(e => `${DAYS[e.dayIdx] || e.dayIdx}-${e.slotIdx}`).join(', ');
        this.logMessage(`  [SKIP/OK] '${key}' completa (${alreadyBooked}/${demand.totalNeeded}). Locais: [${locations}]`);
        continue;
      }

      // Distribui a "pendência" entre as atividades que compõem essa demanda.
      // Ex: 2 atividades de 2 aulas (Total 4). Booked 2. Pendente 2.
      // Pega a primeira atividade, vê quantity 2. Cria pendência de até 2.
      // Se sobrar, vai para a próxima.

      for (const activity of demand.activities) {
        if (itemsToAllocate <= 0) break;

        // Quanto dessa atividade específica "cabe" na pendência?
        // Não importa se ela especificamente "já foi feita", pois não temos ID na grade.
        // Tratamos como um pool genérico de aulas daquela matéria.
        const quantityForThis = Math.min(itemsToAllocate, activity.quantity);

        pendingActivities.push({
          ...activity,
          quantity: quantityForThis // Ajusta para alocar apenas o necessário
        });

        itemsToAllocate -= quantityForThis;
      }
    }

    if (pendingActivities.length === 0) {
      return { schedule: this.schedule, log: this.log, conflicts: [] };
    }

    this.logMessage(`Found ${pendingActivities.length} activities with pending lessons.`);

    // Ordena as pendentes
    const sortedPending = pendingActivities.sort((a, b) => {
      // 0. Prioridade ABSOLUTA (IA Focus)
      const isPriorityA = this.priorityFocus.includes(a.id) || this.priorityFocus.includes(`${a.subjectId}-${a.classId}`);
      const isPriorityB = this.priorityFocus.includes(b.id) || this.priorityFocus.includes(`${b.subjectId}-${b.classId}`);

      if (isPriorityA && !isPriorityB) return -1;
      if (!isPriorityA && isPriorityB) return 1;

      if (a.doubleLesson && !b.doubleLesson) return -1;
      if (!a.doubleLesson && b.doubleLesson) return 1;
      return 0; // Simplificado para correções
    });

    // Aloca as pendências
    for (const activity of sortedPending) {
      this._allocateActivity(activity);
    }

    // Valida final
    const conflicts = this._detectConflicts();
    this.logMessage("Correção concluída.");

    return { schedule: this.schedule, log: this.log, conflicts };
  }
  /**
   * Força a liberação de slots para atividades prioritárias.
   * Se uma atividade da lista 'priorityFocus' não estiver 100% alocada,
   * este método procura slots válidos para ela que estejam ocupados por outras aulas
   * e as "expulsa" para abrir caminho.
   */
  bumpPriorityBlockers(priorityIds) {
    if (!priorityIds || priorityIds.length === 0) return;

    this.logMessage(`🛡️ Modo de Correção Agressiva: Verificando ${priorityIds.length} itens prioritários...`);

    for (const priorityId of priorityIds) {
      // Tenta achar atividade por ID ou chave composta
      let activity = this.data.activities.find(a => a.id === priorityId || `${a.subjectId}-${a.classId}` === priorityId);

      if (!activity) continue;

      // Verifica quanto falta alocar
      const bookedCount = this.bookedEntries.filter(e =>
        e.classId === activity.classId && e.subjectId === activity.subjectId
      ).length;

      const remaining = activity.quantity - bookedCount;
      if (remaining <= 0) continue; // Já está ok

      this.logMessage(`  -> Prioridade '${activity.id}' precisa de ${remaining} slots. Tentando abrir caminho...`);

      let bumpedCount = 0;

      // Coletar todos os slots candidatos primeiro para ordenar por preferência
      const candidates = [];

      for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {

        // 1. Verificar Limites Diários da Matéria (Hard Limit)
        const sameSubjectOnDay = this.bookedEntries.filter(e =>
          e.classId === activity.classId &&
          e.dayIdx === dayIdx &&
          e.subjectId === activity.subjectId
        ).length;

        // Se já atingiu o limite, esquece esse dia inteiro.
        if (sameSubjectOnDay >= LIMITS.MAX_SAME_SUBJECT_PER_DAY) continue;

        // 2. Verifica limite do professor
        const teacherLessonsOnDay = this.bookedEntries.filter(e =>
          e.teacherId === activity.teacherId &&
          e.classId === activity.classId &&
          e.dayIdx === dayIdx
        ).length;

        if (teacherLessonsOnDay >= LIMITS.MAX_TEACHER_LOGGED_PER_DAY) continue;

        for (const slotIdx of this.lessonIndices) {
          const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

          // 3. Estruturalmente viável?
          if (!this._isStructurallyAvailable(activity, dayIdx, slotIdx)) continue;

          // 4. Temporalmente viável?
          if (!this._isTeacherTimeCompatible(activity.teacherId, dayIdx, slotIdx)) continue;

          // Calcula Score (Preferência)
          const score = this._getPreferenceScore(activity.teacherId, activity.subjectId, dayIdx, slotIdx);

          candidates.push({ dayIdx, slotIdx, score, timeKey });
        }
      }

      // Ordenar candidatos: Melhor Score -> Pior Score
      // Isso garante que se tivermos que chutar alguém, chutamos daquele lugar que a gente QUER MUITO (Verde)
      candidates.sort((a, b) => b.score - a.score);

      for (const cand of candidates) {
        if (bumpedCount >= remaining) break;
        const { dayIdx, slotIdx, timeKey } = cand;

        // 5. Verifica Colisão de Professor (Deep Eviction)
        const teacherBusy = this.teacherSchedule[activity.teacherId]?.[timeKey];
        const occupier = this.classSchedule[activity.classId]?.[timeKey];

        if (teacherBusy) {
          const blockerEntry = this.bookedEntries.find(e =>
            e.teacherId === activity.teacherId &&
            e.dayIdx === dayIdx &&
            e.slotIdx === slotIdx
          );

          if (blockerEntry) {
            if (blockerEntry.classId === activity.classId && blockerEntry.subjectId === activity.subjectId) continue;
            this.logMessage(`     🔥 [DEEP BUMP] Desalocando prof ${activity.teacherId} da turma ${blockerEntry.classId} (Matéria ${blockerEntry.subjectId}) para prioridade.`);
            this._unbook(blockerEntry.classId, dayIdx, slotIdx);
          }
        }

        // 6. Verifica Colisão de Slot na Turma Target
        const reCheckOccupier = this.classSchedule[activity.classId]?.[timeKey];

        if (reCheckOccupier) {
          if (reCheckOccupier.subjectId === activity.subjectId) continue;
          this.logMessage(`     🔨 [BUMP SCORE=${cand.score}] Removendo ${reCheckOccupier.subjectId} da turma ${activity.classId} (Dia ${DAYS[dayIdx]}-${slotIdx}).`);
          this._unbook(activity.classId, dayIdx, slotIdx);
          bumpedCount++;
        } else {
          // Se estava livre (ou ficou livre), contamos
          const reCheckTeacherBusy = this.teacherSchedule[activity.teacherId]?.[timeKey];
          if (!reCheckTeacherBusy) bumpedCount++;
        }
      }
    }
  }
}

export default ScheduleManager;
