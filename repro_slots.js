
const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

// Mock Data
const mockTimeSlots = [
    { id: 'slot_1', start: '08:00', end: '09:00' }, // Index 0
    { id: 'slot_2', start: '09:00', end: '10:00' }, // Index 1
    { id: 'slot_3', start: '12:15', end: '13:05' }, // Index 2
];

const mockClasses = [
    {
        id: 'class_default', // No config
        name: 'Default Class (No Config)',
        activeSlotsByDay: {},
        activeSlots: []
    },
    {
        id: 'class_legacy', // Legacy activeSlots
        name: 'Legacy Class',
        activeSlotsByDay: undefined, // Simulating undefined
        activeSlots: ['slot_1', 'slot_3'] // Active on Mon-Fri
    },
    {
        id: 'class_configured', // New Config
        name: 'Configured Class (Friday Only)',
        activeSlotsByDay: {
            4: ['slot_3'] // Friday 12:15 only
        },
        activeSlots: []
    },
    {
        id: 'class_empty_config', // Explicitly empty config?
        name: 'Empty Config Class',
        activeSlotsByDay: {}, // User unchecked everything
        activeSlots: []
    }
];

const isSlotActiveLocal = (cls, dayIdx, slotIdx) => {
    const slotObj = mockTimeSlots[slotIdx];
    const slotId = slotObj ? slotObj.id : String(slotIdx);

    // PROPOSED FIX: Check existence, not keys length
    if (cls.activeSlotsByDay && typeof cls.activeSlotsByDay === 'object') {
        const activeForDay = cls.activeSlotsByDay[dayIdx];
        // Force boolean return
        return !!(activeForDay && Array.isArray(activeForDay) && activeForDay.includes(slotId));
    }

    // Fallback for Legacy (undefined activeSlotsByDay)
    if (cls.activeSlots && Array.isArray(cls.activeSlots) && cls.activeSlots.length > 0) {
        return cls.activeSlots.includes(slotId);
    }

    // Last Resort Default
    return true;
};

// Test
console.log('--- Testing isSlotActiveLocal (Proposed Fix) ---');

mockClasses.forEach(cls => {
    console.log(`\nClass: ${cls.name}`);
    const activeCount = [];
    DAYS.forEach((day, dIdx) => {
        mockTimeSlots.forEach((slot, sIdx) => {
            const active = isSlotActiveLocal(cls, dIdx, sIdx);
            if (active) {
                console.log(`  Day: ${day}, Slot: ${slot.start} (${slot.id}) -> ACTIVE`);
                activeCount.push(1);
            }
        });
    });
    if (activeCount.length === 0) console.log('  (No Active Slots)');
});
