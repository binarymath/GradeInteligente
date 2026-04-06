import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';
import { SCORING, LIMITS } from '../constants/schedule';

/**
 * CSP (Constraint Satisfaction Problem) Scheduler
 * 
 * Implementa algoritmo avançado com:
 * - Arc Consistency (AC-3) para redução de domínios
 * - Backtracking com MRV (Minimum Remaining Values)
 * - LCV (Least Constraining Value) para ordenação de valores
 * - Constraint Propagation para corte do espaço de busca
 * 
 * Objetivo: Reduzir erros de 52 para zero ou perto disso
 */
class CSPScheduleManager {
  constructor(data, customLimits = {}) {
    this.data = data;
    this.limits = { ...LIMITS, ...customLimits };
    
    // Estado
    this.schedule = {};
    this.log = [];
    this.bookedEntries = [];
    this.failures = [];
    
    // CSP State
    this.activities = [];
    this.domains = new Map(); // activityId -> Set de (dayIdx, slotIdx)
    this.teacherSchedule = {};
    this.classSchedule = {};
    this.timeSlots = [];
    this.lessonIndices = [];
    
    // Statistics
    this.stats = {
      arcConsistencyReductions: 0,
      backtrackingSteps: 0,
      constraintPropagations: 0
    };
  }

  logMessage(msg) {
    this.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  /**
   * MAIN: Gera grade usando CSP
   */
  generate() {
    this._resetState();
    this.logMessage('🧠 Iniciando geração CSP (Constraint Satisfaction Problem)...');
    
    // 1. Inicializar domínios (todos os possíveis slots para cada atividade)
    this._initializeDomains();
    this.logMessage(`📊 Domínios inicializados para ${this.activities.length} atividades.`);
    
    // 2. Arc Consistency (AC-3) - Reduz domínios eliminando impossibilidades
    const preArcConsistency = this._countTotalDomainSize();
    this._arcConsistency();
    const postArcConsistency = this._countTotalDomainSize();
    this.logMessage(`🔗 Arc Consistency: Reduzido de ${preArcConsistency} para ${postArcConsistency} valores possíveis (eliminadas ${preArcConsistency - postArcConsistency} impossibilidades).`);
    
    // 3. Backtracking com MRV e LCV
    this.logMessage(`🔄 Iniciando Backtracking com MRV (Minimum Remaining Values)...`);
    const success = this._backtrackingSearch();
    
    if (success) {
      this.logMessage(`✅ Solução perfeita encontrada! Nenhuma pendência.`);
    } else {
      this.logMessage(`⚠️ Solução parcial. ${this.failures.length} atividades não alocadas.`);
    }
    
    this._logStatistics();
    
    return {
      schedule: this.schedule,
      log: this.log,
      conflicts: [],
      stats: this.stats
    };
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  _resetState() {
    this.schedule = {};
    this.log = [];
    this.failures = [];
    this.bookedEntries = [];
    this.teacherSchedule = {};
    this.classSchedule = {};
    
    // Validar timeSlots
    if (!this.data || !this.data.timeSlots || !Array.isArray(this.data.timeSlots)) {
      this.logMessage('❌ Erro: timeSlots não encontrados ou inválidos.');
      this.timeSlots = [];
      this.lessonIndices = [];
      return;
    }
    
    this.timeSlots = this.data.timeSlots;
    
    // Filtrar apenas slots de aula com validação
    this.lessonIndices = [];
    for (let i = 0; i < this.timeSlots.length; i++) {
      const slot = this.timeSlots[i];
      if (slot && slot.type === 'aula') {
        this.lessonIndices.push(i);
      }
    }
    
    if (this.lessonIndices.length === 0) {
      this.logMessage('⚠️ Aviso: Nenhum slot de aula encontrado.');
    }
  }

  _initializeDomains() {
    this.activities = [...(this.data.activities || [])];
    
    if (!this.activities || this.activities.length === 0) {
      this.logMessage('⚠️ Sem atividades para alocar.');
      return;
    }

    if (!this.lessonIndices || this.lessonIndices.length === 0) {
      this.logMessage('⚠️ Sem slots de aula disponíveis.');
      return;
    }
    
    for (const activity of this.activities) {
      if (!activity || !activity.id) continue;
      
      const domain = new Set();
      
      // Para cada dia e slot, verifique se é estruturalmente viável
      for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
        for (const slotIdx of this.lessonIndices) {
          if (this._isStructurallyViable(activity, dayIdx, slotIdx)) {
            domain.add(`${dayIdx}-${slotIdx}`);
          }
        }
      }
      
      this.domains.set(activity.id, domain);
    }
  }

  _isStructurallyViable(activity, dayIdx, slotIdx) {
    // Validar inputs
    if (!activity || dayIdx < 0 || dayIdx >= 5) return false;
    
    const timeSlot = this.timeSlots[slotIdx];
    if (!timeSlot || !timeSlot.start || !timeSlot.end) return false;
    
    const classData = this.data.classes.find(c => c.id === activity.classId);
    const teacher = this.data.teachers.find(t => t.id === activity.teacherId);
    const subject = this.data.subjects.find(s => s.id === activity.subjectId);

    // 1. Verificar turno
    if (classData && timeSlot) {
      try {
        const slotShift = computeSlotShift(timeSlot.start, timeSlot.end);
        const classShift = classData.shift;
        
        let isShiftCompatible = false;
        if (classShift === 'Integral (Manhã e Tarde)') {
          isShiftCompatible = (slotShift === 'Manhã' || slotShift === 'Tarde' || slotShift === 'Integral (Manhã e Tarde)');
        } else if (classShift === 'Integral (Tarde e Noite)') {
          isShiftCompatible = (slotShift === 'Tarde' || slotShift === 'Noite' || slotShift === 'Integral (Tarde e Noite)');
        } else {
          isShiftCompatible = (slotShift === classShift);
        }
        
        if (!isShiftCompatible) return false;
      } catch (e) {
        // Se computeSlotShift falhar, assume inviável
        return false;
      }

      if (classData.activeSlotsByDay && Array.isArray(classData.activeSlotsByDay[dayIdx])) {
        const slotIdStr = String(timeSlot.id || slotIdx);
        if (!classData.activeSlotsByDay[dayIdx].includes(slotIdStr)) {
          return false;
        }
      }
    }

    // 2. Verificar disponibilidade do professor
    if (teacher && teacher.unavailable) {
      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      if (teacher.unavailable.includes(timeKey)) return false;
    }

    // 3. Verificar disponibilidade da matéria
    if (subject && subject.unavailable) {
      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      if (subject.unavailable.includes(timeKey)) return false;
    }

    // 4. Aulas duplas - checar se há slot seguinte
    const isDouble = activity.doubleLesson || activity.isDoubleLesson;
    if (isDouble) {
      // Encontrar índice de slotIdx em lessonIndices
      const existingIndex = this.lessonIndices.indexOf(slotIdx);
      if (existingIndex < 0 || existingIndex >= this.lessonIndices.length - 1) return false;
      
      const nextSlotIdx = this.lessonIndices[existingIndex + 1];
      if (!nextSlotIdx && nextSlotIdx !== 0) return false;
      if (!this._areConsecutive(slotIdx, nextSlotIdx)) return false;
    }

    return true;
  }

  _areConsecutive(slotIdx1, slotIdx2) {
    return Math.abs(slotIdx1 - slotIdx2) === 1 &&
      this.timeSlots[slotIdx1]?.type === 'aula' &&
      this.timeSlots[slotIdx2]?.type === 'aula';
  }

  // ============================================
  // ARC CONSISTENCY (AC-3)
  // ============================================

  _arcConsistency() {
    // Verificar se há domínios vazios
    for (const [activityId, domain] of this.domains) {
      if (!domain || domain.size === 0) {
        this.logMessage(`⚠️ Domínio vazio para atividade ${activityId}. Impossível resolver.`);
        return;
      }
    }

    let queue = [];
    
    // Iniciar fila com todos os pares de variáveis
    for (const activity of this.activities) {
      for (const otherActivity of this.activities) {
        if (activity.id !== otherActivity.id) {
          queue.push([activity.id, otherActivity.id]);
        }
      }
    }

    while (queue.length > 0) {
      const [xi, xj] = queue.shift();
      
      if (this._revise(xi, xj)) {
        // Se domínio de xi mudou, adicionar vizinhos (exceto xj)
        for (const xk of this.activities) {
          if (xk.id !== xi && xk.id !== xj) {
            queue.push([xk.id, xi]);
          }
        }
        this.stats.arcConsistencyReductions++;
      }
    }
  }

  _revise(xiId, xjId) {
    const domainXi = this.domains.get(xiId);
    const domainXj = this.domains.get(xjId);
    
    // Validar domínios
    if (!domainXi || !domainXj || domainXi.size === 0) {
      return false;
    }

    let revised = false;

    const toRemove = [];
    for (const valueI of domainXi) {
      if (!valueI) continue; // Skip undefined values
      
      let hasSupport = false;
      
      for (const valueJ of domainXj) {
        if (!valueJ) continue; // Skip undefined values
        
        if (!this._conflictExists(valueI, valueJ, xiId, xjId)) {
          hasSupport = true;
          break;
        }
      }
      
      if (!hasSupport) {
        toRemove.push(valueI);
        revised = true;
      }
    }

    toRemove.forEach(v => domainXi.delete(v));
    return revised;
  }

  _conflictExists(valueI, valueJ, xiId, xjId) {
    // Segurança: verificar valores undefined
    if (!valueI || !valueJ) return false;
    
    // Valores no formato "dayIdx-slotIdx"
    const parts1 = valueI.split('-');
    const parts2 = valueJ.split('-');
    if (parts1.length < 2 || parts2.length < 2) return false;
    
    const [dayI, slotI] = parts1.map(Number);
    const [dayJ, slotJ] = parts2.map(Number);

    const activityI = this.activities.find(a => a.id === xiId);
    const activityJ = this.activities.find(a => a.id === xjId);

    // Hard Constraint 1: Professor não pode estar em dois lugares ao mesmo tempo
    if (activityI.teacherId === activityJ.teacherId) {
      if (dayI === dayJ && slotI === slotJ) {
        return true; // CONFLITO
      }
      // Verificar overlap de tempo real
      const timeSlotI = this.timeSlots[slotI];
      const timeSlotJ = this.timeSlots[slotJ];
      if (dayI === dayJ && this._timesOverlap(timeSlotI.start, timeSlotI.end, timeSlotJ.start, timeSlotJ.end)) {
        return true; // CONFLITO
      }
    }

    // Hard Constraint 2: Turma não pode ter duas aulas no mesmo slot
    if (activityI.classId === activityJ.classId) {
      if (dayI === dayJ && slotI === slotJ) {
        return true; // CONFLITO
      }
    }

    return false; // Sem conflito
  }

  _timesOverlap(startA, endA, startB, endB) {
    if (!startA || !endA || !startB || !endB) return false;
    const startAMin = this._minutes(startA);
    const endAMin = this._minutes(endA);
    const startBMin = this._minutes(startB);
    const endBMin = this._minutes(endB);
    
    return startAMin < endBMin && endAMin > startBMin;
  }

  _minutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    const [h, m] = parts.map(Number);
    return h * 60 + m;
  }

