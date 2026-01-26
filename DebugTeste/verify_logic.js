
// Mocks
const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function formatSlotLabel(timeSlots, dayIdx, slotIdx) {
    const slot = timeSlots[slotIdx];
    return slot ? `${DAYS[dayIdx]} ${slot.start}-${slot.end}` : `${DAYS[dayIdx]}-${slotIdx}`;
}

function detectConflictSummary(data, schedule) { return []; } // Mock

// The function to test (copied from scheduleAnalyzer.js with minor adaptation for mocks)
function analyzeExistingSchedule(data) {
    const log = [];
    const issues = [];

    // Note: I am omitting the initial parts of the function that are not relevant to the new logic
    // and focusing on the new logic I added.
    // In a real integration test I would include everything, but here I want to verify MY inserted loop.

    const schedule = data.schedule || {};
    const pendingCount = 0; // Mock
    const pendingActivities = []; // Mock
    const overAllocatedTeachers = []; // Mock

    // NOVO: Detecção de horários vagos (buracos na grade)
    const emptySlots = [];

    for (const classData of data.classes) {
        const slots = [];

        // Identifica slots ativos (mesma lógica do smartRepair)
        if (classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
            Object.entries(classData.activeSlotsByDay).forEach(([dayIdxStr, slotIds]) => {
                const dayIdx = parseInt(dayIdxStr);
                if (isNaN(dayIdx)) return;

                slotIds.forEach(slotId => {
                    // Encontrar o slot object para pegar o index correto
                    const slotObjIdx = data.timeSlots.findIndex(s => s.id === slotId);
                    if (slotObjIdx >= 0) {
                        slots.push({ dayIdx, slotIdx: slotObjIdx });
                    }
                });
            });
        } else if (classData.activeSlots && Array.isArray(classData.activeSlots)) {
            classData.activeSlots.forEach(slotId => {
                const slotObjIdx = data.timeSlots.findIndex(s => s.id === slotId);
                if (slotObjIdx >= 0) {
                    for (let d = 0; d < 5; d++) {
                        slots.push({ dayIdx: d, slotIdx: slotObjIdx });
                    }
                }
            });
        }

        // Verificar cada slot ativo
        for (const slot of slots) {
            const scheduleKey = `${classData.id}-${DAYS[slot.dayIdx]}-${slot.slotIdx}`;
            const hasClass = schedule[scheduleKey];

            if (!hasClass) {
                emptySlots.push({
                    classId: classData.id,
                    className: classData.name,
                    dayIdx: slot.dayIdx,
                    slotIdx: slot.slotIdx,
                    label: formatSlotLabel(data.timeSlots, slot.dayIdx, slot.slotIdx)
                });
            }
        }
    }

    if (emptySlots.length > 0) {
        log.push(`⚠️  ${emptySlots.length} horário(s) vago(s) detectado(s):`);
        log.push('');

        // Agrupar por turma para melhor visualização
        const byClass = {};
        emptySlots.forEach(e => {
            if (!byClass[e.className]) byClass[e.className] = [];
            byClass[e.className].push(e);
        });

        for (const [className, splots] of Object.entries(byClass)) {
            log.push(`   • Turma ${className}:`);
            // Ordenar cronologicamente
            splots.sort((a, b) => {
                if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
                return a.slotIdx - b.slotIdx;
            });

            splots.forEach(s => {
                log.push(`     - ${s.label}`);
            });
            log.push('');
        }

        issues.push({
            type: 'empty_slots',
            count: emptySlots.length,
            details: emptySlots
        });
    }

    return {
        log,
        issues,
        emptySlots
    };
}

// Mock data
const mockData = {
    classes: [
        {
            id: 'class1',
            name: 'Turma 8A',
            // Define active slots: say, Monday (idx 0), slots 0 and 1.
            activeSlotsByDay: {
                '0': ['slot0', 'slot1']
            }
        }
    ],
    timeSlots: [
        { id: 'slot0', start: '08:00', end: '08:40', type: 'aula' },
        { id: 'slot1', start: '08:40', end: '09:30', type: 'aula' }
    ],
    schedule: {
        // only slot0 is booked. slot1 should be detected as empty.
        'class1-Segunda-0': {
            classId: 'class1',
            timeKey: 'Segunda-0' // Mocking what might be in schedule
        }
    }
};

console.log("Running logic verification...");
const result = analyzeExistingSchedule(mockData);
console.log("Log output:");
result.log.forEach(l => console.log(l));

if (result.emptySlots && result.emptySlots.length === 1 && result.emptySlots[0].slotIdx === 1) {
    console.log("✅ SUCCESS: Detected 1 empty slot at index 1 (08:40-09:30)");
} else {
    console.error("❌ FAILURE: Expected 1 empty slot, found", result.emptySlots ? result.emptySlots.length : 0);
    process.exit(1);
}
