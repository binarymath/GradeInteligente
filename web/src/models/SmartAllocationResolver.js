import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';
import { LIMITS } from '../constants/schedule';

/**
 * Solucionador inteligente com greedy + backtracking melhorado.
 * Identifica slots livres, remove validações redundantes, força alocação.
 */
class SmartAllocationResolver {
  constructor(data, existingSchedule, limits = {}, syncValidator = null) {
    this.data = data;
    this.limits = { ...LIMITS, ...limits };
    this.schedule = { ...existingSchedule };
    this.syncValidator = syncValidator;

    this.teacherSchedule = {};
    this.classSchedule = {};
    this.bookedEntries = [];
    this.timeSlots = data.timeSlots;
    this.lessonIndices = this.timeSlots.map((_, i) => i).filter(i => this.timeSlots[i].type === 'aula');

    // ⭐ ESTRATÉGIA 1: Aumentar limites para zerar pendências
    this.maxTimeMs = 180000; // 180 segundos (3 minutos) - 6x mais tempo
    this.startTime = Date.now();
    this.attemptCount = 0;
    this.maxAttempts = 1000000; // 1 MILHÃO de tentativas - 10x mais
    this.log = [];
    this.debugInfo = {};
  }

  /**
   * Inicia o processo de resolução
   * @param {Array} pendingActivities - Atividades que não foram alocadas
   * @returns {Object} { schedule, bookedEntries, resolved, attemptCount, debugInfo }
   */
  resolve(pendingActivities) {
    // Reinicia contadores por execução
    this.startTime = Date.now();
    this.attemptCount = 0;

    this._initializeFromExistingSchedule();
    this.log = [];
    this.debugInfo = {};

    if (!pendingActivities || pendingActivities.length === 0) {
      return {
        schedule: this.schedule,
        bookedEntries: this.bookedEntries,
        resolved: true,
        attemptCount: 0,
        debugInfo: {}
      };
    }

    // Conta matérias únicas
    const uniqueSubjects = new Set(pendingActivities.map(a => `${a.classId}-${a.subjectId}`));
    this.log.push(`🧠 Solucionador inteligente: Analisando ${pendingActivities.length} aula(s) em ${uniqueSubjects.size} matéria(s)...`);

    // Passo 1: Coleta dados de ocupação
    this._analyzeOccupancy();

    // ⭐ Passo 1.5: Aloca aulas síncronas obrigatórias PRIMEIRO
    if (this.syncValidator) {
      this._allocateMandatorySyncClasses();
    }

    // Passo 2: Ordena atividades por dificuldade (menos falta = mais fácil = primeiro)
    const sorted = this._sortByMissingCount(pendingActivities);
    const sortedUniqueSubjects = new Set(sorted.map(a => `${a.classId}-${a.subjectId}`));
    this.log.push(`⏳ Processando ${sorted.length} aula(s) em ${sortedUniqueSubjects.size} matéria(s) por dificuldade`);

    // ⭐ Filtrar atividades síncronas com slot obrigatório (já tratadas na Fase 0)
    const nonMandatorySyncActivities = sorted.filter(activity => {
      if (!this.syncValidator) return true;

      const mandatorySlot = this.syncValidator.getMandatorySlot(
        activity.classId,
        activity.subjectId,
        activity.teacherId
      );

      // Se NÃO tem slot obrigatório, pode ser processada pelo greedy
      return !mandatorySlot;
    });

    if (nonMandatorySyncActivities.length < sorted.length) {
      const filteredCount = sorted.length - nonMandatorySyncActivities.length;
    }

    // Passo 3: Tenta alocar greedy first (apenas não-síncronas ou síncronas sem slot obrigatório)
    this.log.push(`✅ Fase greedy:`);
    const greedy = this._greedyAllocate(nonMandatorySyncActivities);

    // Passo 4: Se ainda houver pendências, usa backtracking inteligente
    const pendingAfterGreedy = this._getPendingActivities(pendingActivities);

    // Filtrar atividades síncronas obrigatórias do backtracking também
    const pendingNonMandatory = pendingAfterGreedy.filter(activity => {
      if (!this.syncValidator) return true;

      const mandatorySlot = this.syncValidator.getMandatorySlot(
        activity.classId,
        activity.subjectId,
        activity.teacherId
      );

      return !mandatorySlot;
    });

    if (pendingNonMandatory.length > 0) {
      const pendingSubjects = new Set(pendingNonMandatory.map(a => `${a.classId}-${a.subjectId}`));
      this.log.push(`🔄 Fase backtracking: Resolvendo ${pendingNonMandatory.length} aula(s) em ${pendingSubjects.size} matéria(s)...`);

      // Reseta contador para esta fase
      const backtrackStartAttempts = this.attemptCount;
      this._intelligentBacktrack(pendingNonMandatory);

      const backtrackAttempts = this.attemptCount - backtrackStartAttempts;
      if (backtrackAttempts === 0) {
        this.log.push(`   ⚠️ Backtracking não iniciou - todas as atividades sem slots disponíveis`);
      }
    }

    // Verifica se resolveu
    const finalPending = this._getPendingActivities(pendingActivities);
    const resolved = finalPending.length === 0;
    const elapsed = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

    if (resolved) {
      this.log.push(`✅ Sucesso! Todas as pendências foram resolvidas`);
      this.log.push(`   └─ ${this.attemptCount} tentativas em ${elapsed}s`);
    } else {
      const finalSubjects = new Set(finalPending.map(a => `${a.classId}-${a.subjectId}`));
      this.log.push(`⚠️ Solução parcial: ${finalPending.length} aula(s) em ${finalSubjects.size} matéria(s) ainda pendente(s)`);
      this.log.push(`   └─ ${this.attemptCount} tentativas em ${elapsed}s`);

      // Diagnóstico detalhado das atividades impossíveis (mostra até 15)
      if (finalPending.length > 0 && finalPending.length <= 15) {
        this.log.push(`📋 Diagnóstico detalhado:`);
        for (const pending of finalPending) {
          const reasons = this._diagnoseActivity(pending);
          reasons.forEach(r => this.log.push(`   ${r}`));

          // Sugestões rápidas orientadas por IA
          const suggestion = this._suggestFix(pending);
          if (suggestion) {
            this.log.push(`   💡 Sugestão: ${suggestion}`);
          }
        }
      }
    }

    return {
      schedule: this.schedule,
      bookedEntries: this.bookedEntries,
      resolved,
      attemptCount: this.attemptCount,
      debugInfo: this.debugInfo,
      log: this.log
    };
  }

