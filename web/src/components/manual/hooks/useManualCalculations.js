
import { useMemo } from 'react';
import { DAYS } from '../../../utils';
import { isSlotActiveLocal } from '../utils';

export const useManualCalculations = (data) => {
    return useMemo(() => {
        try {
            if (!data || !data.classes || !data.activities) return { pendingLines: [], slotAnalysis: [], summary: {}, pendingItems: [], missingDetails: [] };

            const lines = [];
            let totalExpected = 0;

            const newPendingItems = []; // Lista estruturada

            // === HELPER: Contar alocações válidas (com mesma lógica de scheduleService.js) ===
            const timeSlots = data.timeSlots || [];
            const slotById = new Map(timeSlots.map((slot, idx) => [String(slot.id ?? idx), slot]));
            const isLessonSlot = (slotId) => {
                const slot = slotById.get(String(slotId)) || timeSlots[Number(slotId)];
                return !!(slot && slot.type === 'aula');
            };

            const countValidAllocations = (scheduleObj) => {
                let count = 0;
                const bySubject = {}; // Para detalhar por classe-matéria
                
                for (const [key, entry] of Object.entries(scheduleObj || {})) {
                    let dayIdx = entry.dayIdx;
                    let slotIdx = entry.slotIdx;

                    const parts = String(key).split('-');
                    if (parts.length >= 3) {
                        const sStr = parts[parts.length - 1];
                        const dStr = parts[parts.length - 2];
                        const maybeSlot = parseInt(sStr, 10);
                        const maybeDay = DAYS.indexOf(dStr);
                        if (!isNaN(maybeSlot) && maybeDay >= 0) {
                            slotIdx = maybeSlot;
                            dayIdx = maybeDay;
                        }
                    }

                    if ((dayIdx === undefined || slotIdx === undefined) && entry.timeKey) {
                        const tParts = entry.timeKey.split('-');
                        const dIdx = DAYS.indexOf(tParts[0]);
                        if (dIdx >= 0) dayIdx = dIdx;
                        const sIdx = parseInt(tParts[1], 10);
                        if (!isNaN(sIdx)) slotIdx = sIdx;
                    }

                    if (dayIdx === undefined || dayIdx < 0 || slotIdx === undefined) continue;

                    const cls = data.classes?.find(c => c.id === entry.classId);
                    const slotId = timeSlots[slotIdx]?.id ?? String(slotIdx);
                    if (!cls) continue;
                    if (!isLessonSlot(slotId)) continue;
                    if (!isSlotActiveLocal(data, entry.classId, dayIdx, slotId)) continue;

                    count += 1;
                    
                    // Detalhar por (classId-subjectId)
                    const aggKey = `${entry.classId}-${entry.subjectId}`;
                    bySubject[aggKey] = (bySubject[aggKey] || 0) + 1;
                }
                return { total: count, bySubject };
            };

            const allocationResult = countValidAllocations(data.schedule);
            const totalAllocated = allocationResult.total;
            const allocatedIndex = allocationResult.bySubject;

            // === ANÁLISE DE SLOTS (baseado em atividades, não em configuração) ===
            let totalUsedSlots = 0;
            const slotAnalysis = [];

            // Contar alocações por classe (usando mesma validação)
            const classAllocations = {};
            Object.entries(data.schedule || {}).forEach(([key, entry]) => {
                // Tentar extrair dia/slot da key ou entry para validação
                let dayIdx = entry.dayIdx;
                let slotIdx = entry.slotIdx;

                // PRIORIDADE 1: Parsear da Key (que é o que define a posição no Grid)
                // Key format: classId-Dia-Slot
                const parts = key.split('-');
                if (parts.length >= 3) {
                    const sStr = parts[parts.length - 1]; // Última parte é slot
                    const maybeSlot = parseInt(sStr, 10);

                    const dStr = parts[parts.length - 2]; // Penúltima parte é dia
                    const maybeDay = DAYS.indexOf(dStr);

                    if (!isNaN(maybeSlot) && maybeDay >= 0) {
                        slotIdx = maybeSlot;
                        dayIdx = maybeDay;
                    }
                }

                // PRIORIDADE 2: Internal timeKey (apenas se falhou parse da Key e ele existe)
                if ((dayIdx === undefined || slotIdx === undefined) && entry.timeKey) {
                    const tParts = entry.timeKey.split('-');
                    const dIdx = DAYS.indexOf(tParts[0]);
                    if (dIdx >= 0) dayIdx = dIdx;
                    else {
                        // Tenta index numérico
                        const dNum = parseInt(tParts[0]);
                        if (!isNaN(dNum)) dayIdx = dNum;
                    }
                }

                if (dayIdx === undefined || dayIdx === -1 || slotIdx === undefined) {
                    return; // Ignora entrada malformada
                }

                if (!isSlotActiveLocal(data, entry.classId, dayIdx, slotIdx)) {
                    return;
                }

                // Valida se é slot de aula
                const slotId = timeSlots[slotIdx]?.id ?? String(slotIdx);
                if (!isLessonSlot(slotId)) {
                    return;
                }

                if (!classAllocations[entry.classId]) {
                    classAllocations[entry.classId] = 0;
                }
                classAllocations[entry.classId]++;
                totalUsedSlots++;
            });

            // Coletar todas as atividades esperadas (Agrupado por MATÉRIA/TURMA)
            const expectedByKey = {};
            const teachersByKey = {};

            (data.activities || []).forEach(act => {
                const aggKey = `${act.classId}-${act.subjectId}`;
                const qty = parseInt(act.quantity) || 0;
                expectedByKey[aggKey] = (expectedByKey[aggKey] || 0) + qty;

                if (!teachersByKey[aggKey]) teachersByKey[aggKey] = new Set();
                if (act.teacherId) teachersByKey[aggKey].add(act.teacherId);
            });

            // Contar total esperado por classe
            const classExpected = {};
            Object.entries(expectedByKey).forEach(([key, expected]) => {
                const [classId] = key.split('-');
                if (!classExpected[classId]) {
                    classExpected[classId] = 0;
                }
                classExpected[classId] += expected;
            });

            // Calcular capacidade de slots (aula) por turma
            const classCapacity = {};
            let totalCapacity = 0;
            for (const classData of (data.classes || [])) {
                const hasActiveSlotsByDay = classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0;
                const hasActiveSlots = classData.activeSlots && Array.isArray(classData.activeSlots) && classData.activeSlots.length > 0;

                let capacity = 0;
                if (hasActiveSlotsByDay) {
                    Object.values(classData.activeSlotsByDay).forEach(slotIds => {
                        if (!Array.isArray(slotIds)) return;
                        slotIds.forEach(slotId => {
                            if (isLessonSlot(slotId)) capacity += 1;
                        });
                    });
                } else if (hasActiveSlots) {
                    const perDay = classData.activeSlots.filter(isLessonSlot).length;
                    capacity = perDay * DAYS.length;
                }

                classCapacity[classData.id] = capacity;
                totalCapacity += capacity;
            }

            // Mostrar análise por classe (ocupados x capacidade real de slots)
            for (const classData of (data.classes || [])) {
                const capacity = classCapacity[classData.id] || 0;
                const allocated = classAllocations[classData.id] || 0;
                const free = Math.max(0, capacity - allocated);

                if (capacity > 0) {
                    slotAnalysis.push(`   • ${classData.name}: ${allocated}/${capacity} ocupado(s) (${free} livre(s))`);
                }
            }

            // === ANÁLISE DE PENDÊNCIAS ===
            // allocatedIndex já está calculado acima com a mesma validação
            
            // Coletar totais e calcular pendências por MATÉRIA
            let totalExcess = 0;
            const excessDetails = [];
            const missingDetails = [];

            Object.entries(expectedByKey).forEach(([key, expected]) => {
                const allocated = allocatedIndex[key] || 0;
                const missing = Math.max(0, expected - allocated);
                const excess = Math.max(0, allocated - expected);

                totalExpected += expected;
                totalExcess += excess;

                const [classId, subjectId] = key.split('-');
                const className = data.classes.find(c => c.id === classId)?.name || 'Turma';
                const subjectName = data.subjects.find(s => s.id === subjectId)?.name || 'Matéria';

                let teacherDisplay = '';
                const teacherIds = teachersByKey[key];
                if (teacherIds && teacherIds.size > 0) {
                    const names = Array.from(teacherIds).map(tid =>
                        data.teachers.find(t => t.id === tid)?.name || 'Prof.?'
                    ).join(' / ');
                    teacherDisplay = names;
                } else {
                    teacherDisplay = 'Sem professor';
                }

                if (missing > 0) {
                    const item = { className, subjectName, teacherName: teacherDisplay, allocated, expected, missing, classId, subjectId, teacherIds };
                    missingDetails.push(item);
                    newPendingItems.push(item);
                }

                if (excess > 0) {
                    excessDetails.push(`${subjectName} - ${className}: +${excess}`);
                }
            });

            // CORRIGIR: totalPending deve ser totalExpected - totalAllocated (simples cálculo)
            const totalPending = Math.max(0, totalExpected - totalAllocated);

            const unknownAllocationsCount = Math.max(0, totalUsedSlots - totalAllocated);

            // Organizar por matéria/turma para exibição NO LOG DE TEXTO (Legado)
            const detailsBySubjectClass = {};
            missingDetails.forEach(d => {
                const key = `${d.subjectName}-${d.className}`;
                if (!detailsBySubjectClass[key]) {
                    detailsBySubjectClass[key] = [];
                }
                detailsBySubjectClass[key].push(d);
            });

            Object.entries(detailsBySubjectClass).forEach(([_, details]) => {
                details.forEach(d => {
                    lines.push(`• ${d.subjectName} - ${d.className}: ${d.allocated}/${d.expected} (faltam ${d.missing}) — Prof: ${d.teacherName}`);
                });
            });

            const header = [
                '📊 ANÁLISE DE SLOTS',
                `   Total de slots ocupados: ${totalUsedSlots}`,
                '',
                'Detalhamento por turma:',
                ...slotAnalysis,
                '',
                '📊 ANÁLISE DE PENDÊNCIAS',
                `   📈 Total esperado: ${totalExpected} aula(s)`,
                `   ✅ Total alocado (Conhecido): ${totalAllocated} aula(s)`,
            ];

            if (totalExcess > 0) {
                header.push(`   ⚠️ Excedentes: ${totalExcess} aula(s) (incluso no total alocado)`);
            }
            if (unknownAllocationsCount > 0) {
                header.push(`   ❓ Alocações desconhecidas/fantasmas: ${unknownAllocationsCount} slot(s)`);
            }

            header.push(`   ⏳ Total de pendências: ${totalPending} aula(s)`);

            return {
                pendingLines: [...header, '', '⬇️ ITENS PENDENTES:', ...lines],
                slotAnalysis,
                summary: {
                    totalExpected,
                    totalAllocated,
                    totalPending,
                    totalUsedSlots,
                    totalCapacity,
                    freeSlots: Math.max(0, totalCapacity - totalAllocated)
                },
                pendingItems: newPendingItems,
                missingDetails
            };

        } catch (err) {
            console.error("Erro ao recalcular pendências:", err);
            return { pendingLines: ['Erro ao calcular pendências.'], slotAnalysis: [], summary: {}, pendingItems: [], missingDetails: [] };
        }
    }, [data]);
};
