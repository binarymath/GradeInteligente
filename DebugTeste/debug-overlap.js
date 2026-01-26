
const timeSlots = [
    { id: 's1', start: '07:50', end: '08:40', type: 'aula' },
    { id: 's2', start: '08:30', end: '09:20', type: 'aula' }
];

function _minutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

const bookedEntries = [
    { teacherId: 't1', dayIdx: 0, start: '07:50', end: '08:40' }
];

const candidateSlotIdx = 1; // 08:30-09:20
const teacherId = 't1';
const dayIdx = 0;

function check(teacherId, dayIdx, candidateSlotIdx) {
    const candidateSlot = timeSlots[candidateSlotIdx];
    const candStart = _minutes(candidateSlot.start);
    const candEnd = _minutes(candidateSlot.end);

    const teacherEntries = bookedEntries.filter(e => e.teacherId === teacherId && e.dayIdx === dayIdx);

    console.log(`[DEBUG] Check Teacher ${teacherId} Day ${dayIdx}. Candidate: ${candStart}-${candEnd}. Entries: ${teacherEntries.length}`);

    for (const entry of teacherEntries) {
        const entryStart = _minutes(entry.start);
        const entryEnd = _minutes(entry.end);

        console.log(`  -> Validating against entry: ${entryStart}-${entryEnd} (${entry.start}-${entry.end})`);

        const cond1 = candStart < entryEnd;
        const cond2 = candEnd > entryStart;
        console.log(`     candStart < entryEnd (${candStart} < ${entryEnd}) = ${cond1}`);
        console.log(`     candEnd > entryStart (${candEnd} > ${entryStart}) = ${cond2}`);

        if (cond1 && cond2) {
            console.log(`  -> CONFLICT DETECTED!`);
            return false;
        }
    }
    return true;
}

const result = check(teacherId, dayIdx, candidateSlotIdx);
console.log("Result:", result);
