export const uid = () => Math.random().toString(36).substr(2, 9);

export const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

export const COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
  { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-300' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-300' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
];

export const getAllSlots = (timeSlots) => timeSlots.map((slot, index) => ({ ...slot, originalIndex: index }));
export const getLessonIndices = (timeSlots) => timeSlots.map((slot, index) => ({...slot, originalIndex: index})).filter(s => s.type === 'aula');

/**
 * Verifica se um slot é válido para uma turma em um dia específico.
 * Considera a propriedade 'days' do TimeSlot para horários que variam por dia.
 * @param {Object} slot - TimeSlot
 * @param {number} dayIdx - Índice do dia (0=seg, 1=ter, 2=qua, 3=qui, 4=sex)
 * @returns {boolean} true se o slot é válido para este dia
 */
export const isSlotValidForDay = (slot, dayIdx) => {
  // Se o slot não tem restrição de dias, é válido para qualquer dia
  if (!slot.days || slot.days.length === 0) {
    return true;
  }
  // Se tem restrição de dias, verifica se o dia atual está incluído
  return slot.days.includes(dayIdx);
};
