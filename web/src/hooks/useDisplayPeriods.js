import { useMemo } from 'react';
import { classifySlotShift, expandShifts, computeSlotShift } from '../utils/time';

// Hook para encapsular a lógica de filtragem de períodos.
export function useDisplayPeriods({ data, viewMode, selectedEntity }) {
  return useMemo(() => {
    const periods = data.timeSlots;
    if (!selectedEntity) return periods;
    if (viewMode === 'class') {
      const currentClass = data.classes.find(c => c.id === selectedEntity);
      if (currentClass) {
        // Prioriza activeSlotsByDay se existir
        if (currentClass.activeSlotsByDay && Object.keys(currentClass.activeSlotsByDay).length > 0) {
          // Une todos os slots ativos em qualquer dia
          const allActiveSlots = new Set(Object.values(currentClass.activeSlotsByDay).flat());
          return periods.filter(p => allActiveSlots.has(p.id));
        } else if (currentClass.activeSlots) {
          // Fallback: usa activeSlots (legado)
          return periods.filter(p => currentClass.activeSlots.includes(p.id));
        }
      }
      return periods;
    }
    if (viewMode === 'teacher') {
      const teacher = data.teachers.find(t => t.id === selectedEntity);
      if (teacher?.shifts?.length) {
        // Professores com turno integral NÃO expandem para simples (igual matérias)
        const expanded = expandShifts(teacher.shifts);
        return periods.filter(p => expanded.has(computeSlotShift(p)) || expanded.has(p.shift));
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
