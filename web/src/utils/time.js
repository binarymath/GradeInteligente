// Funções utilitárias relacionadas a turnos e classificação de horários.

/** Classifica um horário (HH:MM) no turno correspondente. */
export function classifySlotShift(start) {
  const [h, m] = start.split(':').map(Number);
  const minutes = h * 60 + m;
  if (minutes < 12 * 60) return 'Manhã';
  if (minutes < 18 * 60) return 'Tarde';
  return 'Noite';
}

/** Retorna turno efetivo considerando override manual (slot.shift). */
export function computeSlotShift(slot) {
  return slot.shift || classifySlotShift(slot.start);
}

/** Expande rótulos de turno integral para seus componentes. */
export function expandShifts(shifts) {
  const expanded = new Set();
  (shifts || []).forEach(s => {
    // Mantém turnos integrais como distintos (não expande para simples)
    if (s === 'Integral (Manhã e Tarde)' || s === 'Integral (Tarde e Noite)') {
      expanded.add(s); // adiciona somente o rótulo integral
    } else {
      expanded.add(s);
    }
  });
  return expanded;
}