  /**
   * Inicializa estruturas internas
   * @private
   */
  _initializeFromExistingSchedule() {
    this.teacherSchedule = {};
    this.classSchedule = {};
    this.bookedEntries = [];

    for (const [key, entry] of Object.entries(this.schedule)) {
      if (typeof key !== 'string') continue;
      const parts = key.split('-');
      if (parts.length < 3) continue;

      const [classId, dayStr, slotStr] = parts;
      const dayIdx = DAYS.indexOf(dayStr);
      const slotIdx = parseInt(slotStr, 10);

      if (dayIdx < 0 || Number.isNaN(slotIdx)) continue;

      const timeKey = `${dayStr}-${slotIdx}`;

      if (entry?.teacherId) {
        if (!this.teacherSchedule[entry.teacherId]) {
          this.teacherSchedule[entry.teacherId] = {};
        }
        this.teacherSchedule[entry.teacherId][timeKey] = true;
      }

      if (!this.classSchedule[classId]) {
        this.classSchedule[classId] = {};
      }
      this.classSchedule[classId][timeKey] = true;

      const ts = this.timeSlots[slotIdx];
      if (!ts) continue;

      this.bookedEntries.push({
        teacherId: entry?.teacherId,
        classId: entry?.classId,
        subjectId: entry?.subjectId,
        dayIdx,
        slotIdx,
        start: ts.start,
        end: ts.end
      });
    }
  }

  /**
   * Analisa ocupação geral
   * @private
   */
  _analyzeOccupancy() {
    const totalSlots = DAYS.length * this.lessonIndices.length;
    const occupiedSlots = this.bookedEntries.length;
    const freeSlots = Math.max(0, totalSlots - occupiedSlots);

    this.debugInfo.totalSlots = totalSlots;
    this.debugInfo.occupiedSlots = occupiedSlots;
    this.debugInfo.freeSlots = freeSlots;

    // Apenas mostra se houver slots livres realmente
    if (freeSlots > 0) {
      this.log.push(`   📊 Análise: ${occupiedSlots} aulas alocadas, ${freeSlots} horários livres disponíveis`);
    } else {
      this.log.push(`   ⚠️ Grade lotada: ${occupiedSlots} aulas em ${totalSlots} horários`);
    }
  }

