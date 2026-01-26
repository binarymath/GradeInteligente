
// Mocks
const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function formatSlotLabel(timeSlots, dayIdx, slotIdx) {
    const slot = timeSlots[slotIdx];
    return slot ? `${DAYS[dayIdx]} ${slot.start}-${slot.end}` : `${DAYS[dayIdx]}-${slotIdx}`;
}

function isSlotActive(classData, dayIdx, slotId) {
    if (!classData) return false;
    if (classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
        const activeSlotsForDay = classData.activeSlotsByDay[dayIdx];
        return activeSlotsForDay && Array.isArray(activeSlotsForDay) && activeSlotsForDay.includes(slotId);
    }
    return true;
}

function detectConflictSummary(data, schedule) { return []; }

// The function under test (simplified adaptation)
function analyzeExistingSchedule(data) {
    const log = [];
    const issues = [];

    const allocatedCount = new Map();
    const schedule = data.schedule || {};
    const invalidEntries = [];

    for (const [key, entry] of Object.entries(schedule)) {
        const classData = data.classes.find(c => c.id === entry.classId);
        if (!classData) continue;

        const slotObj = data.timeSlots[entry.slotIdx];
        const slotId = slotObj ? slotObj.id : String(entry.slotIdx);

        let dayIdx = entry.dayIdx;

        // Mock key validation logic
        if (dayIdx !== undefined && dayIdx >= 0) {
            if (!isSlotActive(classData, dayIdx, slotId)) {
                invalidEntries.push({
                    ...entry,
                    reason: 'Horário inativo para a turma',
                    scheduleKey: key
                });
                continue; // FILTERED OUT
            }
        }

        const activityKey = `${entry.classId}-${entry.subjectId}`;
        const count = allocatedCount.get(activityKey) || 0;
        allocatedCount.set(activityKey, count + 1);
    }

    // Checking count
    const allocatedTotal = Array.from(allocatedCount.values()).reduce((a, b) => a + b, 0);

    return {
        allocatedTotal,
        invalidCount: invalidEntries.length,
        invalidEntries
    };
}

// Mock Data
const mockData = {
    classes: [
        {
            id: 'c1',
            name: 'Turma Teste',
            activeSlotsByDay: {
                '0': ['slot0'] // Only Slot 0 is active on Monday (Index 0)
            }
        }
    ],
    timeSlots: [
        { id: 'slot0', start: '08:00', end: '08:40', type: 'aula' },
        { id: 'slot1', start: '08:40', end: '09:30', type: 'aula' } // Slot 1 exists but is inactive for c1
    ],
    schedule: {
        'valid': {
            classId: 'c1',
            subjectId: 'mat',
            dayIdx: 0,
            slotIdx: 0, // Valid
            timeKey: 'Segunda-0'
        },
        'ghost': {
            classId: 'c1',
            subjectId: 'mat',
            dayIdx: 0,
            slotIdx: 1, // INVALID (Ghost) - should be filtered
            timeKey: 'Segunda-1'
        }
    }
};

console.log("Running ghost allocation verification...");
const result = analyzeExistingSchedule(mockData);
console.log(`Allocated: ${result.allocatedTotal} (Expected: 1)`);
console.log(`Invalid: ${result.invalidCount} (Expected: 1)`);

if (result.allocatedTotal === 1 && result.invalidCount === 1) {
    console.log("✅ SUCCESS: Ghost allocation correctly filtered out.");
} else {
    console.error("❌ FAILURE: Counts are wrong.");
    process.exit(1);
}
