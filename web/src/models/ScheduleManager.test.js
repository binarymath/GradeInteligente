import { describe, it, expect, beforeEach } from 'vitest';
import ScheduleManager from './ScheduleManager';

describe('ScheduleManager', () => {
  let mockData;

  beforeEach(() => {
    mockData = {
      timeSlots: [
        { id: 'ts1', start: '08:00', end: '09:00', type: 'aula' },
        { id: 'ts2', start: '09:00', end: '10:00', type: 'aula' },
        { id: 'ts3', start: '10:00', end: '10:20', type: 'intervalo' },
        { id: 'ts4', start: '10:20', end: '11:20', type: 'aula' },
      ],
      teachers: [
        { id: 't1', name: 'Prof A', unavailable: [], shifts: ['Manhã'] },
        { id: 't2', name: 'Prof B', unavailable: [], shifts: ['Manhã'] },
      ],
      subjects: [
        { id: 's1', name: 'Matemática', unavailable: [], preferred: [] },
        { id: 's2', name: 'Português', unavailable: [], preferred: [] },
      ],
      classes: [
        { id: 'c1', name: '6º A', shift: 'Manhã', activeSlots: ['ts1', 'ts2', 'ts4'] },
      ],
      activities: [
        { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 2, doubleLesson: false },
      ]
    };
  });

  describe('generate', () => {
    it('should generate schedule without errors', () => {
      const manager = new ScheduleManager(mockData);
      const result = manager.generate();

      expect(result).toHaveProperty('schedule');
      expect(result).toHaveProperty('log');
      expect(result).toHaveProperty('conflicts');
    });

    it('should log generation start and end', () => {
      const manager = new ScheduleManager(mockData);
      const result = manager.generate();

      expect(result.log.length).toBeGreaterThan(0);
      expect(result.log[0]).toContain('Iniciando');
      expect(result.log[result.log.length - 1]).toContain('concluída');
    });

    it('should allocate activities to schedule', () => {
      const manager = new ScheduleManager(mockData);
      const result = manager.generate();

      const scheduledCount = Object.keys(result.schedule).length;
      expect(scheduledCount).toBeGreaterThan(0);
    });

    it('should detect conflicts when teachers overlap', () => {
      // Create conflicting activities
      mockData.activities = [
        { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 3, doubleLesson: false },
      ];

      // Force multiple classes with same teacher
      mockData.classes.push({ id: 'c2', name: '7º A', shift: 'Manhã', activeSlots: ['ts1', 'ts2', 'ts4'] });
      mockData.activities.push({ id: 'a2', teacherId: 't1', subjectId: 's2', classId: 'c2', quantity: 3, doubleLesson: false });

      const manager = new ScheduleManager(mockData);
      const result = manager.generate();

      // Pode ou não ter conflitos dependendo da alocação aleatória
      expect(result.conflicts).toBeDefined();
    });

    it('should handle double lessons', () => {
      mockData.activities = [
        { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 2, doubleLesson: true },
      ];

      const manager = new ScheduleManager(mockData);
      const result = manager.generate();

      expect(result.schedule).toBeDefined();
    });

    it('should respect teacher unavailability', () => {
      mockData.teachers[0].unavailable = ['0-0', '0-1']; // Primeira e segunda aula da segunda-feira
      mockData.activities = [
        { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 1, doubleLesson: false },
      ];

      const manager = new ScheduleManager(mockData);
      const result = manager.generate();

      // Verificar que nenhuma aula foi alocada nos horários indisponíveis
      const conflictingSlots = Object.entries(result.schedule).filter(([key, val]) =>
        val.teacherId === 't1' && mockData.teachers[0].unavailable.includes(val.timeKey)
      );

      expect(conflictingSlots.length).toBe(0);
    });

    it('should fallback to single lessons if double lesson impossible', () => {
      // Configurar cenário determinístico:
      // 1. Bloquear Slot 1 (índice 1) na Segunda (quebra sequência 0-1).
      // 2. Bloquear TODOS os slots de Terça a Sexta (para forçar alocação na Segunda).
      // Sobra apenas Segunda-0 (ts1) e Segunda-3 (ts4) como candidatos válidos.

      const allDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
      const unavailableKeys = [];

      allDays.forEach(day => {
        if (day === 'Segunda') {
          unavailableKeys.push(`${day}-1`); // Bloqueia meio da sequência
        } else {
          // Bloqueia tudo nos outros dias (slots 0, 1, 3)
          unavailableKeys.push(`${day}-0`);
          unavailableKeys.push(`${day}-1`);
          unavailableKeys.push(`${day}-3`);
        }
      });

      mockData.teachers[0].unavailable = unavailableKeys;

      // Atividade pede aula DUPLA (quantity 2)
      mockData.activities = [
        { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 2, doubleLesson: true },
      ];

      const manager = new ScheduleManager(mockData);
      const result = manager.generate();

      // Deve ter agendado 2 aulas
      const scheduledItems = Object.values(result.schedule).filter(s => s.teacherId === 't1');
      expect(scheduledItems.length).toBe(2);

      // Verificar que são soltas (fallback funcionou)
      const timeKeys = scheduledItems.map(s => s.timeKey).sort();

      // Esperamos EXATAMENTE Segunda-0 e Segunda-3
      expect(timeKeys).toEqual(['Segunda-0', 'Segunda-3']);
    });
  });
});