  /**
   * Retorna atividades que ainda estão incompletas
   * @private
   */
  _getPendingActivities(activities) {
    const pending = [];
    const seen = new Set();

    activities.forEach(act => {
      const key = `${act.classId}-${act.subjectId}`;
      if (!seen.has(key)) {
        const bookedCount = this.bookedEntries.filter(e =>
          e.classId === act.classId && e.subjectId === act.subjectId
        ).length;

        if (bookedCount < act.quantity) {
          pending.push(act);
          seen.add(key);
        }
      }
    });

    return pending;
  }

  /**
   * Ordena atividades por quantas aulas faltam (menos falta = primeiro)
   * @private
   */
  _sortByMissingCount(activities) {
    const withMissing = activities.map(act => {
      const bookedCount = this.bookedEntries.filter(e =>
        e.classId === act.classId && e.subjectId === act.subjectId
      ).length;
      const missing = act.quantity - bookedCount;

      const key = `${act.classId}-${act.subjectId}`;
      this.debugInfo[key] = { missing, quantity: act.quantity, booked: bookedCount };

      return { ...act, missing };
    });

    // Remove duplicatas e ordena por missing crescente
    const unique = [];
    const seen = new Set();

    withMissing.sort((a, b) => a.missing - b.missing);

    for (const act of withMissing) {
      const key = `${act.classId}-${act.subjectId}`;
      if (!seen.has(key)) {
        unique.push(act);
        seen.add(key);
      }
    }

    return unique;
  }

  /**
   * ⭐ FASE 0: Aloca TODAS as aulas síncronas com horário obrigatório PRIMEIRO
   * @private
   */
  _allocateMandatorySyncClasses() {
    if (!this.syncValidator) {
      return;
    }

    this.log.push('🔒 Fase 0: Alocando aulas síncronas obrigatórias...');

    let allocated = 0;
    let conflicts = 0;
    let cleared = 0;

    // ⭐ PRÉ-PROCESSAMENTO: Identificar TODOS os slots obrigatórios e turmas
    const mandatorySlots = new Map(); // key: "dayIdx-slotIdx", value: Set de classIds

    for (const group of this.syncValidator.syncGroups.values()) {
      if (group.preferredDayIdx != null && group.preferredSlotIdx != null) {
        const slotKey = `${group.preferredDayIdx}-${group.preferredSlotIdx}`;
        if (!mandatorySlots.has(slotKey)) {
          mandatorySlots.set(slotKey, new Set());
        }
        for (const classId of group.classes) {
          mandatorySlots.get(slotKey).add(classId);
        }
      }
    }


    // ⭐ LIMPAR SLOTS OBRIGATÓRIOS: Remove qualquer coisa que esteja lá
    for (const [slotKey, classIds] of mandatorySlots.entries()) {
      const [dayIdx, slotIdx] = slotKey.split('-').map(Number);
      const dayName = DAYS[dayIdx];

      // ⚠️ ESTRATÉGIA AGRESSIVA: Remover TUDO da turma neste slot
      for (const classId of classIds) {
        // Encontra QUALQUER entrada desta turma neste dia-slot
        const entriesToRemove = this.bookedEntries.filter(e =>
          e.classId === classId &&
          e.dayIdx === dayIdx &&
          e.slotIdx === slotIdx
        );


        for (const entry of entriesToRemove) {
          this._deallocateSlot(entry, entry.dayIdx, entry.slotIdx);
          cleared++;
        }
      }

      // Remove conflitos de professor
      const professorsNeeded = new Set();
      for (const classId of classIds) {
        const activity = this.data.activities?.find(a =>
          a.classId === classId &&
          a.subjectId &&
          this.data.subjects?.find(s => s.id === a.subjectId && s.isSynchronous)
        );
        if (activity?.teacherId) {
          professorsNeeded.add(activity.teacherId);
        }
      }

      // Limpar TODAS as aulas dos professores necessários no slot obrigatório
      for (const teacherId of professorsNeeded) {
        const teacherEntries = this.bookedEntries.filter(e =>
          e.teacherId === teacherId &&
          e.dayIdx === dayIdx &&
          e.slotIdx === slotIdx
        );


        for (const entry of teacherEntries) {
          this._deallocateSlot(entry, entry.dayIdx, entry.slotIdx);
          cleared++;
        }

        // Garantir que teacherSchedule está limpo para este slot
        const timeKey = `${dayName}-${slotIdx}`;
        if (this.teacherSchedule[teacherId]) {
          delete this.teacherSchedule[teacherId][timeKey];
        }
      }
    }


    if (cleared > 0) {
      this.log.push(`🧹 Limpas ${cleared} aula(s) para liberar slots obrigatórios`);
    }

    // ⭐ ALOCAR APENAS OS SLOTS OBRIGATÓRIOS (não iterar por todos)
    for (const [slotKey] of mandatorySlots.entries()) {
      const [dayIdx, slotIdx] = slotKey.split('-').map(Number);
      const dayName = DAYS[dayIdx];
      const timeKey = `${dayName}-${slotIdx}`;

      // Obtém todas as atividades que DEVEM ir neste slot
      const syncActivities = this.syncValidator.getActivitiesByMandatorySlot(dayIdx, slotIdx);

      if (syncActivities.length === 0) {
        this.log.push(`   ⚠️ ${dayName} slot ${slotIdx}: Nenhuma atividade encontrada (verifique atribuições)`);
        continue;
      }

      this.log.push(`   📍 ${dayName} slot ${slotIdx}: ${syncActivities.length} aula(s) síncrona(s)`);

      // DEBUG: Verificar estado dos professores ANTES de alocar
      for (const { activity } of syncActivities) {
        const isOccupied = this.teacherSchedule[activity.teacherId]?.[timeKey];
      }

      // Aloca cada uma
      for (const { activity, group } of syncActivities) {
        try {
          // Verifica se pode alocar neste slot
          // IMPORTANTE: Passamos um flag indicando que é Fase 0 para ignorar validação de sincronização
          if (this._canAllocateSimple(activity, dayIdx, slotIdx, true)) {
            this._allocateSlot(activity, dayIdx, slotIdx, false);
            allocated++;
            this.log.push(`      ✅ ${activity.classId} - ${group.subjectId}`);
          } else {
            conflicts++;
            this.log.push(`      ⚠️ ${activity.classId} - Conflito`);
          }
        } catch (e) {
          conflicts++;
          this.log.push(`      ❌ ${activity.classId} - ${e.message}`);
        }
      }
    }

    this.log.push(`✅ Fase 0: ${allocated} alocadas, ${conflicts} conflitos`);
  }

