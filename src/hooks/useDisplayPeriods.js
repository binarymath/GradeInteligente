import { useMemo } from 'react';
import { classifySlotShift, expandShifts } from '../utils/time';

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
        const expanded = expandShifts(teacher.shifts);
        return periods.filter(p => expanded.has(classifySlotShift(p.start)));
      }
      return periods;
    }
    if (viewMode === 'subject') {
      // Matérias não têm restrição de período; mostramos todos.
      return periods;
    }
    return periods;
  }, [data.timeSlots, data.classes, data.teachers, viewMode, selectedEntity]);
}