  // ============================================
  // BACKTRACKING COM MRV
  // ============================================

  _backtrackingSearch() {
    const unassigned = this.activities.filter(a => !this._isAssigned(a.id));
    
    if (unassigned.length === 0) {
      return true; // Todas as atividades alocadas com sucesso
    }

    // MRV: Escolher atividade com menor domínio
    const variable = this._selectUnassignedVariable(unassigned);
    
    if (!variable) {
      return false; // Falha
    }

    // Obter valores ordenados por LCV
    const orderedValues = this._orderDomainValues(variable.id);

    for (const value of orderedValues) {
      this.stats.backtrackingSteps++;

      if (this._isConsistent(variable, value)) {
        // Fazer assignment
        this._assignValue(variable, value);
        
        // Constraint propagation
        const newDomains = this._constraintPropagation();
        
        if (this._backtrackingSearch()) {
          return true; // Sucesso
        }
        
        // Backtrack
        this._unassignValue(variable);
        this._restoreDomains(newDomains);
      }
    }

    // Nenhum valor funcionou
    this.failures.push(variable);
    return false;
  }

  _selectUnassignedVariable(unassigned) {
    // MRV: Selecionar variável com menor domínio
    let minSize = Infinity;
    let selected = null;

    for (const activity of unassigned) {
      const domainSize = this.domains.get(activity.id).size;
      if (domainSize === 0) {
        // Domínio vazio = falha imediata
        return null;
      }
      if (domainSize < minSize) {
        minSize = domainSize;
        selected = activity;
      }
    }

    return selected;
  }