  /**
   * Alocação gulosa - pega o primeiro slot disponível
   * @private
   */
  _greedyAllocate(activities) {
    let count = 0;
    let skipped = 0;

    for (const activity of activities) {
      const bookedCount = this.bookedEntries.filter(e =>
        e.classId === activity.classId && e.subjectId === activity.subjectId
      ).length;

      if (bookedCount >= activity.quantity) continue; // Já completa

      // Tenta alocar o faltante
      const toAllocate = activity.quantity - bookedCount;
      let allocated = 0;

      for (let dayIdx = 0; dayIdx < DAYS.length && allocated < toAllocate; dayIdx++) {
        for (const slotIdx of this.lessonIndices) {
          if (this._canAllocateSimple(activity, dayIdx, slotIdx)) {
            this._allocateSlot(activity, dayIdx, slotIdx, false);
            allocated++;
            count++;

            if (allocated >= toAllocate) break;
          }
        }
      }

      if (allocated < toAllocate) {
        skipped++;
      }
    }

    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    if (skipped > 0) {
      this.log.push(`   └─ Fase gulosa: ${count} aula(s) alocada(s), ${skipped} matéria(s) sem slot (${elapsed}s)`);
    } else {
      this.log.push(`   └─ Fase gulosa: Sucesso! ${count} aula(s) alocada(s) (${elapsed}s)`);
    }

    return { count };
  }

