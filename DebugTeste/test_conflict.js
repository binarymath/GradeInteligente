
const { smartRepairAsync } = require('./web/src/services/scheduleService');

// Mock data
const timeSlots = [
    { id: 'ts1', start: '07:00', end: '07:50', type: 'aula' },
    { id: 'ts2', start: '07:50', end: '08:40', type: 'aula' },
    { id: 'ts3', start: '08:40', end: '09:30', type: 'aula' }, // The conflict slot
];

const teachers = [
    { id: 't1', name: 'Professor John' }
];

const classes = [
    { id: 'c1', name: 'Class 1A', shift: 'Manhã', activeSlots: ['ts1', 'ts2', 'ts3'] },
    { id: 'c2', name: 'Class 1B', shift: 'Manhã', activeSlots: ['ts1', 'ts2', 'ts3'] }
];

const subjects = [
    { id: 's1', name: 'Math' },
    { id: 's2', name: 'Artes' }
];

const schedule = {
    // Class 1A: Math with Professor John at 08:40 (Day 0 - Monday)
    'c1-Segunda-2': {
        classId: 'c1',
        subjectId: 's1',
        teacherId: 't1',
        dayIdx: 0,
        slotIdx: 2
    },
    // Class 1B: Artes with Professor John at 08:40 (Day 0 - Monday)
    'c2-Segunda-2': {
        classId: 'c2',
        subjectId: 's2',
        teacherId: 't1',
        dayIdx: 0,
        slotIdx: 2
    }
};

const data = {
    timeSlots,
    teachers,
    classes,
    subjects,
    schedule,
    activities: [] // Not needed for conflict detection test
};

// Mock set functions
const setData = (cb) => {
    if (typeof cb === 'function') {
        const newData = cb(data);
        console.log('setData called with schedule update keys:', Object.keys(newData.schedule));
        data.schedule = newData.schedule;
    } else {
        console.log('setData called directly');
    }
};
const setGenerationLog = (log) => console.log('LOG:', log);
const setRepairing = (val) => console.log('Repairing:', val);

// Run
console.log('Starting smartRepairAsync test...');
try {
    smartRepairAsync(data, setData, setGenerationLog, setRepairing).then(() => {
        console.log('Finished.');

        // Check if one was removed
        const keys = Object.keys(data.schedule);
        console.log('Final schedule keys:', keys);
        if (keys.length === 1) {
            console.log('SUCCESS: One entry was removed.');
        } else if (keys.length === 2) {
            console.log('FAILURE: Both entries remain.');
        } else {
            console.log('Unexpected count:', keys.length);
        }
    });
} catch (e) {
    console.error(e);
}