  _orderDomainValues(activityId) {
    // LCV: Least Constraining Value
    // Ordenar valores que deixam mais opções para variáveis vizinhas
    const domain = this.domains.get(activityId);
    const activity = this.activities.find(a => a.id === activityId);

    if (!domain || domain.size === 0) return [];

    const valued = [];
    for (const value of domain) {
      // Segurança: verificar valor
      if (!value) continue;
      
      // Simular assignment
      let constraintCount = 0;
      const parts = value.split('-');
      if (parts.length < 2) continue;
      const [dayIdx, slotIdx] = parts.map(Number);

      // Contar quantas outras atividades são afetadas
      for (const otherActivity of this.activities) {
        if (otherActivity.id === activityId) continue;
        
        const otherDomain = this.domains.get(otherActivity.id);
        let affectedCount = 0;

        for (const otherValue of otherDomain) {
          if (this._conflictExists(value, otherValue, activityId, otherActivity.id)) {
            affectedCount++;
          }
        }

        constraintCount += affectedCount;
      }

      valued.push({ value, constraintCount });
    }

    // Ordenar por LCV (menos constrains = melhor)
    valued.sort((a, b) => a.constraintCount - b.constraintCount);
    return valued.map(v => v.value);
  }

  _isConsistent(activity, value) {
    // Verificar se este assignment é consistente com assignments já feitos
    if (!value || !activity) return false;
    const parts = value.split('-');
    if (parts.length < 2) return false;
    const [dayIdx, slotIdx] = parts.map(Number);
    const timeSlot = this.timeSlots[slotIdx];
    if (!timeSlot) return false;

    // Checar conflitos com aulas já alocadas
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
    
    // Professor já tem aula?
    if (this.teacherSchedule[activity.teacherId]?.[timeKey]) {
      return false;
    }

    // Turma já tem aula?
    if (this.classSchedule[activity.classId]?.[timeKey]) {
      return false;
    }

    // Para aulas duplas, verificar segundo slot
    const isDouble = activity.doubleLesson || activity.isDoubleLesson;
    if (isDouble) {
      const nextSlotIdx = this.lessonIndices[this.lessonIndices.indexOf(slotIdx) + 1];
      if (nextSlotIdx === undefined) return false;
      
      const nextTimeKey = `${DAYS[dayIdx]}-${nextSlotIdx}`;
      if (this.teacherSchedule[activity.teacherId]?.[nextTimeKey]) return false;
      if (this.classSchedule[activity.classId]?.[nextTimeKey]) return false;
    }

    return true;
  }