  /**
   * Backtracking inteligente com permutações de combinações
   * @private
   */
  _intelligentBacktrack(activities) {
    // Ordena por dificuldade (menos slots disponíveis primeiro)
    const sortedActivities = activities.sort((a, b) => {
      const slotsA = this._countAvailableSlotsFor(a);
      const slotsB = this._countAvailableSlotsFor(b);
      return slotsA - slotsB;
    });

    // Gera todas as combinações possíveis de (dia, slot) para cada atividade
    const combinations = sortedActivities.map(act => ({
      activity: act,
      slots: this._findAvailableSlots(act)
    }));

    // Se alguma atividade tem 0 slots, é impossível
    const impossible = combinations.filter(c => c.slots.length === 0);
    if (impossible.length > 0) {
      // Incrementa attemptCount para indicar que tentou
      this.attemptCount = 1;

      // Conta aulas e matérias únicas impossíveis
      const impossibleSubjects = new Set(impossible.map(c => `${c.activity.classId}-${c.activity.subjectId}`));

      const details = impossible.map(combo => {
        const subj = this.data.subjects?.find(s => s.id === combo.activity.subjectId);
        const cls = this.data.classes?.find(c => c.id === combo.activity.classId);
        const teacher = this.data.teachers?.find(t => t.id === combo.activity.teacherId);

        const subjName = subj?.name || combo.activity.subjectId;
        const clsName = cls?.name || combo.activity.classId;
        const teachName = teacher?.name || combo.activity.teacherId;

        return `${subjName} (${clsName}) - Prof. ${teachName}`;
      }).join(', ');

      this.log.push(`❌ ${impossible.length} aula(s) em ${impossibleSubjects.size} matéria(s) sem nenhum horário disponível:`);
      this.log.push(`   ${details}`);
      this.log.push(`   Motivos possíveis: professor ocupado em todos horários válidos,`);
      this.log.push(`   turma tem intervalo em todos os slots, ou conflito de turnos`);

      // Se TODAS as atividades são impossíveis, retorna
      if (impossible.length === combinations.length) {
        return;
      }

      // Senão, remove as impossíveis e tenta com as restantes
      const possibleCombinations = combinations.filter(c => c.slots.length > 0);
      if (possibleCombinations.length > 0) {
        this.log.push(`   ℹ️ Tentando resolver as ${possibleCombinations.length} aula(s) restantes com slots disponíveis...`);

        const totalSlots = possibleCombinations.reduce((sum, c) => sum + c.slots.length, 0);
        this.log.push(`   📊 Total de slots disponíveis: ${totalSlots} para ${possibleCombinations.length} aula(s)`);

        const success = this._backtrackCombinations(possibleCombinations, 0);

        if (success) {
          const elapsed = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
          this.log.push(`   ✅ Backtracking resolveu parcialmente! (${this.attemptCount} tentativas em ${elapsed}s)`);
        } else {
          const elapsed = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
          this.log.push(`   ⚠️ Backtracking não conseguiu resolver as restantes (${this.attemptCount} tentativas em ${elapsed}s)`);
        }
      }

      return;
    }

    // Log de slots disponíveis
    const totalSlots = combinations.reduce((sum, c) => sum + c.slots.length, 0);
    if (totalSlots === 0) {
      this.attemptCount = Math.max(this.attemptCount, 1);
      const elapsed = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
      this.log.push(`   ⚠️ Backtracking não iniciou: 0 slots válidos para ${combinations.length} aula(s) (${elapsed}s)`);
      return;
    }
    this.log.push(`   📊 Total de slots disponíveis: ${totalSlots} para ${combinations.length} aula(s)`);

    // Tenta combinações com backtracking
    const success = this._backtrackCombinations(combinations, 0);

    if (success) {
      const elapsed = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
      this.log.push(`   ✅ Backtracking resolveu todas as pendências! (${this.attemptCount} tentativas em ${elapsed}s)`);
    }
  }

  /**
   * Conta slots disponíveis para uma atividade (para ordenação)
   * @private
   */
  _countAvailableSlotsFor(activity) {
    let count = 0;
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        if (this._canAllocateSimple(activity, dayIdx, slotIdx)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Encontra TODOS os slots realmente disponíveis para uma atividade
   * @private
   */
  _findAvailableSlots(activity) {
    const slots = [];
    const classData = this.data.classes?.find(c => c.id === activity.classId);

    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        // Validação com contexto completo
        if (this._canAllocateSimple(activity, dayIdx, slotIdx)) {
          slots.push({ dayIdx, slotIdx });
        }
      }
    }

    return slots;
  }

