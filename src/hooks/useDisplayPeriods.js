import { useMemo } from 'react';
import { classifySlotShift, expandShifts, computeSlotShift } from '../utils/time';

// Hook para encapsular a lógica de filtragem de períodos.
export function useDisplayPeriods({ data, viewMode, selectedEntity }) {
  return useMemo(() => {
    const periods = data.timeSlots;
    if (!selectedEntity) return periods;
    if (viewMode === 'class') {
      const currentClass = data.classes.find(c => c.id === selectedEntity);
      if (currentClass?.activeSlots) {
        return periods.filter(p => currentClass.activeSlots.includes(p.id));
      }
      return periods;
    }
    if (viewMode === 'teacher') {
      const teacher = data.teachers.find(t => t.id === selectedEntity);
      if (teacher?.shifts?.length) {
        // Professores com turno integral enxergam manhã+tarde ou tarde+noite automaticamente
        const expanded = new Set();
        teacher.shifts.forEach(s => {
          if (s === 'Integral (Manhã e Tarde)') {
            expanded.add('Integral (Manhã e Tarde)');
            expanded.add('Manhã');
            expanded.add('Tarde');
          } else if (s === 'Integral (Tarde e Noite)') {
            expanded.add('Integral (Tarde e Noite)');
            expanded.add('Tarde');
            expanded.add('Noite');
          } else {
            expanded.add(s);
          }
        });
        return periods.filter(p => {
          const slotLabel = computeSlotShift(p); // usa override ou classificação automática
          return expanded.has(slotLabel) || expanded.has(p.shift);
        });
      }
      return periods;
    }
    if (viewMode === 'subject') {
      const subject = data.subjects.find(s => s.id === selectedEntity);
      if (subject?.shifts?.length) {
        const expanded = expandShifts(subject.shifts);
        return periods.filter(p => expanded.has(computeSlotShift(p)) || expanded.has(p.shift));
      }
      return periods;
    }
    return periods;
  }, [data.timeSlots, data.classes, data.teachers, viewMode, selectedEntity]);
}
