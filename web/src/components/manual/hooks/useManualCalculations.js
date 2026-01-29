
import { useMemo } from 'react';
import { DAYS } from '../../../utils';
import { isSlotActiveLocal } from '../utils';

export const useManualCalculations = (data) => {
    return useMemo(() => {
        try {
            if (!data || !data.classes || !data.activities) return { pendingLines: [], slotAnalysis: [], summary: {}, pendingItems: [], missingDetails: [] };

            const lines = [];
            let totalExpected = 0;
            let totalAllocated = 0;
            let totalPending = 0;

            const newPendingItems = []; // Lista estruturada

            // === ANÁLISE DE SLOTS (baseado em atividades, não em configuração) ===
            let totalUsedSlots = 0;
            const slotAnalysis = [];

            // Contar alocações por classe
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

                if (!classAllocations[entry.classId]) {
                    classAllocations[entry.classId] = 0;
                }
                classAllocations[entry.classId]++;
                totalUsedSlots++;
            });

            // Coletar todas as atividades esperadas (Agrupado por MATÉRIA/TURMA)
            const expectedByKey = {};
            const teachersByKey = {};
            const seenActivities = new Set();

            (data.activities || []).forEach(act => {
                const checkKey = `${act.classId}-${act.subjectId}-${act.teacherId}`;
                const aggKey = `${act.classId}-${act.subjectId}`;

                if (!seenActivities.has(checkKey)) {
                    const qty = parseInt(act.quantity) || 0;
                    expectedByKey[aggKey] = (expectedByKey[aggKey] || 0) + qty;
                    seenActivities.add(checkKey);

                    if (!teachersByKey[aggKey]) teachersByKey[aggKey] = new Set();
                    if (act.teacherId) teachersByKey[aggKey].add(act.teacherId);
                }
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

            // Mostrar análise por classe
            for (const classData of (data.classes || [])) {
                const expected = classExpected[classData.id] || 0;
                const allocated = classAllocations[classData.id] || 0;
                const free = Math.max(0, expected - allocated);

                if (expected > 0) {
                    slotAnalysis.push(`   • ${classData.name}: ${allocated}/${expected} ocupado(s) (${free} livre(s))`);
                }
            }

            // === ANÁLISE DE PENDÊNCIAS ===
            // Índice de alocação por (turma-matéria)
            const allocatedIndex = {};
            Object.entries(data.schedule || {}).forEach(([key, entry]) => {
                let dayIdx = entry.dayIdx;
                let slotIdx = entry.slotIdx;

                // PRIORIDADE 1: Parsear da Key
                const parts = key.split('-');
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
                // PRIORIDADE 2: Internal timeKey
                if ((dayIdx === undefined || slotIdx === undefined) && entry.timeKey) {
                    const tParts = entry.timeKey.split('-');
                    const dIdx = DAYS.indexOf(tParts[0]);
                    if (dIdx >= 0) dayIdx = dIdx;
                    else {
                        const dNum = parseInt(tParts[0]);
                        if (!isNaN(dNum)) dayIdx = dNum;
                    }
                }

                if (dayIdx === undefined || dayIdx === -1 || slotIdx === undefined) return;
                if (!isSlotActiveLocal(data, entry.classId, dayIdx, slotIdx)) return;

                // Chave de agregação simplificada: Class-Subject
                const aggKey = `${entry.classId}-${entry.subjectId}`;
                allocatedIndex[aggKey] = (allocatedIndex[aggKey] || 0) + 1;
            });

            // Coletar totais e calcular pendências por MATÉRIA
            let totalExcess = 0;
            const excessDetails = [];
            const missingDetails = [];

            Object.entries(expectedByKey).forEach(([key, expected]) => {
                const allocated = allocatedIndex[key] || 0;
                const missing = Math.max(0, expected - allocated);
                const excess = Math.max(0, allocated - expected);

                totalExpected += expected;
                totalAllocated += allocated;
                totalPending += missing;
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
                summary: { totalExpected, totalAllocated, totalPending, totalUsedSlots },
                pendingItems: newPendingItems,
                missingDetails
            };

        } catch (err) {
            console.error("Erro ao recalcular pendências:", err);
            return { pendingLines: ['Erro ao calcular pendências.'], slotAnalysis: [], summary: {}, pendingItems: [], missingDetails: [] };
        }
    }, [data]);
};
