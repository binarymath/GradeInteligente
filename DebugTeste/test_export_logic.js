
const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

const mockData = {
    classes: [{ id: 'TURMA1', name: 'Turma 1', activeSlots: ['slot1', 'slot2'] }],
    teachers: [{ id: 'PROF1', name: 'Prof 1' }],
    subjects: [{ id: 'MAT1', name: 'Matemática' }],
    timeSlots: [
        { id: 'slot1', type: 'aula', start: '08:00', end: '09:00' },
        { id: 'slot2', type: 'aula', start: '09:00', end: '10:00' }
    ],
    schedule: {
        'TURMA1-Segunda-0': {
            classId: 'TURMA1',
            teacherId: 'PROF1',
            subjectId: 'MAT1',
            timeKey: 'Segunda-0'
        }
    }
};

function testExportExcelLogic(viewMode, selectedEntity, data) {
    const rows = [["Turma", "Dia", "Início", "Fim", "Matéria", "Professor"]];
    const log = [];

    Object.entries(data.schedule).forEach(([key, slot]) => {
        log.push(`Checking key: ${key}`);
        if (viewMode === 'class' && slot.classId !== selectedEntity) return;

        const parts = key.split('-');
        // Logic from exporters.js
        const slotIdx = parseInt(parts[parts.length - 1]);
        const dayName = parts[parts.length - 2];

        log.push(`Parsed: slotIdx=${slotIdx}, dayName=${dayName}`);

        const timeSlot = data.timeSlots[slotIdx];
        if (!timeSlot) {
            log.push('TimeSlot not found');
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
            log.push('Row added');
        } else {
            log.push(`Missing refs: s=${!!subject}, t=${!!teacher}, c=${!!clsObj}`);
        }
    });
    return { rows, log };
}

function testExportPDFLogic(viewMode, selectedEntity, data, displayPeriods) {
    const log = [];
    const body = displayPeriods.map(slot => {
        const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
        const row = [`${slot.start} - ${slot.end}`];
        log.push(`Slot ${slot.id} -> absoluteIndex ${absoluteIndex}`);

        DAYS.forEach((_, dayIdx) => {
            const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;
            let cellContent = '';
            if (viewMode === 'class') {
                const scheduleKey = `${selectedEntity}-${timeKey}`;
                log.push(`Looking up: ${scheduleKey}`);
                const entry = data.schedule[scheduleKey];
                if (entry) {
                    const subj = data.subjects.find(s => s.id === entry.subjectId);
                    const teacher = data.teachers.find(t => t.id === entry.teacherId);
                    if (subj && teacher) {
                        cellContent = `${subj.name}\n(${teacher.name})`;
                    }
                }
            }
            row.push(cellContent);
        });
        return row;
    });
    return { body, log };
}

console.log("Testing Export Excel...");
const excelResult = testExportExcelLogic('class', 'TURMA1', mockData);
console.log(excelResult.rows.length > 1 ? "SUCCESS" : "FAILURE");
console.log(JSON.stringify(excelResult, null, 2));

console.log("\nTesting Export PDF...");
const pdfResult = testExportPDFLogic('class', 'TURMA1', mockData, mockData.timeSlots);
const hasContent = pdfResult.body.some(row => row.slice(1).some(cell => cell.length > 0));
console.log(hasContent ? "SUCCESS" : "FAILURE");
console.log(JSON.stringify(pdfResult, null, 2));
