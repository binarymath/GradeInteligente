/**
 * Módulo de utilitários de tempo.
 * Responsável por classificação de turnos e cálculos de horário.
 */

/**
 * Classifica um horário (HH:MM) no turno correspondente baseado em faixas fixas.
 * - Manhã: < 12:00
 * - Tarde: 12:00 até 17:59
 * - Noite: >= 18:00
 * @param {string} start - Horário no formato "HH:MM".
 * @returns {'Manhã'|'Tarde'|'Noite'} O turno correspondente.
 */
export function classifySlotShift(start) {
  const [h, m] = start.split(':').map(Number);
  const minutes = h * 60 + m;
  if (minutes < 12 * 60) return 'Manhã';
  if (minutes < 18 * 60) return 'Tarde';
  return 'Noite';
}

/**
 * Retorna o turno efetivo de um slot, considerando override manual.
 * Se o slot tiver uma propriedade `shift` definida manualmente, ela prevalece.
 * Caso contrário, o turno é calculado automaticamente pelo horário de início.
 * @param {Object} slot - Objeto do slot ({ start: string, shift?: string }).
 * @returns {string} O turno do slot.
 */
export function computeSlotShift(slot) {
  return slot.shift || classifySlotShift(slot.start);
}

/**
 * Expande ou processa uma lista de rótulos de turno.
 * Atualmente mantém turnos integrais como entidades distintas (não quebra em "Manhã" e "Tarde").
 * Retorna um Set para garantir unicidade.
 * @param {string[]} shifts - Lista de turnos (ex: ['Manhã', 'Integral (Manhã e Tarde)']).
 * @returns {Set<string>} Set contendo os turnos únicos.
 */
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