  /**
   * Verifica se pode alocar aula simples (validações rigorosas)
   * @param {boolean} isPhase0MandatorySync - Se true, ignora validação de sincronização (Fase 0)
   * @private
   */
  _canAllocateSimple(activity, dayIdx, slotIdx, isPhase0MandatorySync = false) {
    const day = DAYS[dayIdx];
    const timeKey = `${day}-${slotIdx}`;
    const slot = this.timeSlots[slotIdx];

    if (!slot) {
      return false;
    }

    // ⭐ VALIDAÇÃO #1: Validar aula síncrona obrigatória
    if (this.syncValidator) {
      const mandatorySlot = this.syncValidator.getMandatorySlot(
        activity.classId,
        activity.subjectId,
        activity.teacherId
      );

      if (mandatorySlot) {

        if (dayIdx !== mandatorySlot.dayIdx || slotIdx !== mandatorySlot.slotIdx) {
          return false;
        }
      }
    }

    // ⭐ VALIDAÇÃO #2: Verificar sincronização
    // EXCEÇÃO: Durante Fase 0, ignoramos esta validação porque estamos construindo o grupo pela primeira vez
    if (this.syncValidator && !isPhase0MandatorySync) {
      if (this.syncValidator.wouldBreakSynchronization(
        this.bookedEntries,
        activity.classId,
        activity.subjectId,
        activity.teacherId,
        dayIdx,
        slotIdx
      )) {
        return false;
      }
    }

    // 1. VERIFICAR SE SLOT ESTÁ EM activeSlots/activeSlotsByDay DA TURMA
    const classData = this.data.classes?.find(c => c.id === activity.classId);
    if (!classData) {
      return false;
    }

    const slotId = this.timeSlots[slotIdx]?.id || String(slotIdx);

    if (isPhase0MandatorySync && slotIdx === 0) {
    }

    // Prioridade 1: activeSlotsByDay (novo - por dia)
    if (classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
      const activeSlotsForDay = classData.activeSlotsByDay[dayIdx];
      if (isPhase0MandatorySync && slotIdx === 0) {
      }
      if (!activeSlotsForDay || !Array.isArray(activeSlotsForDay) || !activeSlotsForDay.includes(slotId)) {
        if (isPhase0MandatorySync) {
        } else {
          if (slotIdx === 0) {
          }
          return false;
        }
      }
    }
    // Prioridade 2: activeSlots (legado)
    else if (classData.activeSlots && Array.isArray(classData.activeSlots) && classData.activeSlots.length > 0) {
      if (!classData.activeSlots.includes(slotId)) {
        if (isPhase0MandatorySync) {
        } else {
          return false;
        }
      }
    }
    // Prioridade 3: Sem restrição - apenas slots de aula
    else {
      if (slot.type && slot.type !== 'aula') {
        return false;
      }
    }

    // 2. TURMA OCUPADA?
    if (this.classSchedule[activity.classId]?.[timeKey]) {
      return false;
    }

    // 3. PROFESSOR OCUPADO?
    if (this._isTeacherConflict(activity.teacherId, slot)) {
      if (isPhase0MandatorySync && slotIdx === 0) {
      }
      return false;
    }

    // 4. TURNO BATE?
    const activityTurno = activity.shift || 'Todos';
    if (activityTurno !== 'Todos') {
      const classTurno = classData.shift || 'Todos';

      if (classTurno !== 'Todos' && classTurno !== activityTurno) {
        return false;
      }
    }

    if (isPhase0MandatorySync && slotIdx === 0) {
    }

    return true;
  }

  /**
   * Verifica conflito de horário do professor (nenhuma sobreposição, nem 10 min!)
   * @private
   */
  _isTeacherConflict(teacherId, newSlot) {
    if (!this.teacherSchedule[teacherId]) {
      return false;
    }

    const newStart = this._timeToMinutes(newSlot.start);
    const newEnd = this._timeToMinutes(newSlot.end);

    // Verifica todas as aulas já alocadas do professor
    for (const entry of this.bookedEntries) {
      if (entry.teacherId === teacherId) {
        const existingStart = this._timeToMinutes(entry.start);
        const existingEnd = this._timeToMinutes(entry.end);

        // Verifica sobreposição (inclusive parcial)
        if (newStart < existingEnd && newEnd > existingStart) {
          return true; // Há conflito!
        }
      }
    }

    return false;
  }

  /**
   * Converte HH:MM para minutos
   * @private
   */
  _timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Backtracking recursivo em combinações
   * @private
   */
  _backtrackCombinations(combinations, index) {
    // Timeout check
    if (Date.now() - this.startTime > this.maxTimeMs) {
      return false;
    }

    if (this.attemptCount > this.maxAttempts) {
      return false;
    }

    // Base case: todas as atividades foram alocadas
    if (index === combinations.length) {
      return true;
    }

    const { activity, slots } = combinations[index];

    // Se não há slots disponíveis para esta atividade, falha imediatamente
    if (slots.length === 0) {
      return false;
    }

    // Incrementa tentativas apenas quando tenta alocar
    this.attemptCount++;

    // Mostra progresso a cada 1000 tentativas
    if (this.attemptCount % 1000 === 0) {
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      const percentage = Math.round((index / combinations.length) * 100);
      this.log.push(`   🔧 Progresso: ${percentage}% (${index + 1}/${combinations.length} atividades, ${this.attemptCount} tentativas em ${elapsed}s)`);
    }

    // Tenta cada slot disponível
    for (const { dayIdx, slotIdx } of slots) {
      // Verifica novamente se pode alocar (pode ter mudado durante backtracking)
      if (!this._canAllocateSimple(activity, dayIdx, slotIdx)) {
        continue;
      }

      // Aloca
      this._allocateSlot(activity, dayIdx, slotIdx, false);

      // Recursão: tenta próxima atividade
      if (this._backtrackCombinations(combinations, index + 1)) {
        return true; // Sucesso!
      }

      // Desfaz se não funcionou (backtrack)
      this._deallocateSlot(activity, dayIdx, slotIdx);
    }

    // Nenhum slot funcionou para esta atividade
    return false;
  }

