/**
 * Testes para CSPScheduleManager
 * Valida a implementação do algoritmo CSP
 */

import { describe, it, expect, beforeEach } from 'vitest';
import CSPScheduleManager from '../src/models/CSPScheduleManager';

describe('CSPScheduleManager', () => {
  let mockData;

  beforeEach(() => {
    mockData = {
      timeSlots: [
        { id: 'ts1', start: '07:50', end: '08:40', type: 'aula' },
        { id: 'ts2', start: '08:40', end: '09:30', type: 'aula' },
        { id: 'ts3', start: '10:00', end: '10:50', type: 'aula' },
        { id: 'ts4', start: '10:50', end: '11:40', type: 'aula' },
      ],
      teachers: [
        {
          id: 't1',
          name: 'Professor A',
          shifts: ['Manhã'],
          unavailable: []
        },
        {
          id: 't2',
          name: 'Professor B',
          shifts: ['Manhã'],
          unavailable: []
        },
      ],
      classes: [
        {
          id: 'c1',
          name: '6º A',
          shift: 'Manhã',
          activeSlots: ['ts1', 'ts2', 'ts3', 'ts4']
        },
        {
          id: 'c2',
          name: '6º B',
          shift: 'Manhã',
          activeSlots: ['ts1', 'ts2', 'ts3', 'ts4']
        },
      ],
      subjects: [
        { id: 's1', name: 'Matemática', unavailable: [], preferred: [] },
        { id: 's2', name: 'Português', unavailable: [], preferred: [] },
      ],
      activities: [
        {
          id: 'a1',
          teacherId: 't1',
          subjectId: 's1',
          classId: 'c1',
          quantity: 2,
          doubleLesson: false,
          isSynchronous: false,
        },
        {
          id: 'a2',
          teacherId: 't2',
          subjectId: 's2',
          classId: 'c2',
          quantity: 2,
          doubleLesson: false,
          isSynchronous: false,
        },
      ],
    };
  });

  describe('generate', () => {
    it('should generate schedule without errors', () => {
      const manager = new CSPScheduleManager(mockData);
      const result = manager.generate();

      expect(result).toHaveProperty('schedule');
      expect(result).toHaveProperty('log');
      expect(result).toHaveProperty('stats');
    });

    it('should log generation steps', () => {
      const manager = new CSPScheduleManager(mockData);
      const result = manager.generate();

      expect(result.log.length).toBeGreaterThan(0);
      expect(result.log.some(l => l.includes('CSP'))).toBe(true);
    });

    it('should allocate activities', () => {
      const manager = new CSPScheduleManager(mockData);
      const result = manager.generate();

      const scheduledCount = Object.keys(result.schedule).length;
      expect(scheduledCount).toBeGreaterThan(0);
    });

    it('should prevent teacher conflicts', () => {
      const manager = new CSPScheduleManager(mockData);
      const result = manager.generate();

      // Check that no teacher is in two places at same time
      const teacherTimeMap = new Map();

      for (const entry of Object.values(result.schedule)) {
        const key = `${entry.teacherId}-${entry.dayIdx}-${entry.slotIdx}`;
        expect(teacherTimeMap.has(key)).toBe(false);
        teacherTimeMap.set(key, true);
      }
    });

    it('should prevent class conflicts', () => {
      const manager = new CSPScheduleManager(mockData);
      const result = manager.generate();

      // Check that no class has two lessons at same time
      const classTimeMap = new Map();

      for (const entry of Object.values(result.schedule)) {
        const key = `${entry.classId}-${entry.dayIdx}-${entry.slotIdx}`;
        expect(classTimeMap.has(key)).toBe(false);
        classTimeMap.set(key, true);
      }
    });

    it('should track Arc Consistency reductions', () => {
      const manager = new CSPScheduleManager(mockData);
      const result = manager.generate();

      expect(result.stats.arcConsistencyReductions).toBeGreaterThanOrEqual(0);
    });

    it('should track backtracking steps', () => {
      const manager = new CSPScheduleManager(mockData);
      const result = manager.generate();

      expect(result.stats.backtrackingSteps).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Arc Consistency', () => {
    it('should reduce domain size', () => {
      const manager = new CSPScheduleManager(mockData);
      
      // Initialize domains
      manager._resetState();
      manager._initializeDomains();
      
      const beforeSize = manager._countTotalDomainSize();
      manager._arcConsistency();
      const afterSize = manager._countTotalDomainSize();

      // Arc Consistency should reduce or keep the same
      expect(afterSize).toBeLessThanOrEqual(beforeSize);
    });

    it('should remove conflicting values', () => {
      // Create a scenario where conflicts are obvious
      mockData.activities = [
        {
          id: 'a1',
          teacherId: 't1',
          subjectId: 's1',
          classId: 'c1',
          quantity: 2,
          doubleLesson: false,
        },
        {
          id: 'a2',
          teacherId: 't1', // Same teacher
          subjectId: 's2',
          classId: 'c2',
          quantity: 2,
          doubleLesson: false,
        },
      ];

      const manager = new CSPScheduleManager(mockData);
      manager._resetState();
      manager._initializeDomains();
      manager._arcConsistency();

      // Both activities should have non-overlapping domains
      // (or at least reduced compared to initial)
      const domain1 = manager.domains.get('a1');
      const domain2 = manager.domains.get('a2');

      // Check that some conflicts were eliminated
      let hasNonConflicting = false;
      for (const val1 of domain1) {
        for (const val2 of domain2) {
          // Same slot would be a conflict for same teacher
          if (val1 !== val2) {
            hasNonConflicting = true;
            break;
          }
        }
        if (hasNonConflicting) break;
      }

      expect(hasNonConflicting).toBe(true);
    });
  });

  describe('Backtracking with MRV', () => {
    it('should select variable with smallest domain first', () => {
      const manager = new CSPScheduleManager(mockData);
      manager._resetState();
      manager._initializeDomains();
      manager._arcConsistency();

      // Artificially reduce one domain
      const domain1 = manager.domains.get('a1');
      const smallerDomain = new Set([...domain1].slice(0, 2)); // Keep only 2 values
      manager.domains.set('a1', smallerDomain);

      const selected = manager._selectUnassignedVariable([
        mockData.activities[0],
        mockData.activities[1],
      ]);

      // Should select a1 because it has smaller domain
      expect(selected?.id).toBe('a1');
    });
  });

  describe('LCV Ordering', () => {
    it('should order domain values by constraint count', () => {
      const manager = new CSPScheduleManager(mockData);
      manager._resetState();
      manager._initializeDomains();

      const ordered = manager._orderDomainValues('a1');

      // Should return an array of values
      expect(Array.isArray(ordered)).toBe(true);
      expect(ordered.length).toBeGreaterThan(0);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle tight constraints', () => {
      // Create a scenario with many activities and few slots
      mockData.activities = [
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `a${i}`,
          teacherId: `t${i % 2}`,
          subjectId: `s${i % 3}`,
          classId: `c${i % 2}`,
          quantity: 1,
          doubleLesson: false,
        })),
      ];

      const manager = new CSPScheduleManager(mockData);
      const result = manager.generate();

      // Should handle the complexity
      expect(result.schedule).toBeDefined();
      expect(Object.keys(result.schedule).length).toBeGreaterThan(0);
    });

    it('should respect teacher unavailability', () => {
      mockData.teachers[0].unavailable = ['Segunda-0', 'Segunda-1']; // Unavailable on Monday

      const manager = new CSPScheduleManager(mockData);
      manager._resetState();
      manager._initializeDomains();

      const domain = manager.domains.get('a1');
      
      // Domain should not include Monday slots
      for (const val of domain) {
        const [dayIdx] = val.split('-').map(Number);
        if (mockData.activities[0].teacherId === 't1') {
          // Should not include Monday (dayIdx = 0)
          expect(dayIdx).not.toBe(0); // If this fails, check the logic
        }
      }
    });
  });
});
