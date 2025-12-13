
import { describe, it, expect } from 'vitest';
import ScheduleManager from '../src/models/ScheduleManager';

describe('ScheduleManager - Conflict Reproduction', () => {
    it('should prevent booking overlapping slots for the same teacher', () => {
        // Setup data
        const timeSlots = [
            { id: 's1', start: '07:50', end: '08:40', type: 'aula' }, // Slot A
            { id: 's2', start: '08:30', end: '09:20', type: 'aula' }  // Slot B (Overlaps A by 10m)
        ];

        const teachers = [
            // Force availability only on Monday (Day 0) to provoke collision attempt
            {
                id: 't1',
                name: 'Marisa',
                unavailable: [
                    'Terça-0', 'Terça-1',
                    'Quarta-0', 'Quarta-1',
                    'Quinta-0', 'Quinta-1',
                    'Sexta-0', 'Sexta-1'
                ]
            }
        ];

        const classes = [
            { id: 'c1', name: '6A', activeSlots: ['s1'], shift: 'Manhã' },
            { id: 'c2', name: '6B', activeSlots: ['s2'], shift: 'Manhã' }
        ];

        const subjects = [
            { id: 'sub1', name: 'Português', unavailable: [] }
        ];

        // Activity: Marisa teaches both classes
        const activities = [
            { id: 'a1', teacherId: 't1', subjectId: 'sub1', classId: 'c1', quantity: 1, doubleLesson: false },
            { id: 'a2', teacherId: 't1', subjectId: 'sub1', classId: 'c2', quantity: 1, doubleLesson: false }
        ];

        const data = { teachers, classes, subjects, timeSlots, activities };
        const manager = new ScheduleManager(data);

        const result = manager.generate();

        // Check if only ONE was booked (Conflict Avoidance blocked the second one)
        const bookings = result.schedule;
        const bookedCount = Object.keys(bookings).length;

        // Expectation: 1 (Blocking worked)
        expect(bookedCount).toBe(1);

        // Also verify strict unavailability - if it booked 2, it ignored unavailability
        if (bookedCount === 2) {
            console.error("FAILED: Booked 2 activities. Either conflict valid or unavailable ignored.");
        }
    });
});
