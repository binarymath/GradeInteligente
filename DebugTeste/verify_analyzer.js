
import { analyzeExistingSchedule } from './web/src/services/scheduleAnalyzer.js';
import { DAYS } from './web/src/utils.js';

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
    subjects: [
        { id: 'sub1', name: 'Mathematics' }
    ],
    teachers: [
        { id: 'tea1', name: 'Mr. Teacher' }
    ],
    activities: [
        { id: 'act1', classId: 'class1', subjectId: 'sub1', quantity: 1 }
    ],
    // Schedule: only slot0 is booked. slot1 should be detected as empty.
    schedule: {
        'class1-Segunda-0': {
            classId: 'class1',
            subjectId: 'sub1',
            teacherId: 'tea1',
            dayIdx: 0,
            slotIdx: 0
        }
    }
};

// Mock dependencies (scheduleHelpers) if they are not picked up correctly by node, 
// but since we are running in the project context with babel/etc via npm run test or node,
// we might need to be careful about imports.
// For now, let's assume we can import if we run it as a test or similar.
// Actually, I'll try to run this with node, but I need to handle ES modules.
// The project has package.json so "type": "module" might be set or not.
// Let's check package.json first. 

console.log("Running analysis...");
try {
    const result = analyzeExistingSchedule(mockData);
    console.log("Analysis Result Log:");
    result.log.forEach(l => console.log(l));

    const emptySlots = result.issues.find(i => i.type === 'empty_slots');
    if (emptySlots && emptySlots.count === 1 && emptySlots.details[0].slotIdx === 1) {
        console.log("SUCCESS: Detected empty slot correctly!");
    } else {
        console.error("FAILURE: Did not detect empty slot as expected.", JSON.stringify(result.issues, null, 2));
        process.exit(1);
    }
} catch (e) {
    console.error("Error running analysis:", e);
    process.exit(1);
}
