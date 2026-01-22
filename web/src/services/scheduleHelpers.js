/**
 * Funções helper para formatação, descrição e cálculos de agendamento
 * Responsabilidade: Utilitários de transformação de dados para exibição e cálculos
 */

import { DAYS } from '../utils';

/**
 * Descreve uma atividade em formato legível
 */
export function describeActivity(activity, data) {
  const subjectName = data.subjects.find(s => s.id === activity.subjectId)?.name || activity.subjectId;
  const className = data.classes.find(c => c.id === activity.classId)?.name || activity.classId;
  const teacherName = data.teachers.find(t => t.id === activity.teacherId)?.name || activity.teacherId || 'Sem professor';
  return `${subjectName} / ${className} (Prof. ${teacherName})`;
}

/**
 * Descreve uma entrada de agendamento (booked entry)
 */
export function describeEntry(entry, data) {
  const subjectName = data.subjects.find(s => s.id === entry.subjectId)?.name || entry.subjectId;
  const className = data.classes.find(c => c.id === entry.classId)?.name || entry.classId;
  const teacherName = data.teachers.find(t => t.id === entry.teacherId)?.name || entry.teacherId;
  return `${subjectName} em ${className} (Prof. ${teacherName})`;
}

/**
 * Formata um rótulo de slot de tempo
 */
export function formatSlotLabel(timeSlots, dayIdx, slotIdx) {
  const slot = timeSlots[slotIdx];
  return slot ? `${DAYS[dayIdx]} ${slot.start}-${slot.end}` : `${DAYS[dayIdx]}-${slotIdx}`;
}

/**
 * Calcula aulas excedentes (acima do planejado) por turma/matéria e por professor
 */
export function computeOverAllocations(data, bookedEntries) {
  const expectedBySubject = new Map();
  const expectedByTeacher = new Map();

  for (const act of data.activities || []) {
    const key = `${act.classId}-${act.subjectId}`;
    expectedBySubject.set(key, (expectedBySubject.get(key) || 0) + (Number(act.quantity) || 0));

    const tKey = `${act.classId}-${act.subjectId}-${act.teacherId || 'none'}`;
    expectedByTeacher.set(tKey, (expectedByTeacher.get(tKey) || 0) + (Number(act.quantity) || 0));
  }

  const allocatedBySubject = new Map();
  const allocatedByTeacher = new Map();

  for (const entry of bookedEntries || []) {
    const key = `${entry.classId}-${entry.subjectId}`;
    allocatedBySubject.set(key, (allocatedBySubject.get(key) || 0) + 1);

    const tKey = `${entry.classId}-${entry.subjectId}-${entry.teacherId || 'none'}`;
    allocatedByTeacher.set(tKey, (allocatedByTeacher.get(tKey) || 0) + 1);
  }

  const subjectExcess = [];
  const teacherExcess = [];

  for (const [key, allocated] of allocatedBySubject.entries()) {
    const expected = expectedBySubject.get(key) || 0;
    if (allocated > expected) {
      const [classId, subjectId] = key.split('-');
      subjectExcess.push({ classId, subjectId, allocated, expected, excess: allocated - expected });
    }
  }

  for (const [key, allocated] of allocatedByTeacher.entries()) {
    const expected = expectedByTeacher.get(key) || 0;
    if (allocated > expected) {
      const [classId, subjectId, teacherId] = key.split('-');
      teacherExcess.push({ classId, subjectId, teacherId, allocated, expected, excess: allocated - expected });
    }
  }

  const totalExcess = subjectExcess.reduce((s, e) => s + e.excess, 0) + teacherExcess.reduce((s, e) => s + e.excess, 0);

  return { subjectExcess, teacherExcess, totalExcess };
}

/**
 * Calcula o span (intervalo) de uma entrada (aula simples ou dupla)
 */
export function getEntrySpan(manager, entry) {
  const baseSlot = entry.slotIdx;
  const dayIdx = entry.dayIdx;
  const baseKey = `${entry.classId}-${DAYS[dayIdx]}-${baseSlot}`;
  const current = manager.schedule[baseKey];

  if (current?.isDoubleLesson) {
    return [baseSlot, baseSlot + 1];
  }

  const prevKey = `${entry.classId}-${DAYS[dayIdx]}-${baseSlot - 1}`;
  const prev = manager.schedule[prevKey];
  if (prev?.isDoubleLesson && prev.teacherId === entry.teacherId && prev.subjectId === entry.subjectId) {
    return [baseSlot - 1, baseSlot];
  }

  return [baseSlot];
}

/**
 * Monta lista de pendências (quantidade a alocar) sem modificar a grade
 */
export function buildPendingActivitiesForRepair(data, manager) {
  const bookedCounts = {};

  for (const entry of manager.bookedEntries) {
    const key = `${entry.classId}-${entry.subjectId}`;
    bookedCounts[key] = (bookedCounts[key] || 0) + 1;
  }

  const demandMap = {};

  for (const activity of data.activities) {
    const key = `${activity.classId}-${activity.subjectId}`;
    if (!demandMap[key]) demandMap[key] = { totalNeeded: 0, activities: [] };
    demandMap[key].totalNeeded += Number(activity.quantity) || 0;
    demandMap[key].activities.push(activity);
  }

  const pending = [];

  for (const [key, demand] of Object.entries(demandMap)) {
    const alreadyBooked = bookedCounts[key] || 0;
    let missing = demand.totalNeeded - alreadyBooked;
    if (missing <= 0) continue;

    for (const activity of demand.activities) {
      if (missing <= 0) break;
      const qty = Math.min(missing, Number(activity.quantity) || 0);
      if (qty > 0) {
        pending.push({ ...activity, quantity: qty });
        missing -= qty;
      }
    }
  }

  return pending;
}
