import { describe, it, expect } from 'vitest';
import { isSlotValidForDay } from '../src/utils';

describe('Horários Variáveis por Dia da Semana', () => {
  
  describe('isSlotValidForDay', () => {
    it('deve retornar true para slot sem restrição de dias (all days)', () => {
      const slot = {
        id: 'slot1',
        start: '08:40',
        end: '08:50',
        type: 'intervalo'
      };
      // Sem propriedade 'days' = válido para todos os dias
      expect(isSlotValidForDay(slot, 0)).toBe(true); // Segunda
      expect(isSlotValidForDay(slot, 1)).toBe(true); // Terça
      expect(isSlotValidForDay(slot, 4)).toBe(true); // Sexta
    });

    it('deve retornar true apenas para dias especificados', () => {
      const slotSegunda = {
        id: 'slot2',
        start: '08:40',
        end: '08:50',
        type: 'intervalo',
        days: [0] // Apenas segunda (0)
      };
      
      expect(isSlotValidForDay(slotSegunda, 0)).toBe(true);  // Segunda
      expect(isSlotValidForDay(slotSegunda, 1)).toBe(false); // Terça
      expect(isSlotValidForDay(slotSegunda, 2)).toBe(false); // Quarta
    });

    it('deve suportar múltiplos dias', () => {
      const slotTeraSex = {
        id: 'slot3',
        start: '05:40',
        end: '05:50',
        type: 'intervalo',
        days: [1, 2, 3, 4] // Terça a Sexta
      };
      
      expect(isSlotValidForDay(slotTeraSex, 0)).toBe(false); // Segunda
      expect(isSlotValidForDay(slotTeraSex, 1)).toBe(true);  // Terça
      expect(isSlotValidForDay(slotTeraSex, 4)).toBe(true);  // Sexta
    });

    it('deve retornar true para array vazio de dias', () => {
      const slot = {
        id: 'slot4',
        start: '11:00',
        end: '12:00',
        type: 'almoco',
        days: []  // Array vazio = todos os dias
      };
      
      expect(isSlotValidForDay(slot, 0)).toBe(true);
      expect(isSlotValidForDay(slot, 4)).toBe(true);
    });

    it('deve retornar true se days é null ou undefined', () => {
      const slot1 = {
        id: 'slot5',
        start: '11:00',
        end: '12:00',
        type: 'almoco',
        days: null
      };
      
      const slot2 = {
        id: 'slot6',
        start: '11:00',
        end: '12:00',
        type: 'almoco'
        // days undefined
      };
      
      expect(isSlotValidForDay(slot1, 0)).toBe(true);
      expect(isSlotValidForDay(slot2, 0)).toBe(true);
    });
  });

  describe('TimeSlot com dias variáveis', () => {
    it('deve permitir configuração de intervalo diferente por dia', () => {
      // Segunda: 08:40-08:50
      const intervalSegunda = {
        id: 'intervalo_segunda',
        start: '08:40',
        end: '08:50',
        type: 'intervalo',
        days: [0]
      };
      
      // Terça-Sexta: 05:40-05:50
      const intervalTeraSex = {
        id: 'intervalo_tera_sex',
        start: '05:40',
        end: '05:50',
        type: 'intervalo',
        days: [1, 2, 3, 4]
      };
      
      // Validações
      expect(isSlotValidForDay(intervalSegunda, 0)).toBe(true);
      expect(isSlotValidForDay(intervalSegunda, 1)).toBe(false);
      
      expect(isSlotValidForDay(intervalTeraSex, 0)).toBe(false);
      expect(isSlotValidForDay(intervalTeraSex, 1)).toBe(true);
      expect(isSlotValidForDay(intervalTeraSex, 4)).toBe(true);
    });

    it('deve permitir almoço em todas as horas com mesmos dias', () => {
      const almoco = {
        id: 'almoco_completo',
        start: '11:30',
        end: '12:30',
        type: 'almoco',
        days: [0, 1, 2, 3, 4] // Seg-Sex
      };
      
      for (let day = 0; day < 5; day++) {
        expect(isSlotValidForDay(almoco, day)).toBe(true);
      }
    });

    it('deve permitir jantar apenas em dias específicos', () => {
      const jantarTarde = {
        id: 'jantar_tarde',
        start: '17:30',
        end: '18:30',
        type: 'jantar',
        days: [4] // Apenas sexta
      };
      
      expect(isSlotValidForDay(jantarTarde, 4)).toBe(true);  // Sexta
      expect(isSlotValidForDay(jantarTarde, 0)).toBe(false); // Segunda
    });
  });

  describe('Compatibilidade reversa', () => {
    it('deve tratarbslots antigos sem propriedade days como válidos para todos dias', () => {
      const oldSlot = {
        id: 'old_slot',
        start: '08:00',
        end: '08:50',
        type: 'aula'
        // Sem 'days'
      };
      
      for (let day = 0; day < 5; day++) {
        expect(isSlotValidForDay(oldSlot, day)).toBe(true);
      }
    });
  });
});
