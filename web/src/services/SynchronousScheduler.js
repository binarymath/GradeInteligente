/**
 * SynchronousScheduler - Gerencia alocação de matérias síncronas
 * 
 * NOVO (v2.0): Suporta aulas síncronas com configurações granulares
 * - Matérias com synchronousConfigs: Usa nova lógica (Fase 1)
 * - Matérias sem synchronousConfigs: Usa lógica legada (Fase 2)
 * 
 * Ex Legado: OE Matemática → todas as turmas ao mesmo tempo
 * Ex Novo: OE Matemática → Config 1 (6º anos) + Config 2 (9º anos)
 */

import { DAYS } from '../utils';

class SynchronousScheduler {
  constructor(data, schedule) {
    this.data = data;
    this.schedule = schedule;
    this.log = [];
    this.processedActivities = new Set(); // Rastreia atividades já alocadas por configs
  }

  /**
   * Processa todas as aulas síncronas (APENAS configurações granulares v2.0)
   * Retorna: { success: boolean, schedule: object, log: string[] }
   */
  processAllGroups() {
    // Fase Única: Processa aulas com configurações granulares (NOVO v2.0)
    this.processAllConfigurations();

    const hasErrors = this.log.filter(l => l.includes('❌')).length > 0;

    return {
      success: !hasErrors,
      schedule: this.schedule,
      log: this.log
    };
  }

  /**
   * FASE 1: Processa aulas síncronas com configurações granulares (NOVO)
   */
  processAllConfigurations() {
    const subjectsWithConfigs = this.data.subjects.filter(
      s => s.isSynchronous && s.synchronousConfigs && s.synchronousConfigs.length > 0
    );

    if (subjectsWithConfigs.length === 0) {
      console.log('⚠️ Nenhuma matéria síncrona com configs granulares encontrada');
      return;
    }

    console.log(`📚 Processando ${subjectsWithConfigs.length} matéria(s) com configs:`, subjectsWithConfigs.map(s => ({ name: s.name, configs: s.synchronousConfigs?.length })));

    this.log.push(`\n🎯 FASE 1: Processando ${subjectsWithConfigs.length} matéria(s) síncrona(s) com configurações granulares...`);

    for (const subject of subjectsWithConfigs) {
      try {
        this.log.push(`\n   📚 ${subject.name}`);

        const activeConfigs = (subject.synchronousConfigs || []).filter(c => c.isActive);
        
        if (activeConfigs.length === 0) {
          this.log.push(`      ⚠️ Nenhuma configuração ativa`);
          continue;
        }

        this.log.push(`      📋 ${activeConfigs.length} configuração(ões) ativa(s):`);

        for (const config of activeConfigs) {
          this.processConfiguration(subject, config);
        }
      } catch (error) {
        this.log.push(`      ❌ Erro: ${error.message}`);
      }
    }
  }

  /**
   * Processa uma única configuração de aula síncrona
   */
  processConfiguration(subject, config) {
    this.log.push(`\n         🔧 Configuração: ${config.name}`);
    const classNames = config.classes.map(id => {
      const cls = this.data.classes.find(c => c.id === id);
      return cls?.name || id;
    }).join(', ');
    this.log.push(`            Turmas: ${classNames}`);
    this.log.push(`            Dias/Horários: ${config.days.join(', ')} - ${config.timeSlots.length} slot(s)`);

    // Filtra atividades apenas das turmas especificadas
    const configActivities = this.data.activities.filter(activity => {
      const sameSubject = activity.subjectId === subject.id;
      const classInConfig = config.classes.includes(activity.classId);
      const notYetProcessed = !this.processedActivities.has(`${activity.classId}-${activity.subjectId}`);
      return sameSubject && classInConfig && notYetProcessed;
    });

    if (configActivities.length === 0) {
      this.log.push(`            ⚠️ Nenhuma atividade encontrada para estas turmas`);
      return;
    }

    this.log.push(`            📌 ${configActivities.length} atividade(s) para alocar`);

    // Tenta encontrar slot nos horários específicos
    const bestSlot = this.findBestSlotInConfig(configActivities, config);

    if (!bestSlot) {
      this.log.push(`            ❌ Falha: Nenhum horário disponível`);
      return;
    }

    // Aloca no slot encontrado
    const allocated = this.allocateConfigActivities(configActivities, bestSlot);
    
    if (!allocated) {
      this.log.push(`            ❌ Falha: Conflito de professor detectado`);
      return;
    }
    
    const slotLabel = this.getSlotLabel(bestSlot);
    this.log.push(`            ✅ Alocado: ${slotLabel}`);

    // Marca como processadas
    for (const activity of configActivities) {
      this.processedActivities.add(`${activity.classId}-${activity.subjectId}`);
    }
  }

  /**
   * Encontra melhor slot dentro das restrições de uma configuração
   */
  findBestSlotInConfig(activities, config) {
    // Valida se config tem slots específicos
    if (!config.timeSlots || config.timeSlots.length === 0) {
      return null;
    }

    // Tenta cada slot especificado na config
    for (const slotKey of config.timeSlots) {
      if (this.isSlotAvailableForAllActivities(activities, slotKey)) {
        return slotKey;
      }
    }

    return null;
  }

