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
   * @param {Object} customLimits - (Opcional) Limites customizados (usados pela IA)
   * @param {Array} priorityFocus - (Opcional) Lista de IDs de matérias/turmas (ex: "Math-7A") pra priorizar.
   * @param {boolean} silent - (Opcional) Modo silencioso - não loga mensagens intermediárias
   */
  constructor(data, customLimits = null, priorityFocus = [], silent = false) {
    this.data = data;
    this.customLimits = customLimits || LIMITS; // Usa padrão se não houver custom
    this.priorityFocus = priorityFocus || [];   // Lista de prioridades da IA
    this.silent = silent;                        // Modo silencioso para iterações massivas
    this.schedule = {}; // Resultado final: { "classId-day-slot": info }
    this.log = [];      // Log de execução para debug/feedback visual
    this.importedSchedule = false; // Flag para modo correção

    // Estado interno (reiniciado a cada geração)
    this.teacherSchedule = {}; // Rastreia ocupação dos professores { teacherId: { timeKey: true } }
    this.classSchedule = {};   // Rastreia ocupação das turmas { classId: { timeKey: true } }
    this.bookedEntries = [];   // Lista plana de agendamentos para verificação fácil de limites e conflitos
    this.timeSlots = [];       // Cache dos slots de tempo
    this.lessonIndices = [];   // Índices dos slots que são realmente 'aula' (ignora intervalos)
    this.failures = [];        // Registro detalhado de falhas de alocação para IA
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
    if (!this.silent) {
      this.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }
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

    // 3. Validação e Resumo Final
    const conflicts = this._detectConflicts();

    // Limpar mensagens intermediárias e mostrar apenas o estado final
    this._clearPendingMessages();

    const finalPending = this._identifyMissingActivities();

    if (finalPending.length === 0) {
      this.logMessage("✨ Todas as aulas foram alocadas com sucesso!");
    } else {
      this.logMessage(`⚠️ ${finalPending.length} atividades com aulas pendentes:`);
      for (const activity of finalPending) {
        this.logMessage(`  ⚠ Faltam ${activity.remaining} aula(s) de ${activity.activityName} para ${activity.className}`);
      }
    }

    this.logMessage("Geração concluída.");
    return { schedule: this.schedule, log: this.log, conflicts };
  }

  /**
   * Reinicia o estado interno para começar uma nova geração limpa.
   * @private
   */
  _resetState() {
    this.schedule = {};
    // this.log = []; // MANTÉM OS LOGS (IMPORTANTE PARA HISTÓRICO DA IA)
    this.teacherSchedule = {};
    this.classSchedule = {};
    this.bookedEntries = [];
    this.timeSlots = this.data.timeSlots;
    // Filtra apenas os slots que são de aula (ignora intervalo/almoço)
    this.lessonIndices = this.timeSlots.map((_, i) => i).filter(i => this.timeSlots[i].type === 'aula');
    this.failures = [];
  }

  /**
   * Limpa mensagens de pendências antigas do log, mantendo apenas mensagens de contexto.
   * Usado antes de tentativas de correção para evitar acúmulo de mensagens históricas.
   * @private
   */
  _clearPendingMessages() {
    this.log = this.log.filter(msg => {
      // Remove mensagens de alocação parcial/falha (⚠)
      if (msg.includes('⚠ Não foi possível alocar')) return false;
      if (msg.includes('⚠ Falha persistente em dupla')) return false;
      // Mantém mensagens de contexto (iniciando, concluído, diagnóstico, etc)
      return true;
    });
  }

  /**
   * Retorna uma cópia das atividades ordenadas por prioridade ("Tightness").
   * Quanto MENOS slots disponíveis uma atividade tem, MAIOR sua prioridade.
   * @private
   */
  _getSortedActivities() {
    // 1. Calcular Tightness Ratio para cada atividade
    const ranked = this.data.activities.map(activity => {
      const subject = this.data.subjects.find(s => s.id === activity.subjectId);
      const teacher = this.data.teachers.find(t => t.id === activity.teacherId);
      const cls = this.data.classes.find(c => c.id === activity.classId);

      // Total de slots fisicamente possíveis (baseado no turno da turma e dias da semana)
      const possibleSlots = this.lessonIndices.length * DAYS.length; // Ex: 5 aulas * 5 dias = 25 slots

      // Slots bloqueados por restrições do professor
      // Obs: não estamos checando activeSlots da turma aqui pra simplificar, mas seria ideal
      const teacherBlocked = teacher?.unavailable?.length || 0;

      // Slots bloqueados por restrições da matéria (blacklist ou whitelist invertida)
      // Se subject.unavailable for MUITO grande, ratio sobe.
      // SE 'unavailable' for usado como "Bloqueios" (Blacklist - nosso padrão atual):
      const subjectBlocked = subject?.unavailable?.length || 0;

      const totalBlocked = teacherBlocked + subjectBlocked;
      const available = Math.max(1, possibleSlots - totalBlocked);

      // Ratio: Quantidade de Aulas / Slots Disponíveis
      // Ex: Precisa de 2 aulas e só tem 2 slots livres (ELETIVA) -> Ratio = 1.0 (Altíssima prioridade)
      // Ex: Precisa de 4 aulas e tem 20 slots livres (PORTUGUES) -> Ratio = 0.2 (Baixa prioridade)
      const tightnessRatio = activity.quantity / available;

      return { activity, tightnessRatio, subjectBlocked };
    });

    // 2. Ordenar descrescente (Maior ratio primeiro)
    ranked.sort((a, b) => {
      // Prioridade absoluta: Se tem restrição de matéria explícita (Eletiva)
      if (a.subjectBlocked > 0 && b.subjectBlocked === 0) return -1;
      if (a.subjectBlocked === 0 && b.subjectBlocked > 0) return 1;

      return b.tightnessRatio - a.tightnessRatio;
    });

    return ranked.map(r => r.activity);
  }

  /**
   * Tenta alocar todas as aulas de uma atividade específica.
   * suporta SWAP: Se falhar e for prioritária, tenta chutar alguém.
   * @private
   * @param {Object} activity - A atividade a ser agendada.
   * @param {Array} queue - Fila de atividades (para devolver despejados)
   */
  _allocateActivity(activity, queue) {
    let remaining = activity.quantity;
    const activityName = this.data.subjects.find(s => s.id === activity.subjectId)?.name || activity.subjectId;
    const className = this.data.classes.find(c => c.id === activity.classId)?.name || activity.classId;

    // Verificar prioridade para log
    const subject = this.data.subjects.find(s => s.id === activity.subjectId);
    const hasRestrictions = subject?.unavailable && subject.unavailable.length > 0;

    // Log inicial (opcional, pode ficar spammy num loop grande)
    // this.logMessage(`Alocando ${activityName}...`);

    let attempts = 0;
    const maxAttempts = LIMITS.MAX_ATTEMPTS_PER_ACTIVITY;

    // Tentativa normal de alocação
    while (remaining > 0 && attempts < maxAttempts) {
      attempts++;
      let bookedSomething = false;

      // ... (manter lógica de Dupla/Simples existente mas adaptada para retornar sucesso/falha claro)
      // Simplificando o loop: _tryBook agora deve lidar com a busca.

      // Tentar Dupla
      if (activity.doubleLesson && remaining >= 2) {
        if (this._tryBookDouble(activity)) {
          remaining -= 2;
          bookedSomething = true;
          continue;
        }
      }

      // Tentar Simples
      if (remaining > 0) {
        if (this._tryBookSingle(activity)) {
          remaining--;
          bookedSomething = true;
        }
      }

      if (bookedSomething) continue;

      // Se chegamos aqui, não conseguiu alocar "numa boa".
      // SE FOR MATÉRIA RESTRITA (PRIORITÁRIA), TENTAR SWAP (EVICÇÃO).
      if (hasRestrictions && !bookedSomething) {
        // Tentar expulsar alguém menos importante
        if (this._tryEvictForRestricted(activity, queue)) {
          // Se conseguiu expulsar alguém e pegar o lugar, conta como bookedSomething
          remaining--; // Assumindo que o _tryEvict já alocou
          bookedSomething = true;
          this.logMessage(`  ⚔ ${activityName} expulsou uma aula comum para garantir seu horário.`);
        }
      }

      // Se nem com swap deu certo, para para evitar loop infinito
      if (!bookedSomething) break;
    }

    // Se sobrou aulas, registra falha (mas sem drama, pois o loop principal cuida)
    if (remaining > 0) {
      const diagnosis = this._diagnoseFailure(activity);
      this.failures.push({
        activityName,
        className,
        teacherId: activity.teacherId,
        remaining,
        diagnosis
      });
      // this.logMessage(`  ⚠ Falha parcial: ${remaining} pendentes para ${activityName}`);
    } else {
      // Sucesso total
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

    // 4. RESTRIÇÕES OBRIGATÓRIAS da Matéria (BLOQUEIOS)
    // Se a matéria tem unavailable definido, esses slots são PROIBIDOS
    const subject = this.data.subjects.find(s => s.id === subjectId);
    if (subject && subject.unavailable && subject.unavailable.length > 0) {
      // Se a matéria definiu slots bloqueados, não podemos usar
      if (subject.unavailable.includes(timeKey)) {
        return false; // Este slot está BLOQUEADO para a matéria
      }
    }

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
    if (sameSubjectInClassOnDay >= this.customLimits.MAX_SAME_SUBJECT_PER_DAY) return false;

    // Regra: Máximo 3 aulas do MESMO PROFESSOR por dia na turma (evita sobrecarga/cansaço)
    const teacherLessonsInClassOnDay = this.bookedEntries.filter(e =>
      e.teacherId === teacherId &&
      e.classId === classId &&
      e.dayIdx === dayIdx
    ).length;
    if (teacherLessonsInClassOnDay >= this.customLimits.MAX_TEACHER_LOGGED_PER_DAY) return false;

    // 7. Verificação de Conflito de Horário Real (Smart Conflict Avoidance)
    // Impede que o professor seja agendado em slots diferentes que se sobrepõem no tempo real
    if (!this._isTeacherTimeCompatible(teacherId, dayIdx, slotIdx)) return false;

    return true;
  }

  /**
   * Diagnostica por que uma atividade não pôde ser alocada.
   * Verifica todos os slots possíveis e contabiliza os motivos de rejeição.
   * @private
   */
  _diagnoseFailure(activity) {
    const reasons = {};
    const incrementReason = (r) => reasons[r] = (reasons[r] || 0) + 1;

    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

        // 1. Indisponibilidade Professor
        const teacher = this.data.teachers.find(t => t.id === activity.teacherId);
        if (teacher && teacher.unavailable.includes(timeKey)) {
          incrementReason('PROFESSOR_INDISPONIVEL');
          continue;
        }

        // 2. Indisponibilidade Turma
        const cls = this.data.classes.find(c => c.id === activity.classId);
        if (cls && !cls.activeSlots.includes(this.timeSlots[slotIdx].id)) {
          incrementReason('TURMA_INATIVA_SLOT');
          continue;
        }

        // 3. Turno
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
          if (!isShiftCompatible) {
            incrementReason('INCOMPATIBILIDADE_TURNO');
            continue;
          }
        }

        // 4. Restrições da Matéria (BLOQUEIOS)
        const subject = this.data.subjects.find(s => s.id === activity.subjectId);
        if (subject && subject.unavailable && subject.unavailable.length > 0) {
          // Se horário está na lista de indisponíveis da matéria
          if (subject.unavailable.includes(timeKey)) {
            incrementReason('MATERIA_BLOQUEADA_HORARIO');
            continue;
          }
        }

        // 5. Ocupado
        if (this.teacherSchedule[activity.teacherId]?.[timeKey]) {
          incrementReason('PROFESSOR_OCUPADO');
          continue;
        }
        if (this.classSchedule[activity.classId]?.[timeKey]) {
          incrementReason('TURMA_OCUPADA');
          continue;
        }

        // 6. Limites
        const sameSubjectInClassOnDay = this.bookedEntries.filter(e =>
          e.classId === activity.classId && e.dayIdx === dayIdx && e.subjectId === activity.subjectId
        ).length;
        if (sameSubjectInClassOnDay >= this.customLimits.MAX_SAME_SUBJECT_PER_DAY) {
          incrementReason('LIMITE_AULAS_MATERIA_DIA');
          continue;
        }

        const teacherLessonsInClassOnDay = this.bookedEntries.filter(e =>
          e.teacherId === activity.teacherId && e.classId === activity.classId && e.dayIdx === dayIdx
        ).length;
        if (teacherLessonsInClassOnDay >= this.customLimits.MAX_TEACHER_LOGGED_PER_DAY) {
          incrementReason('LIMITE_AULAS_PROF_DIA');
          continue;
        }

        // 7. Time Compatibility
        if (!this._isTeacherTimeCompatible(activity.teacherId, dayIdx, slotIdx)) {
          incrementReason('CONFLITO_HORARIO_REAL');
          continue;
        }

        // Se chegou aqui, o slot estaria livre, mas talvez o algoritmo guloso escolheu outro caminho ou falhou em formar Dupla.
        incrementReason('LIVRE_MAS_NAO_USADO');
      }
    }
    return reasons;
  }

  /**
   * Verifica se dois slots são considerados consecutivos (para aula dupla).
   * AGORA RELAXADO: Permite pular 1 slot de intervalo (diferença <= 2).
   * @private
   */
  _areConsecutive(slotIdx1, slotIdx2) {
    // A lista lessonIndices garante que a ordem lógica seja seguida (Aula 1 -> Aula 2).
    // A verificação de física (indices do array timeSlots) garante que não pulamos um turno inteiro.
    // Diferença de 1 = Pegados. Diferença de 2 = Separados por 1 slot (ex: intervalo).
    const diff = Math.abs(slotIdx1 - slotIdx2);

    // Verificamos type === 'aula' por segurança, mas lessonIndices já filtra isso.
    return diff <= 2 &&
      this.timeSlots[slotIdx1].type === 'aula' &&
      this.timeSlots[slotIdx2].type === 'aula';
  }

  /**
   * Importa uma grade existente para o gerenciador (modo correção).
   * @param {Object} existingSchedule - Grade existente no formato { "classId-timeKey": entry }
   */
  importExistingSchedule(existingSchedule) {
    this._resetState();
    this.importedSchedule = true;
    this.logMessage('📥 Importando grade existente para correção...');

    let imported = 0;
    for (const [key, entry] of Object.entries(existingSchedule)) {
      this.schedule[key] = entry;

      // Reconstruir estado interno
      if (!this.teacherSchedule[entry.teacherId]) this.teacherSchedule[entry.teacherId] = {};
      this.teacherSchedule[entry.teacherId][entry.timeKey] = true;

      if (!this.classSchedule[entry.classId]) this.classSchedule[entry.classId] = {};
      this.classSchedule[entry.classId][entry.timeKey] = true;

      const [day, slotStr] = entry.timeKey.split('-');
      const dayIdx = DAYS.indexOf(day);
      const slotIdx = parseInt(slotStr);

      // CRÍTICO: Adicionar start e end do timeSlot
      const slot = this.timeSlots[slotIdx];

      this.bookedEntries.push({
        teacherId: entry.teacherId,
        classId: entry.classId,
        subjectId: entry.subjectId,
        dayIdx,
        slotIdx,
        timeKey: entry.timeKey,
        start: slot ? slot.start : '00:00',
        end: slot ? slot.end : '00:00'
      });

      imported++;
    }

    this.logMessage(`✅ ${imported} aulas importadas da grade anterior.`);
  }

  /**
   * Preenche apenas as aulas pendentes, podendo modificar a grade existente.
   * Prioriza professores/matérias com mais restrições.
   * MODO AGRESSIVO: Pode mover aulas existentes para resolver pendências.
   */
  fillPendingOnly() {
    if (!this.importedSchedule) {
      this.logMessage('⚠ Erro: Modo correção requer importação de grade existente.');
      return this.generate();
    }

    // Limpar mensagens antigas de pendências para mostrar apenas o estado atual
    this._clearPendingMessages();

    this.logMessage('🔧 Modo Correção Agressiva: Identificando pendências...');

    // Identificar o que falta
    const pending = this._identifyMissingActivities();

    if (pending.length === 0) {
      this.logMessage('✅ Nenhuma pendência detectada!');
      return { schedule: this.schedule, log: this.log, conflicts: this._detectConflicts() };
    }

    this.logMessage(`📋 ${pending.length} atividades com aulas pendentes.`);

    // Ordenar pendências por prioridade (mais restrições primeiro)
    const sortedPending = pending.sort((a, b) => {
      const teacherA = this.data.teachers.find(t => t.id === a.teacherId);
      const teacherB = this.data.teachers.find(t => t.id === b.teacherId);
      const subjectA = this.data.subjects.find(s => s.id === a.subjectId);
      const subjectB = this.data.subjects.find(s => s.id === b.subjectId);

      const constraintsA = (teacherA?.unavailable?.length || 0) + (subjectA?.unavailable?.length || 0);
      const constraintsB = (teacherB?.unavailable?.length || 0) + (subjectB?.unavailable?.length || 0);

      // Mais restrições = Prioridade
      if (constraintsB !== constraintsA) return constraintsB - constraintsA;

      // Quantidade maior = Prioridade
      return b.quantity - a.quantity;
    });

    // FASE 1: Tentar alocar em slots livres
    this.logMessage('🎯 Fase 1: Tentando alocar pendências em slots livres...');
    for (const activity of sortedPending) {
      // Se a quantidade pendente for ímpar ou igual a 1, forçar alocação simples
      const shouldForceSingle = activity.doubleLesson && (activity.quantity === 1 || activity.quantity % 2 === 1);

      if (shouldForceSingle) {
        this.logMessage(`  🔀 Forçando alocação simples para ${activity.activityName} (${activity.quantity} aula(s) pendente(s))`);
      }

      // Alocar todas as aulas pendentes
      for (let i = 0; i < activity.quantity; i++) {
        const singleActivity = {
          ...activity,
          quantity: 1,
          doubleLesson: shouldForceSingle ? false : activity.doubleLesson
        };

        if (this._tryBookSingle(singleActivity)) {
          this.logMessage(`  ✓ Alocada aula ${i + 1}/${activity.quantity} de ${activity.activityName} para ${activity.className}`);
        } else {
          this.logMessage(`  ✗ Não conseguiu alocar aula ${i + 1}/${activity.quantity} de ${activity.activityName}`);
        }
      }
    }

    // Verificar se ainda há pendências
    let remainingPending = this._identifyMissingActivities();

    if (remainingPending.length > 0) {
      // Limpar mensagens de pendências da Fase 1 antes de começar Fase 2
      this._clearPendingMessages();

      this.logMessage(`⚠️ ${remainingPending.length} atividades ainda com pendências.`);

      // FASE 2: Otimização agressiva - tentar realocar aulas para liberar espaço
      this.logMessage('🔄 Fase 2: Otimização agressiva (swaps e realocações)...');
      let improved = true;
      let rounds = 0;
      const MAX_OPTIMIZATION_ROUNDS = 5;

      while (improved && rounds < MAX_OPTIMIZATION_ROUNDS) {
        rounds++;
        this.logMessage(`🔄 Rodada de otimização ${rounds}...`);

        // Limpar mensagens de pendências da rodada anterior
        this._clearPendingMessages();

        improved = this._tryOptimizeBySwapping(remainingPending);

        if (improved) {
          const current = this._identifyMissingActivities();
          this.logMessage(`  ✓ Progresso: ${current.length} atividades pendentes.`);
          remainingPending = current;

          if (current.length === 0) break;
        }
      }

      // FASE 3: Última tentativa - forçar alocações simples ignorando flag de aula dupla
      remainingPending = this._identifyMissingActivities();
      if (remainingPending.length > 0) {
        this._clearPendingMessages();
        this.logMessage(`🎯 Fase 3: Última tentativa forçando alocações simples...`);

        for (const activity of remainingPending) {
          for (let i = 0; i < activity.quantity; i++) {
            const forceActivity = {
              ...activity,
              quantity: 1,
              doubleLesson: false
            };

            if (this._tryBookSingle(forceActivity)) {
              this.logMessage(`  ✓ Forçada aula simples ${i + 1}/${activity.quantity} de ${activity.activityName}`);
            }
          }
        }
      }
    }

    const conflicts = this._detectConflicts();

    // Limpar mensagens antigas e mostrar apenas o estado final
    this._clearPendingMessages();

    const finalPending = this._identifyMissingActivities();

    if (finalPending.length === 0) {
      this.logMessage('✨ Todas as pendências resolvidas!');
    } else {
      this.logMessage(`⚠️ ${finalPending.length} pendências não puderam ser resolvidas:`);
      // Listar detalhadamente cada pendência final
      for (const activity of finalPending) {
        this.logMessage(`  ⚠ Faltam ${activity.remaining} aula(s) de ${activity.activityName} para ${activity.className}`);
      }
    }

    this.logMessage('🔧 Correção concluída.');
    return { schedule: this.schedule, log: this.log, conflicts };
  }

  /**
   * Tenta otimizar a grade fazendo swaps/movimentações de aulas existentes.
   * @param {Array} pendingActivities - Lista de atividades pendentes
   * @returns {boolean} True se conseguiu fazer alguma melhoria
   * @private
   */
  _tryOptimizeBySwapping(pendingActivities) {
    let madeProgress = false;

    for (const pendingActivity of pendingActivities) {
      // Encontrar slots onde o professor está livre mas a turma está ocupada
      const possibleSlots = this._findPossibleSlotsForActivity(pendingActivity);

      if (possibleSlots.length === 0) continue;

      // Para cada slot possível, tentar realocar a aula que está ocupando
      for (const slot of possibleSlots) {
        const { dayIdx, slotIdx } = slot;
        const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
        const scheduleKey = `${pendingActivity.classId}-${timeKey}`;
        const blockingEntry = this.schedule[scheduleKey];

        if (!blockingEntry) continue; // Slot livre, não precisa swap

        // Tentar mover a aula que está bloqueando para outro lugar
        if (this._tryRelocateEntry(blockingEntry, dayIdx, slotIdx)) {
          // Conseguiu mover! Agora tentar alocar a pendente
          if (this._tryBookSingleAt(pendingActivity, dayIdx, slotIdx)) {
            this.logMessage(`  🔀 Realocada aula de ${this._getSubjectName(blockingEntry.subjectId)} para liberar espaço`);
            madeProgress = true;
            break; // Sucesso, próxima pendência
          }
        }
      }

      if (madeProgress) break; // Uma melhoria por vez
    }

    return madeProgress;
  }

  /**
   * Encontra slots onde seria possível alocar uma atividade se não houvesse conflito.
   * @private
   */
  _findPossibleSlotsForActivity(activity) {
    const possible = [];

    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

        // Verificar restrições básicas (professor disponível, turno compatível, etc)
        const teacher = this.data.teachers.find(t => t.id === activity.teacherId);
        if (teacher?.unavailable?.includes(timeKey)) continue;

        const cls = this.data.classes.find(c => c.id === activity.classId);
        if (cls && !cls.activeSlots.includes(this.timeSlots[slotIdx].id)) continue;

        // Professor não pode estar ocupado em OUTRA turma
        if (this.teacherSchedule[activity.teacherId]?.[timeKey]) {
          const existingEntry = Object.values(this.schedule).find(
            e => e.teacherId === activity.teacherId && e.timeKey === timeKey
          );
          if (existingEntry && existingEntry.classId !== activity.classId) continue;
        }

        possible.push({ dayIdx, slotIdx });
      }
    }

    return possible;
  }

  /**
   * Tenta realocar uma aula existente para outro slot.
   * @private
   */
  _tryRelocateEntry(entry, currentDayIdx, currentSlotIdx) {
    // Encontrar a atividade correspondente
    const activity = this.data.activities.find(
      a => a.classId === entry.classId &&
        a.subjectId === entry.subjectId &&
        a.teacherId === entry.teacherId
    );

    if (!activity) return false;

    // Procurar um slot livre para mover esta aula
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        // Não tentar no mesmo lugar
        if (dayIdx === currentDayIdx && slotIdx === currentSlotIdx) continue;

        if (this._isAvailable(entry.teacherId, entry.classId, entry.subjectId, dayIdx, slotIdx)) {
          // Remover da posição atual
          this._removeEntry(entry.classId, currentDayIdx, currentSlotIdx);

          // Alocar na nova posição
          this._book(activity, dayIdx, slotIdx, false, true);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Remove uma aula da grade.
   * @private
   */
  _removeEntry(classId, dayIdx, slotIdx) {
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    const scheduleKey = `${classId}-${timeKey}`;
    const entry = this.schedule[scheduleKey];

    if (!entry) return;

    // Remover da grade
    delete this.schedule[scheduleKey];

    // Remover dos rastreadores
    if (this.teacherSchedule[entry.teacherId]) {
      delete this.teacherSchedule[entry.teacherId][timeKey];
    }

    if (this.classSchedule[classId]) {
      delete this.classSchedule[classId][timeKey];
    }

    // Remover de bookedEntries
    const index = this.bookedEntries.findIndex(
      e => e.classId === classId && e.dayIdx === dayIdx && e.slotIdx === slotIdx
    );
    if (index !== -1) {
      this.bookedEntries.splice(index, 1);
    }
  }

  /**
   * Tenta alocar uma aula em um slot específico.
   * @private
   */
  _tryBookSingleAt(activity, dayIdx, slotIdx) {
    if (this._isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
      this._book(activity, dayIdx, slotIdx, false, true);
      return true;
    }
    return false;
  }

  /**
   * Helper para obter nome da matéria.
   * @private
   */
  _getSubjectName(subjectId) {
    return this.data.subjects.find(s => s.id === subjectId)?.name || subjectId;
  }

  /**
   * Identifica quais atividades ainda faltam aulas para serem alocadas.
   * Método tornado público para acesso pela IA.
   * @public
   */

  _identifyMissingActivities() {
    const missing = [];
    const availableResources = {};

    // 1. Mapa de disponibilidade (O que temos agendado)
    for (const entry of this.bookedEntries) {
      // Normalizar chaves para evitar mismatch de tipos (string vs number)
      const key = `${String(entry.classId)}-${String(entry.subjectId)}-${String(entry.teacherId)}`;
      availableResources[key] = (availableResources[key] || 0) + 1;
    }

    // 2. Verifica demanda (O que precisamos)
    for (const activity of this.data.activities) {
      const key = `${String(activity.classId)}-${String(activity.subjectId)}-${String(activity.teacherId)}`;
      const totalNeeded = Number(activity.quantity) || 0;

      // Consumir recursos disponíveis
      const available = availableResources[key] || 0;
      const consumed = Math.min(available, totalNeeded);

      // Atualizar recursos restantes (decrementa o que foi usado por esta atividade)
      if (availableResources[key]) {
        availableResources[key] -= consumed;
      }

      if (consumed < totalNeeded) {
        const remaining = totalNeeded - consumed;

        // Enriquecer com nomes e diagnóstico para a IA
        const subj = this.data.subjects.find(s => String(s.id) === String(activity.subjectId));
        const cls = this.data.classes.find(c => String(c.id) === String(activity.classId));
        const tea = this.data.teachers.find(t => String(t.id) === String(activity.teacherId));
        const diagnosis = this._diagnoseFailure ? this._diagnoseFailure(activity) : {};

        missing.push({
          ...activity,
          remaining: remaining,
          quantity: remaining, // Ajusta quantity para o que falta (para tentativas de alocação)
          activityName: subj ? subj.name : activity.subjectId,
          className: cls ? cls.name : activity.classId,
          teacherName: tea ? tea.name : activity.teacherId,
          diagnosis
        });

        this.logMessage(`DEBUG: Pendência detectada: ${remaining} aulas de ${subj ? subj.name : activity.subjectId} (Esp: ${totalNeeded}, Enc: ${available})`);
      }
    }

    return missing;
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
   * Tenta encontrar um slot "valido" para a matéria restrita, mas que esteja ocupado por alguém comum.
   * Se achar, expulsa o ocupante e toma o lugar.
   * @private
   */
  _tryEvictForRestricted(activity, queue) {
    // 1. Iterar sobre todos os slots possíveis
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

        // Verifica se O SLOT É VÁLIDO PARA A MATÉRIA RESTRITA (ignorando se está ocupado por outra aula)
        // Precisamos verificar restrições do professor, turno e DA MATÉRIA.

        // a. Restrições da própria matéria (CRUCIAL: Só queremos slots permitidos)
        const subject = this.data.subjects.find(s => s.id === activity.subjectId);
        if (subject?.unavailable?.length > 0 && subject.unavailable.includes(timeKey)) continue; // Bloqueado pra mim

        // b. Restrições do professor (Indisponibilidade)
        const teacher = this.data.teachers.find(t => t.id === activity.teacherId);
        if (teacher && teacher.unavailable.includes(timeKey)) continue;

        // c. Turno
        const cls = this.data.classes.find(c => c.id === activity.classId);
        if (cls && !cls.activeSlots.includes(this.timeSlots[slotIdx].id)) continue;
        // (Assumindo compatibilidade de turno aqui, ou checando via cls.shift vs slot)

        // d. Professor ocupado EM OUTRA TURMA? Se sim, não posso roubar o slot dele lá.
        // A colisão de professor é hard constraint.
        if (this.teacherSchedule[activity.teacherId]?.[timeKey]) {
          // Se o professor já dá aula nesse horário pra outra turma, não tem o que fazer.
          // A menos que eu movesse a aula do professor na outra turma também (muito complexo).
          continue;
        }

        // e. Se a MINHA turma está ocupada por OUTRA matéria
        const scheduleKey = `${activity.classId}-${timeKey}`;
        const occupant = this.schedule[scheduleKey];

        if (occupant) {
          // Ocupante existe. É uma matéria restrita?
          const occupantSubject = this.data.subjects.find(s => s.id === occupant.subjectId);
          const occupantIsRestricted = occupantSubject?.unavailable?.length > 0;

          // Só posso expulsar se o ocupante NÃO for restrito (ou for menos prioritário, mas simplificando: não restrito)
          if (!occupantIsRestricted) {
            // EUREKA! Posso roubar este slot.

            // 1. Remover ocupante (Evict)
            this._removeEntry(occupant.classId, dayIdx, slotIdx);

            // 2. Devolver ocupante para a fila (queue)
            // Precisamos reconstruir o objeto 'activity' do ocupante para reinserir
            const evicteeActivity = this.data.activities.find(a =>
              a.classId === occupant.classId &&
              a.subjectId === occupant.subjectId &&
              a.teacherId === occupant.teacherId
            );

            if (evicteeActivity) {
              // Adiciona de volta à fila (no início ou fim? Início para tentar realocar logo)
              // Ajuste: como activity.quantity é o total, e deletamos 1 aula, ele vai precisar alocar essa 1.
              // Na implementação da fila, pegamos a activity original. 
              // Se ela já foi processada no passado, ela saiu da fila.
              // Então precisamos reinseri-la.

              // CUIDADO: activitiesQueue contém objetos de "Atividade" (o pacote total de aulas).
              // Se eu reinserir a atividade inteira, o algoritmo vai tentar alocar TODAS as aulas dela de novo?
              // Meu _allocateActivity aloca 'remaining'.
              // A atividade na fila é apenas uma referência.
              // Problema: _allocateActivity consome 'remaining' localmente no loop.
              // Precisamos de um jeito de dizer "Falta 1 aula dessa atividade".

              // SOLUÇÃO SIMPLIFICADA PARA O CONTEXTO:
              // Adicionamos uma "micro-atividade" de 1 aula na fila?
              // Ou melhor: Na fila, usamos a referência da atividade.
              // Mas _allocateActivity precisa saber que tem que alocar +1.
              // Como _allocateActivity não mantém estado persistente de 'quantas faltam' fora da chamada...
              // Vamos criar um objeto clone com quantity=1 para reinserir na fila.

              const evicteeClone = { ...evicteeActivity, quantity: 1, doubleLesson: false }; // Força simples pois é fragmento
              queue.unshift(evicteeClone);
            }

            // 3. Alocar a minha (Restrita) neste slot
            this._book(activity, dayIdx, slotIdx, false, true); // forceSingle=true (simplifica)

            return true; // Sucesso no swap
          }
        } else {
          // Slot vazio! Se chegou aqui é porque o _tryBookSingle falhou por "PreferênciaScore" ou algo assim?
          // Ou talvez _isAvailable falhou por limite diário (MAX_SAME_SUBJECT_PER_DAY).
          // Se for limite diário, não adianta forçar.

          // Mas se chegamos aqui, passamos pelos checks manuais acima.
          // Vamos tentar alocar direto.
          this._book(activity, dayIdx, slotIdx, false, true);
          return true;
        }
      }
    }
    return false;
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
      // Ordena por horário de início (proteção contra undefined)
      sessions.sort((a, b) => {
        const startA = a.start || '00:00';
        const startB = b.start || '00:00';
        return startA.localeCompare(startB);
      });

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
