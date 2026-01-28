import { useState, useEffect } from 'react';
import { migrateData } from '../services/DataMigration';
import { cleanSchedule } from '../services/scheduleHelpers';

const INITIAL_STATE = {
    timeSlots: [],
    teachers: [],
    subjects: [],
    classes: [],
    activities: [],
    schedule: {},
    scheduleConflicts: []
};

export function useGradeData() {
    const [data, setData] = useState(INITIAL_STATE);
    const [calendarSettings, setCalendarSettings] = useState(() => {
        const curYear = new Date().getFullYear();
        return {
            schoolYearStart: `${curYear}-02-01`,
            schoolYearEnd: `${curYear}-12-15`,
            events: []
        };
    });

    // Load Persisted Data
    useEffect(() => {
        const loadPersisted = async () => {
            try {
                const lsData = localStorage.getItem('grade_data');
                if (lsData) {
                    const parsed = JSON.parse(lsData);
                    if (parsed && typeof parsed === 'object') {
                        let migratedData = migrateData(parsed);
                        if (migratedData) {
                            if (migratedData.schedule) {
                                migratedData.schedule = cleanSchedule(migratedData);
                            }
                            setData(prev => ({ ...prev, ...migratedData }));
                        }
                    }
                }

                const lsCalendar = localStorage.getItem('grade_calendar');
                if (lsCalendar) {
                    const parsed = JSON.parse(lsCalendar);
                    if (parsed && typeof parsed === 'object') setCalendarSettings(prev => ({ ...prev, ...parsed }));
                }
            } catch (e) {
                // ignore errors
            }
        };
        loadPersisted();
    }, []);

    // Save Persistence
    useEffect(() => {
        try {
            localStorage.setItem('grade_data', JSON.stringify(data));
        } catch (e) { }
    }, [data]);

    useEffect(() => {
        try {
            localStorage.setItem('grade_calendar', JSON.stringify(calendarSettings));
        } catch (e) { }
    }, [calendarSettings]);

    return {
        data, setData,
        calendarSettings, setCalendarSettings
    };
}