  /**
   * Aloca todas as atividades de uma configuração em um slot específico
   */
  allocateConfigActivities(activities, timeSlotKey) {
    const [day, slotIndexStr] = timeSlotKey.split('-');
    const slotIndex = parseInt(slotIndexStr);

    // VALIDAÇÃO: Verifica se algum professor já está alocado neste horário
    const teachersInSlot = new Map(); // teacherId -> classId
    
    // Primeiro, verifica o schedule existente
    for (const [schedKey, entry] of Object.entries(this.schedule)) {
      if (entry.timeKey === timeSlotKey && entry.teacherId) {
        if (!teachersInSlot.has(entry.teacherId)) {
          teachersInSlot.set(entry.teacherId, []);
        }
        teachersInSlot.get(entry.teacherId).push(entry.classId);
      }
    }
    
    // Verifica se alguma atividade tem professor já ocupado
    for (const activity of activities) {
      if (activity.teacherId && teachersInSlot.has(activity.teacherId)) {
        const existingClasses = teachersInSlot.get(activity.teacherId);
        const teacher = this.data.teachers?.find(t => t.id === activity.teacherId);
        const teacherName = teacher?.name || activity.teacherId;
        
        this.log.push(`            ⚠️ CONFLITO DETECTADO: Professor ${teacherName} já está`);
        this.log.push(`               ocupado neste horário em outra(s) turma(s)`);
        return false; // Não aloca se há conflito
      }
      
      // Adiciona ao mapa para verificar conflitos internos
      if (!teachersInSlot.has(activity.teacherId)) {
        teachersInSlot.set(activity.teacherId, []);
      }
      teachersInSlot.get(activity.teacherId).push(activity.classId);
    }
    
    // Se passou na validação, aloca
    for (const activity of activities) {
      const key = `${activity.classId}-${day}-${slotIndex}`;
      this.schedule[key] = {
        subjectId: activity.subjectId,
        teacherId: activity.teacherId,
        classId: activity.classId,
        timeKey: timeSlotKey,
        isSynchronous: true,
        isGranularSync: true // Marca como sincronizada granularmente (v2.0)
      };
    }
    
    return true;
  }



  /**
   * Verifica se um slot está disponível para TODAS as atividades
   */
  isSlotAvailableForAllActivities(activities, timeSlotKey) {
    for (const activity of activities) {
      if (!this.isSlotAvailableForActivity(activity, timeSlotKey)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Verifica se um slot está disponível para UMA atividade
   */
  isSlotAvailableForActivity(activity, timeSlotKey) {
    const [day, slotIndexStr] = timeSlotKey.split('-');
    const slotIndex = parseInt(slotIndexStr);
    
    // 1. Verifica se está nos activeSlots da turma
    const classData = this.data.classes.find(c => c.id === activity.classId);
    if (!classData) return false;
    
    const timeSlot = this.getTimeSlotByIndex(slotIndex);
    if (!timeSlot || timeSlot.type !== 'aula') return false;
    
    if (classData.activeSlots && !classData.activeSlots.includes(timeSlot.id)) {
      return false;
    }

    // 2. Verifica se turma já tem algo alocado neste horário
    const key = `${activity.classId}-${day}-${slotIndex}`;
    if (this.schedule[key]) return false;

    // 3. Verifica se professor está disponível
    const teacherId = activity.teacherId;
    if (!teacherId) return false;

    const teacher = this.data.teachers.find(t => t.id === teacherId);
    if (!teacher) return false;

    // Verifica conflito de professor neste horário
    for (const [scheduleKey, entry] of Object.entries(this.schedule)) {
      if (entry.teacherId === teacherId) {
        const [, entryDay, entrySlotStr] = scheduleKey.split('-');
        const entrySlotIndex = parseInt(entrySlotStr);
        
        if (entryDay === day && entrySlotIndex === slotIndex) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Retorna todos os slots de aula (tipo 'aula')
   */
  getAllLessonSlots() {
    const slots = [];
    
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      const day = DAYS[dayIdx];
      
      for (let slotIdx = 0; slotIdx < this.data.timeSlots.length; slotIdx++) {
        const timeSlot = this.data.timeSlots[slotIdx];
        
        if (timeSlot.type === 'aula') {
          slots.push(`${day}-${slotIdx}`);
        }
      }
    }

    return slots;
  }

  /**
   * Retorna timeSlot pelo índice
   */
  getTimeSlotByIndex(index) {
    return this.data.timeSlots[index];
  }

  /**
   * Retorna label legível de um slot
   */
  getSlotLabel(timeSlotKey) {
    const [day, slotIndexStr] = timeSlotKey.split('-');
    const slotIndex = parseInt(slotIndexStr);
    const timeSlot = this.getTimeSlotByIndex(slotIndex);
    
    if (timeSlot) {
      return `${day} ${timeSlot.start}-${timeSlot.end}`;
    }
    
    return timeSlotKey;
  }

  /**
   * Retorna o log de processamento
   */
  getLog() {
    return this.log;
  }
}

export default SynchronousScheduler;
