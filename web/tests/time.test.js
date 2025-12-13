import { describe, it, expect } from 'vitest';
import { classifySlotShift, computeSlotShift, expandShifts } from '../src/utils/time';

describe('time utilities', () => {
    describe('classifySlotShift', () => {
        it('should classify morning slots correctly', () => {
            expect(classifySlotShift('07:00')).toBe('Manhã');
            expect(classifySlotShift('11:59')).toBe('Manhã');
        });

        it('should classify afternoon slots correctly', () => {
            expect(classifySlotShift('12:00')).toBe('Tarde');
            expect(classifySlotShift('17:59')).toBe('Tarde');
        });

        it('should classify evening slots correctly', () => {
            expect(classifySlotShift('18:00')).toBe('Noite');
            expect(classifySlotShift('23:59')).toBe('Noite');
        });
    });

    describe('computeSlotShift', () => {
        const slot = { id: 'ts1', start: '08:00', end: '09:00', type: 'aula' };

        it('should return manual shift when set', () => {
            const slotWithShift = { ...slot, shift: 'Tarde' };
            expect(computeSlotShift(slotWithShift)).toBe('Tarde');
        });

        it('should return automatic shift when no manual override', () => {
            expect(computeSlotShift(slot)).toBe('Manhã');
        });

        it('should handle slot without shift property', () => {
            const { shift, ...slotNoShift } = slot;
            expect(computeSlotShift(slotNoShift)).toBe('Manhã');
        });
    });

    describe('expandShifts', () => {
        it('should maintain Integral (Manhã e Tarde) as is (returning Set)', () => {
            const result = expandShifts(['Integral (Manhã e Tarde)']);
            expect(result).toEqual(new Set(['Integral (Manhã e Tarde)']));
        });

        it('should maintain Integral (Tarde e Noite) as is (returning Set)', () => {
            const result = expandShifts(['Integral (Tarde e Noite)']);
            expect(result).toEqual(new Set(['Integral (Tarde e Noite)']));
        });

        it('should keep single shifts unchanged (returning Set)', () => {
            const result = expandShifts(['Manhã', 'Noite']);
            expect(result).toEqual(new Set(['Manhã', 'Noite']));
        });

        it('should handle mixed shifts (returning Set)', () => {
            const result = expandShifts(['Manhã', 'Integral (Tarde e Noite)']);
            expect(result).toEqual(new Set(['Manhã', 'Integral (Tarde e Noite)']));
        });

        it('should handle empty array (returning Set)', () => {
            const result = expandShifts([]);
            expect(result).toEqual(new Set());
        });
    });
});
