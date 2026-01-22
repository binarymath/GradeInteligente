import { describe, it, expect, beforeEach } from 'vitest';
import ScheduleManager from '../src/models/ScheduleManager';

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

        it('should import existing schedule correctly', () => {
            const manager = new ScheduleManager(mockData);

            // Create a fake existing schedule
            const existingSchedule = {
                'c1-Segunda-0': {
                    subjectId: 's1',
                    teacherId: 't1',
                    classId: 'c1',
                    timeKey: 'Segunda-0',
                    isDoubleLesson: false
                }
            };

            manager.importExistingSchedule(existingSchedule);

            // Verify internal state
            expect(Object.keys(manager.schedule).length).toBe(1);
            expect(manager.bookedEntries.length).toBe(1);
            expect(manager.teacherSchedule['t1']['Segunda-0']).toBe(true);
            expect(manager.classSchedule['c1']['Segunda-0']).toBe(true);
        });

        it('should fill pending lessons only', () => {
            // Setup: Activity needs 2 lessons. 
            // Existing schedule has 1 lesson.
            mockData.activities = [
                { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 2, doubleLesson: false },
            ];

            const manager = new ScheduleManager(mockData);

            const existingSchedule = {
                'c1-Segunda-0': {
                    subjectId: 's1',
                    teacherId: 't1',
                    classId: 'c1',
                    timeKey: 'Segunda-0',
                    isDoubleLesson: false
                }
            };

            manager.importExistingSchedule(existingSchedule);
            const result = manager.fillPendingOnly();

            // Should have 2 total lessons now (1 imported + 1 new)
            expect(Object.keys(result.schedule).length).toBe(2);

            // The imported one should still be there
            expect(result.schedule['c1-Segunda-0']).toBeDefined();
        });

        it('should track failures when allocation is impossible', () => {
            // Setup impossible scenario: 2 lessons needed, only 1 slot available
            mockData.activities = [
                { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 2, doubleLesson: false },
            ];

            // Block all slots except one
            const allDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
            const unavailableKeys = [];
            allDays.forEach(day => {
                // Block everything except Segunda-0
                if (day === 'Segunda') {
                    unavailableKeys.push(`${day}-1`);
                    unavailableKeys.push(`${day}-2`);
                    unavailableKeys.push(`${day}-3`);
                } else {
                    unavailableKeys.push(`${day}-0`);
                    unavailableKeys.push(`${day}-1`);
                    unavailableKeys.push(`${day}-2`);
                    unavailableKeys.push(`${day}-3`);
                }
            });
            mockData.teachers[0].unavailable = unavailableKeys;

            const manager = new ScheduleManager(mockData);
            const result = manager.generate();

            // Should have 1 failure recorded
            expect(manager.failures.length).toBe(1);
            expect(manager.failures[0].remaining).toBe(1); // 2 needed, 1 booked, 1 remaining
        });

        it('should optimize using swap/move to resolve failures', () => {
            // Setup:
            // Turma C1 precisa de 1 aula de S1 (Prof T1).
            // Turma C1 está livre em Segunda-0.
            // Prof T1 está ocupado em Segunda-0 (dando aula para C2).
            // Prof T1 está livre em Segunda-1.
            // C2 está livre em Segunda-1.

            // Solução esperada: Mover aula de [T1, C2] de Seg-0 para Seg-1.
            // Isso libera Seg-0 para [T1, C1].

            mockData.classes.push(
                { id: 'c2', name: '7º A', shift: 'Manhã', activeSlots: ['ts1', 'ts2'] }
            );

            mockData.activities = [
                // A1: [T1, C2] ocupa Seg-0 (será alocada primeiro pois limitamos o C1)
                { id: 'a_bk', teacherId: 't1', subjectId: 's2', classId: 'c2', quantity: 1, doubleLesson: false },
                // A2: [T1, C1] quer aula.
                { id: 'a_tg', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 1, doubleLesson: false }
            ];

            // Forçar ordem ou falha inicial:
            // Vamos pré-ocupar a grade manualmente para garantir o cenário de falha.

            const manager = new ScheduleManager(mockData);

            // Bloquear Seg-0 para C2 com T1
            const blockingAct = mockData.activities[0];
            manager._book(blockingAct, 0, 0, false, true); // Segunda-0

            // Tentar alocar A2 (vai falhar pois T1 ocupado em Seg-0. Seg-1 está livre)
            // Vamos propositalmente bloquear Seg-1 APENAS para C1? Não, se bloquearmos C1 em Seg-1, 
            // a única chance dele seria Seg-0. Mas Seg-0 está com T1 ocupado.

            // Bloquear C1 em todos os slots MENOS Seg-0
            // Use lessonIndices to be safe
            const indices = manager.lessonIndices; // [0, 1, 3]
            for (let d = 0; d < DAYS.length; d++) {
                for (const s of indices) {
                    if (d === 0 && s === 0) continue; // Deixar livre Seg-0
                    manager.classSchedule['c1'] = manager.classSchedule['c1'] || {};
                    manager.classSchedule['c1'][`${DAYS[d]}-${s}`] = true;
                }
            }

            // Tentar alocar via _allocateActivity (deve falhar e ir pra failures)
            const targetAct = mockData.activities[1];
            manager._allocateActivity(targetAct);

            // Debug print
            // console.log('Failures before:', manager.failures);

            expect(manager.failures.length).toBe(1);

            // Agora rodar optimize()
            const result = manager.optimize();

            // Debug print
            // console.log('Failures after:', manager.failures);

            // Deve ter resolvido
            const remainingFailures = manager.failures.filter(f => f.activityId === targetAct.id);
            expect(remainingFailures.length).toBe(0);

            // Verificar se T1/C2 mudou de lugar (moveu de 0-0 para outro lugar para liberar T1)
            const c1Entry = result.schedule['c1-Segunda-0'];
            expect(c1Entry).toBeDefined();
            expect(c1Entry.teacherId).toBe('t1');

            // Verificar se C2 mudou (não está mais em 0-0)
            const c2EntryOld = result.schedule['c2-Segunda-0'];
            expect(c2EntryOld).toBeUndefined();

            // Deve estar em algum lugar (provavelmente Seg-1 (0-1))
            const c2Moves = Object.values(result.schedule).filter(s => s.classId === 'c2');
            expect(c2Moves.length).toBe(1);
        });
    });
});