  _isAssigned(activityId) {
    return this.schedule[activityId] !== undefined;
  }

  _assignValue(activity, value) {
    if (!value || !activity) return;
    const isDouble = activity.doubleLesson || activity.isDoubleLesson;
    const parts = value.split('-');
    if (parts.length < 2) return;
    const [dayIdx, slotIdx] = parts.map(Number);
    const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

    this.schedule[activity.id] = {
      activityId: activity.id,
      classId: activity.classId,
      subjectId: activity.subjectId,
      teacherId: activity.teacherId,
      dayIdx,
      slotIdx,
      timeKey,
      start: this.timeSlots[slotIdx].start,
      end: isDouble ? this.timeSlots[this.lessonIndices[this.lessonIndices.indexOf(slotIdx) + 1]].end : this.timeSlots[slotIdx].end,
      isDoubleLesson: isDouble,
      isSynchronous: activity.isSynchronous || false,
      isGranularSync: activity.isGranularSync || false,
      isFixed: activity.isFixed || false,
      locked: activity.locked || false,
    };

    // Mark occupancy
    if (!this.teacherSchedule[activity.teacherId]) {
      this.teacherSchedule[activity.teacherId] = {};
    }
    this.teacherSchedule[activity.teacherId][timeKey] = true;

    if (!this.classSchedule[activity.classId]) {
      this.classSchedule[activity.classId] = {};
    }
    this.classSchedule[activity.classId][timeKey] = true;

    // Para aulas duplas
    if (isDouble) {
      const nextSlotIdx = this.lessonIndices[this.lessonIndices.indexOf(slotIdx) + 1];
      const nextTimeKey = `${DAYS[dayIdx]}-${nextSlotIdx}`;
      this.teacherSchedule[activity.teacherId][nextTimeKey] = true;
      this.classSchedule[activity.classId][nextTimeKey] = true;
    }

    this.bookedEntries.push({
      classId: activity.classId,
      subjectId: activity.subjectId,
      teacherId: activity.teacherId,
      dayIdx,
      slotIdx,
      timeKey
    });
  }