  /**
   * Aloca um slot
   * @private
   */
  _allocateSlot(activity, dayIdx, slotIdx, isDouble = false) {
    const day = DAYS[dayIdx];
    const slot = this.timeSlots[slotIdx];
    const timeKey = `${day}-${slotIdx}`;
    const key = `${activity.classId}-${day}-${slotIdx}`;

    this.schedule[key] = {
      subjectId: activity.subjectId,
      teacherId: activity.teacherId,
      classId: activity.classId,
      timeKey,
      isDoubleLesson: isDouble
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
      end: slot.end
    });
  }

  /**
   * Desaloca um slot
   * @private
   */
  _deallocateSlot(activity, dayIdx, slotIdx) {
    const day = DAYS[dayIdx];
    const timeKey = `${day}-${slotIdx}`;
    const key = `${activity.classId}-${day}-${slotIdx}`;

    delete this.schedule[key];

    if (this.teacherSchedule[activity.teacherId]) {
      delete this.teacherSchedule[activity.teacherId][timeKey];
    }

    if (this.classSchedule[activity.classId]) {
      delete this.classSchedule[activity.classId][timeKey];
    }

    this.bookedEntries = this.bookedEntries.filter(e =>
      !(e.teacherId === activity.teacherId &&
        e.classId === activity.classId &&
        e.dayIdx === dayIdx &&
        e.slotIdx === slotIdx)
    );
  }

  /**
   * Retorna o log
   */
  /**
   * Diagnóstico detalhado de por que uma atividade não pode ser alocada
   * @private
   */
  _diagnoseActivity(activity) {
    const reasons = [];
    const classData = this.data.classes?.find(c => c.id === activity.classId);
    const subjectData = this.data.subjects?.find(s => s.id === activity.subjectId);
    const teacherData = this.data.teachers?.find(t => t.id === activity.teacherId);

    const label = `${subjectData?.name || activity.subjectId} (${classData?.name || activity.classId}) - Prof. ${teacherData?.name || activity.teacherId}`;

    let validSlotsFound = 0;
    let totalChecked = 0;
    let blockedByInterval = 0;
    let blockedByClassOccupied = 0;
    let blockedByTeacher = 0;
    let blockedByTeacherUnavailable = 0;
    let blockedByShift = 0;
    let sampleFreeSlot = null;

    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        totalChecked++;
        const day = DAYS[dayIdx];
        const timeKey = `${day}-${slotIdx}`;
        const slot = this.timeSlots[slotIdx];

        if (!slot) continue;

        let blocked = false;
        const slotId = this.timeSlots[slotIdx]?.id || String(slotIdx);

        // Verifica intervalo/inativo da turma usando activeSlotsByDay ou activeSlots (legado)
        if (classData?.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
          const activeSlotsForDay = classData.activeSlotsByDay[dayIdx];
          if (!activeSlotsForDay || !activeSlotsForDay.includes(slotId)) {
            blockedByInterval++;
            blocked = true;
            continue;
          }
        } else if (classData?.activeSlots && Array.isArray(classData.activeSlots) && classData.activeSlots.length > 0) {
          if (!classData.activeSlots.includes(slotId)) {
            blockedByInterval++;
            blocked = true;
            continue;
          }
        }

        // Verifica se turma já tem aula nesse horário
        if (this.classSchedule[activity.classId]?.[timeKey]) {
          blockedByClassOccupied++;
          blocked = true;
          continue;
        }

        // Verifica indisponibilidade declarada do professor
        if (teacherData?.unavailable && teacherData.unavailable.includes(timeKey)) {
          blockedByTeacherUnavailable++;
          blocked = true;
          continue;
        }

        // Verifica conflito: professor em outra turma
        if (this._isTeacherConflict(activity.teacherId, slot)) {
          blockedByTeacher++;
          blocked = true;
          continue;
        }

        // Verifica turno
        const activityTurno = activity.shift || 'Todos';
        if (activityTurno !== 'Todos') {
          const classTurno = classData?.shift || 'Todos';
          if (classTurno !== 'Todos' && classTurno !== activityTurno) {
            blockedByShift++;
            blocked = true;
            continue;
          }
        }

        if (!blocked) {
          validSlotsFound++;
          if (!sampleFreeSlot) {
            sampleFreeSlot = { dayIdx, slotIdx };
          }
        }
      }
    }

    if (validSlotsFound === 0) {
      const details = [];
      if (blockedByInterval > 0) details.push(`${blockedByInterval} intervalo/fora do turno`);
      if (blockedByClassOccupied > 0) details.push(`${blockedByClassOccupied} turma ocupada`);
      if (blockedByTeacherUnavailable > 0) details.push(`${blockedByTeacherUnavailable} prof. indisponível`);
      if (blockedByTeacher > 0) details.push(`${blockedByTeacher} prof. em outra turma`);
      if (blockedByShift > 0) details.push(`${blockedByShift} conflito de turno`);

      reasons.push(`${label}: IMPOSSÍVEL - ${details.join(', ')} (${totalChecked} slots testados)`);
    } else {
      reasons.push(`${label}: ${validSlotsFound} slot(s) livre(s) encontrado(s) - mas backtracking falhou em encaixar`);
    }

    return reasons;
  }

  /**
   * Gera sugestões simples para liberar um slot para a atividade pendente
   * @private
   */
  _suggestFix(activity) {
    const classData = this.data.classes?.find(c => c.id === activity.classId);
    const subjectData = this.data.subjects?.find(s => s.id === activity.subjectId);
    const teacherData = this.data.teachers?.find(t => t.id === activity.teacherId);

    const label = `${subjectData?.name || activity.subjectId} (${classData?.name || activity.classId})`;

    // Se a turma tem activeSlots/activeSlotsByDay muito restritos, sugerir liberar 1 slot
    let activeCount = 0;
    const totalLessonSlots = this.lessonIndices.length * DAYS.length;

    if (classData?.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
      // Conta slots ativos por dia
      for (const dayIdx of Object.keys(classData.activeSlotsByDay)) {
        activeCount += classData.activeSlotsByDay[dayIdx].length;
      }
    } else if (classData?.activeSlots && classData.activeSlots.length > 0) {
      activeCount = classData.activeSlots.length;
    }

    if (activeCount > 0 && activeCount < totalLessonSlots / 2) {
      return `Revisar horários ativos da turma ${classData?.name}: liberar 1 horário marcado como intervalo pode acomodar ${label}.`;
    }

    // Verifica se professor está indisponível em muitos slots
    if (teacherData?.unavailable && teacherData.unavailable.length > 0) {
      const unavailableCount = teacherData.unavailable.length;
      const totalLessonSlots = this.lessonIndices.length * DAYS.length;
      if (unavailableCount > totalLessonSlots / 2) {
        return `Reduzir bloqueios do(a) prof. ${teacherData?.name}: muitos horários indisponíveis impedem alocação para ${label}.`;
      }
    }

    // Verifica conflito de professor em outra turma: sugere mover aula ocupante
    const conflict = this._findTeacherConflictSlot(activity);
    if (conflict) {
      const conflictClass = this.data.classes?.find(c => c.id === conflict.classId)?.name || conflict.classId;
      const slot = this.timeSlots[conflict.slotIdx];
      const day = DAYS[conflict.dayIdx];
      return `Mover aula do(a) prof. ${teacherData?.name} na ${conflictClass} em ${day} ${slot?.start || ''}-${slot?.end || ''} para liberar ${label}.`;
    }

    // Se nada claro, sugerir escolher um slot verde (já marcado como disponível)
    return `Escolha um dos slots livres destacados em verde para ${label} ou libere um horário removendo uma aula menos prioritária.`;
  }

  /**
   * Encontra um conflito de professor existente no mesmo slot
   * @private
   */
  _findTeacherConflictSlot(activity) {
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      for (const slotIdx of this.lessonIndices) {
        const day = DAYS[dayIdx];
        const timeKey = `${day}-${slotIdx}`;
        const slot = this.timeSlots[slotIdx];
        if (!slot) continue;

        if (this._isTeacherConflict(activity.teacherId, slot)) {
          // Encontrar qual classe ocupa
          const occupiedClass = Object.entries(this.classSchedule).find(([, schedule]) => schedule?.[timeKey]);
          if (occupiedClass) {
            return { dayIdx, slotIdx, classId: occupiedClass[0] };
          }
        }
      }
    }
    return null;
  }

  getLog() {
    return this.log;
  }
}

export default SmartAllocationResolver;
