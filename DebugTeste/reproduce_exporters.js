
const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

// Mock Data
const data = {
    classes: [{ id: 'c1', name: 'Turma A' }],
    teachers: [{ id: 't1', name: 'Prof X' }],
    subjects: [{ id: 's1', name: 'Mat' }],
    timeSlots: [
        { id: 'ts1', start: '07:00', end: '07:50', type: 'aula' },
        { id: 'ts2', start: '07:50', end: '08:40', type: 'aula' }
    ],
    schedule: {
        'c1-Segunda-0': {
            classId: 'c1', teacherId: 't1', subjectId: 's1', timeKey: 'Segunda-0'
        }
    }
};

const displayPeriods = data.timeSlots;
const viewMode = 'class';
const selectedEntity = 'c1';

console.log("--- Testing PDF Logic ---");

// Simulate PDF Body Generation
const body = displayPeriods.map(slot => {
    const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
    const row = [`${slot.start} - ${slot.end}`];

    if (slot.type !== 'aula') {
        return row; // Simplified
    }

    DAYS.forEach((_, dayIdx) => {
        const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;
        let cellContent = '';

        // Logic from exporters.js
        if (viewMode === 'class') {
            const scheduleKey = `${selectedEntity}-${timeKey}`;
            const entry = data.schedule[scheduleKey];
            console.log(`Checking key: ${scheduleKey}. Found: ${!!entry}`);
            if (entry) {
                const subj = data.subjects.find(s => s.id === entry.subjectId);
                const teacher = data.teachers.find(t => t.id === entry.teacherId);
                cellContent = `${subj.name}\n(${teacher.name})`;
            }
        }
        row.push(cellContent);
    });
    return row;
});

console.log("PDF Body Result:", JSON.stringify(body, null, 2));


console.log("\n--- Testing Excel Logic ---");
const rows = [["Turma", "Dia", "Início", "Fim", "Matéria", "Professor"]];

Object.entries(data.schedule).forEach(([key, slot]) => {
    if (viewMode === 'class' && slot.classId !== selectedEntity) return;

    const parts = key.split('-');
    // Logic from exporters.js
    // Format: ID-Day-Index
    // key is 'c1-Segunda-0'

    // In exporter: 
    // const slotIdx = parseInt(parts[parts.length - 1]);
    // const dayName = parts[parts.length - 2];

    // Let's trace this
    const slotIdx = parseInt(parts[parts.length - 1]);
    const dayName = parts[parts.length - 2];

    console.log(`Key: ${key}`);
    console.log(`Parts:`, parts);
    console.log(`slotIdx: ${slotIdx}, dayName: ${dayName}`);

    const timeSlot = data.timeSlots[slotIdx];
    if (!timeSlot) {
        console.log("TimeSlot not found");
        return;
    }

    const subject = data.subjects.find(s => s.id === slot.subjectId);
    const teacher = data.teachers.find(t => t.id === slot.teacherId);
    const clsObj = data.classes.find(c => c.id === slot.classId);

    if (subject && teacher && clsObj) {
        rows.push([
            clsObj.name,
            dayName,
            timeSlot.start,
            timeSlot.end,
            subject.name,
            teacher.name
        ]);
    }
});

console.log("Excel Rows Result:", JSON.stringify(rows, null, 2));