  _unassignValue(activity) {
    const value = this.schedule[activity.id];
    if (!value) return;
    const isDouble = activity.doubleLesson || activity.isDoubleLesson;

    const { dayIdx, slotIdx, timeKey } = value;

    delete this.schedule[activity.id];
    this.teacherSchedule[activity.teacherId][timeKey] = false;
    this.classSchedule[activity.classId][timeKey] = false;

    if (isDouble) {
      const nextSlotIdx = this.lessonIndices[this.lessonIndices.indexOf(slotIdx) + 1];
      const nextTimeKey = `${DAYS[dayIdx]}-${nextSlotIdx}`;
      this.teacherSchedule[activity.teacherId][nextTimeKey] = false;
      this.classSchedule[activity.classId][nextTimeKey] = false;
    }

    this.bookedEntries = this.bookedEntries.filter(e => 
      !(e.classId === activity.classId && e.dayIdx === dayIdx && e.slotIdx === slotIdx)
    );
  }

  _constraintPropagation() {
    // Salvar estado atual dos domínios
    const savedDomains = new Map();
    for (const [key, domain] of this.domains) {
      savedDomains.set(key, new Set(domain));
    }

    // Remover valores já alocados dos domínios de outras atividades
    for (const activity of this.activities) {
      if (this._isAssigned(activity.id)) {
        const value = this.schedule[activity.id];
        const assignedValue = `${value.dayIdx}-${value.slotIdx}`;

        for (const otherActivity of this.activities) {
          if (otherActivity.id !== activity.id) {
            const domain = this.domains.get(otherActivity.id);
            for (const val of domain) {
              if (this._conflictExists(assignedValue, val, activity.id, otherActivity.id)) {
                domain.delete(val);
              }
            }
          }
        }
      }
    }

    this.stats.constraintPropagations++;
    return savedDomains;
  }

  _restoreDomains(savedDomains) {
    for (const [key, domain] of savedDomains) {
      this.domains.set(key, new Set(domain));
    }
  }

  // ============================================
  // UTILIDADES
  // ============================================

  _countTotalDomainSize() {
    let total = 0;
    for (const domain of this.domains.values()) {
      total += domain.size;
    }
    return total;
  }

  _logStatistics() {
    this.logMessage('');
    this.logMessage('📈 Estatísticas do CSP:');
    this.logMessage(`   • Arc Consistency Reductions: ${this.stats.arcConsistencyReductions}`);
    this.logMessage(`   • Backtracking Steps: ${this.stats.backtrackingSteps}`);
    this.logMessage(`   • Constraint Propagations: ${this.stats.constraintPropagations}`);
    this.logMessage(`   • Aulas Alocadas: ${Object.keys(this.schedule).length}`);
    this.logMessage(`   • Pendências: ${this.failures.length}`);
  }
}

export default CSPScheduleManager;
