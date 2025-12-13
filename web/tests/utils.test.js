import { describe, it, expect } from 'vitest';
import { uid, DAYS, COLORS } from '../src/utils';

describe('utils', () => {
    describe('uid', () => {
        it('should generate unique ids', () => {
            const id1 = uid();
            const id2 = uid();
            expect(id1).not.toBe(id2);
        });

        it('should generate string ids', () => {
            const id = uid();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        });
    });

    describe('DAYS', () => {
        it('should have 5 weekdays', () => {
            expect(DAYS).toHaveLength(5);
        });

        it('should be Portuguese weekdays', () => {
            expect(DAYS).toEqual(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']);
        });
    });

    describe('COLORS', () => {
        it('should have at least 8 color options', () => {
            expect(COLORS.length).toBeGreaterThanOrEqual(8);
        });

        it('should have bg, text and border for each color', () => {
            COLORS.forEach(color => {
                expect(color).toHaveProperty('bg');
                expect(color).toHaveProperty('text');
                expect(color).toHaveProperty('border');
            });
        });
    });
});
