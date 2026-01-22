/**
 * SynchronousConfigService
 * Gerencia configurações granulares de aulas síncronas
 * 
 * Permite que uma aula síncrona tenha múltiplas configurações:
 * Exemplo: OE Matemática
 *   - Config 1: 1ª e 2ª aula de quarta → Turmas 6A, 6B, 6C, 6D
 *   - Config 2: 3ª e 4ª aula de quarta → Turmas 9A, 9B
 *   - Config 3: 5ª aula de sexta → Turmas 8A, 8B
 * 
 * Nova estrutura de dados:
 * subject.isSynchronous = true
 * subject.synchronousConfigs = [
 *   {
 *     id: "config-1",
 *     name: "6º e 7º anos - 1ª/2ª aula",
 *     classes: ["classId1", "classId2", "classId3", "classId4"],
 *     days: ["Quarta"],
 *     timeSlots: ["Quarta-0", "Quarta-1"], // índices de slots
 *     isActive: true
 *   },
 *   {
 *     id: "config-2",
 *     name: "9º anos - 3ª/4ª aula",
 *     classes: ["classId5", "classId6"],
 *     days: ["Quarta"],
 *     timeSlots: ["Quarta-2", "Quarta-3"],
 *     isActive: true
 *   }
 * ]
 */

import { uid, DAYS } from '../utils';

export class SynchronousConfigService {
  /**
   * Cria uma configuração vazia para uma aula síncrona
   */
  static createEmptyConfig(name = 'Nova Configuração') {
    return {
      id: uid(),
      name,
      classes: [],
      days: [],
      timeSlots: [],
      isActive: true
    };
  }

  /**
   * Copia uma configuração existente
   */
  static duplicateConfig(config) {
    return {
      ...config,
      id: uid(),
      name: `${config.name} (cópia)`
    };
  }

  /**
   * Valida uma configuração
   * Retorna: { isValid: boolean, errors: string[] }
   */
  static validateConfig(config, data) {
    const errors = [];

    if (!config.name || config.name.trim() === '') {
      errors.push('Nome da configuração é obrigatório');
    }

    if (!config.classes || config.classes.length === 0) {
      errors.push('Selecione pelo menos uma turma');
    }

    if (!config.days || config.days.length === 0) {
      errors.push('Selecione pelo menos um dia da semana');
    }

    if (!config.timeSlots || config.timeSlots.length === 0) {
      errors.push('Selecione pelo menos um horário de aula');
    }

    // Valida que as turmas existem
    const validClassIds = new Set(data.classes.map(c => c.id));
    for (const classId of config.classes) {
      if (!validClassIds.has(classId)) {
        errors.push(`Turma ID ${classId} não existe`);
      }
    }

    // Valida que os dias existem
    for (const day of config.days) {
      if (!DAYS.includes(day)) {
        errors.push(`Dia "${day}" inválido`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Obtém todas as configurações de uma matéria síncrona
   */
  static getSubjectConfigs(subject) {
    if (!subject.isSynchronous) {
      return [];
    }
    return subject.synchronousConfigs || [];
  }

  /**
   * Obtém apenas as configurações ativas
   */
  static getActiveConfigs(subject) {
    return this.getSubjectConfigs(subject).filter(c => c.isActive);
  }

  /**
   * Adiciona uma nova configuração a uma matéria
   */
  static addConfig(subject, config) {
    if (!subject.isSynchronous) {
      throw new Error('Matéria não é síncrona');
    }

    if (!subject.synchronousConfigs) {
      subject.synchronousConfigs = [];
    }

    subject.synchronousConfigs.push(config);
    return subject;
  }

  /**
   * Atualiza uma configuração existente
   */
  static updateConfig(subject, configId, updates) {
    const configs = this.getSubjectConfigs(subject);
    const index = configs.findIndex(c => c.id === configId);

    if (index === -1) {
      throw new Error(`Configuração ${configId} não encontrada`);
    }

    configs[index] = {
      ...configs[index],
      ...updates,
      id: configs[index].id // Preserva o ID
    };

    return subject;
  }

  /**
   * Remove uma configuração
   */
  static removeConfig(subject, configId) {
    if (!subject.synchronousConfigs) {
      return subject;
    }

    subject.synchronousConfigs = subject.synchronousConfigs.filter(c => c.id !== configId);
    return subject;
  }

  /**
   * Togla ativação de uma configuração
   */
  static toggleConfigActive(subject, configId) {
    const configs = this.getSubjectConfigs(subject);
    const config = configs.find(c => c.id === configId);

    if (!config) {
      throw new Error(`Configuração ${configId} não encontrada`);
    }

    config.isActive = !config.isActive;
    return subject;
  }

  /**
   * Gera lista legível de uma configuração
   * Ex: "Quarta (1ª, 2ª aula) - Turmas 6A, 6B, 6C, 6D"
   */
  static configToReadable(config, data) {
    const daysStr = config.days.join(', ');
    const slotLabels = config.timeSlots.map(slotKey => {
      const [day, slotIdx] = slotKey.split('-');
      const slot = data.timeSlots[parseInt(slotIdx)];
      return slot ? `${slot.start}-${slot.end}` : slotKey;
    }).join(', ');

    const classNames = config.classes
      .map(classId => data.classes.find(c => c.id === classId)?.name || classId)
      .join(', ');

    return `${daysStr} (${slotLabels}) - ${classNames}`;
  }

  /**
   * Retorna sumário das configurações
   * Para exibir na lista de matérias
   */
  static getConfigsSummary(subject, data) {
    const configs = this.getActiveConfigs(subject);

    if (configs.length === 0) {
      return 'Nenhuma configuração ativa';
    }

    if (configs.length === 1) {
      return this.configToReadable(configs[0], data);
    }

    return `${configs.length} configurações`;
  }

  /**
   * Exporta configurações para JSON
   */
  static exportConfigs(subject) {
    return JSON.stringify(subject.synchronousConfigs || [], null, 2);
  }

  /**
   * Importa configurações de JSON
   */
  static importConfigs(subject, jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      if (!Array.isArray(imported)) {
        throw new Error('JSON deve ser um array');
      }

      subject.synchronousConfigs = imported;
      return { success: true, message: `${imported.length} configuração(ões) importada(s)` };
    } catch (error) {
      return { success: false, message: `Erro ao importar: ${error.message}` };
    }
  }
}

export default SynchronousConfigService;
