
import { uid, DAYS } from '../utils';
import { getSubjectColor } from './colors';

// Generates ICS for a specific class (turma) using global events
export const generateICSForClass = (data, calendarSettings, classId) => {
    const cls = data.classes.find(c => c.id === classId);
    if (!cls) return;

    if (!data.schedule || Object.keys(data.schedule).length === 0) {
        alert('A grade ainda não foi gerada. Por favor, gere a grade antes de exportar a agenda.');
        return;
    }

    const parseDateInput = (dateStr) => {
        if (!dateStr) return new Date();
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    const schoolStart = parseDateInput(calendarSettings.schoolYearStart);
    const schoolEnd = parseDateInput(calendarSettings.schoolYearEnd);

    const formatICSTime = (date, h, m) => {
        const y = date.getFullYear();
        const mo = (date.getMonth() + 1).toString().padStart(2, '0');
        const dy = date.getDate().toString().padStart(2, '0');
        return `${y}${mo}${dy}T${h}${m}00`;
    };

    const now = new Date();
    const nowString = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const foldLine = (line) => {
        if (line.length <= 75) return line;
        let result = '';
        let remaining = line;
        while (remaining.length > 0) {
            const chunk = remaining.slice(0, 75);
            remaining = remaining.slice(75);
            result += chunk + '\r\n';
            if (remaining.length > 0) remaining = ' ' + remaining; // continuation with space
        }
        return result.trimEnd();
    };

    const cleanText = (str) => str ? str.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n') : '';

    let icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//GradeInteligente//AgendaEscolar//PT',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:Agenda Turma ${cleanText(cls.name)}`,
        'BEGIN:VTIMEZONE',
        'TZID:America/Sao_Paulo',
        'X-LIC-LOCATION:America/Sao_Paulo',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:-0300',
        'TZOFFSETTO:-0300',
        'TZNAME:-03',
        'DTSTART:19700101T000000',
        'END:STANDARD',
        'END:VTIMEZONE'
    ];

    Object.entries(data.schedule).forEach(([key, slot]) => {
        if (slot.classId !== cls.id) return;

        const parts = key.split('-');
        const dayIdx = DAYS.indexOf(parts[1]);
        const slotIdx = parseInt(parts[2]);

        // Safety check if day parsing failed
        if (dayIdx === -1) return;

        const timeSlot = data.timeSlots[slotIdx];
        if (!timeSlot || timeSlot.type !== 'aula') return;

        const subject = data.subjects.find(s => s.id === slot.subjectId);
        const teacher = data.teachers.find(t => t.id === slot.teacherId);
        if (!subject || !teacher) return;

        // Find first occurrence date for this weekday inside school period
        let eventDate = new Date(schoolStart);
        const targetJSDay = (dayIdx + 1) % 7;
        let addDays = (targetJSDay - eventDate.getDay() + 7) % 7;
        eventDate.setDate(eventDate.getDate() + addDays);
        if (eventDate > schoolEnd) return;

        const [startH, startM] = timeSlot.start.split(':');
        const [endH, endM] = timeSlot.end.split(':');

        // Exclusion dates from events (Ferias/Feriado)
        let exDates = [];
        (calendarSettings.events || []).forEach(evt => {
            if (!evt.start || !evt.end) return;
            const evtStart = parseDateInput(evt.start);
            const evtEnd = parseDateInput(evt.end);

            // Walk through each weekly occurrence of this weekday inside the event range
            let cursor = new Date(evtStart);
            let diff = (targetJSDay - cursor.getDay() + 7) % 7;
            cursor.setDate(cursor.getDate() + diff);
            while (cursor <= evtEnd) {
                if (cursor >= evtStart) {
                    exDates.push(formatICSTime(cursor, startH, startM));
                }
                cursor.setDate(cursor.getDate() + 7);
            }
        });

        const color = getSubjectColor(subject.id, subject.name);

        icsLines.push('BEGIN:VEVENT');
        icsLines.push(`UID:${uid()}@gradeinteligente.com`);
        icsLines.push(`DTSTAMP:${nowString}`);
        icsLines.push(`SUMMARY:${cleanText(subject.name)}`);
        icsLines.push(`DESCRIPTION:${cleanText('Professor(a): ' + teacher.name)}`);
        icsLines.push(`CATEGORIES:${cleanText(subject.name)}`);
        icsLines.push(`COLOR:${color.bg}`);
        icsLines.push(`X-APPLE-CALENDAR-COLOR:${color.bg}`);
        icsLines.push(`DTSTART;TZID=America/Sao_Paulo:${formatICSTime(eventDate, startH, startM)}`);
        icsLines.push(`DTEND;TZID=America/Sao_Paulo:${formatICSTime(eventDate, endH, endM)}`);

        const untilDate = new Date(schoolEnd);
        untilDate.setHours(23, 59, 59);
        const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        icsLines.push(`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`);

        exDates.forEach(ex => {
            icsLines.push(`EXDATE;TZID=America/Sao_Paulo:${ex}`);
        });
        icsLines.push('END:VEVENT');
    });

    icsLines.push('END:VCALENDAR');
    const finalContent = icsLines.map(foldLine).join('\r\n');
    const blob = new Blob([finalContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `Agenda_${cls.name.replace(/\s+/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Generates ICS for a specific teacher using global events
export const generateICSForTeacher = (data, calendarSettings, teacherId) => {
    const teacher = data.teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    if (!data.schedule || Object.keys(data.schedule).length === 0) {
        alert('A grade ainda não foi gerada. Por favor, gere a grade antes de exportar a agenda.');
        return;
    }

    const parseDateInput = (dateStr) => {
        if (!dateStr || dateStr.length !== 10) return null; // Simple validation 'YYYY-MM-DD'
        const [y, m, d] = dateStr.split('-').map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    };

    const schoolStart = parseDateInput(calendarSettings.schoolYearStart);
    const schoolEnd = parseDateInput(calendarSettings.schoolYearEnd);

    if (!schoolStart || !schoolEnd || isNaN(schoolStart.getTime()) || isNaN(schoolEnd.getTime())) {
        alert('Datas do Período Calendário inválidas. Verifique a configuração.');
        return;
    }

    const formatICSTime = (date, h, m) => {
        const y = date.getFullYear();
        const mo = (date.getMonth() + 1).toString().padStart(2, '0');
        const dy = date.getDate().toString().padStart(2, '0');
        return `${y}${mo}${dy}T${h}${m}00`;
    };

    const now = new Date();
    const nowString = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const foldLine = (line) => {
        if (line.length <= 75) return line;
        let result = '';
        let remaining = line;
        while (remaining.length > 0) {
            const chunk = remaining.slice(0, 75);
            remaining = remaining.slice(75);
            result += chunk + '\r\n';
            if (remaining.length > 0) remaining = ' ' + remaining;
        }
        return result.trimEnd();
    };

    const cleanText = (str) => str ? str.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n') : '';

    let icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//GradeInteligente//AgendaEscolar//PT',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:Agenda Professor(a) ${cleanText(teacher.name)}`,
        'BEGIN:VTIMEZONE',
        'TZID:America/Sao_Paulo',
        'X-LIC-LOCATION:America/Sao_Paulo',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:-0300',
        'TZOFFSETTO:-0300',
        'TZNAME:-03',
        'DTSTART:19700101T000000',
        'END:STANDARD',
        'END:VTIMEZONE'
    ];

    let eventCount = 0;

    Object.entries(data.schedule).forEach(([key, slot]) => {
        if (slot.teacherId !== teacher.id) return;

        const parts = key.split('-');
        const dayIdx = DAYS.indexOf(parts[1]);
        const slotIdx = parseInt(parts[2]);

        // Safety check if day parsing failed
        if (dayIdx === -1) return;

        const timeSlot = data.timeSlots[slotIdx];
        if (!timeSlot || timeSlot.type !== 'aula') return;

        const subject = data.subjects.find(s => s.id === slot.subjectId);
        const cls = data.classes.find(c => c.id === slot.classId);
        if (!subject || !cls) return;

        let eventDate = new Date(schoolStart);
        const targetJSDay = (dayIdx + 1) % 7;
        let addDays = (targetJSDay - eventDate.getDay() + 7) % 7;
        eventDate.setDate(eventDate.getDate() + addDays);
        if (eventDate > schoolEnd) return;

        const [startH, startM] = timeSlot.start.split(':');
        const [endH, endM] = timeSlot.end.split(':');

        let exDates = [];
        (calendarSettings.events || []).forEach(evt => {
            if (!evt.start || !evt.end) return;
            const evtStart = parseDateInput(evt.start);
            const evtEnd = parseDateInput(evt.end);
            if (!evtStart || !evtEnd) return;

            let cursor = new Date(evtStart);
            // Align cursor to this weekday
            let diff = (targetJSDay - cursor.getDay() + 7) % 7;
            cursor.setDate(cursor.getDate() + diff);

            while (cursor <= evtEnd) {
                if (cursor >= evtStart) {
                    exDates.push(formatICSTime(cursor, startH, startM));
                }
                cursor.setDate(cursor.getDate() + 7);
            }
        });

        const color = getSubjectColor(subject.id, subject.name);

        eventCount++;
        icsLines.push('BEGIN:VEVENT');
        icsLines.push(`UID:${uid()}@gradeinteligente.com`);
        icsLines.push(`DTSTAMP:${nowString}`);
        icsLines.push(`SUMMARY:${cleanText(subject.name + ' (' + cls.name + ')')}`);
        icsLines.push(`DESCRIPTION:${cleanText('Turma: ' + cls.name)}`);
        icsLines.push(`CATEGORIES:${cleanText(subject.name)}`);
        icsLines.push(`COLOR:${color.bg}`);
        icsLines.push(`X-APPLE-CALENDAR-COLOR:${color.bg}`);
        icsLines.push(`DTSTART;TZID=America/Sao_Paulo:${formatICSTime(eventDate, startH, startM)}`);
        icsLines.push(`DTEND;TZID=America/Sao_Paulo:${formatICSTime(eventDate, endH, endM)}`);

        const untilDate = new Date(schoolEnd);
        untilDate.setHours(23, 59, 59);
        const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        icsLines.push(`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`);

        exDates.forEach(ex => {
            icsLines.push(`EXDATE;TZID=America/Sao_Paulo:${ex}`);
        });
        icsLines.push('END:VEVENT');
    });

    // Adicionar Eventos Semanais Personalizados do Professor (Almoço, Café, ATPCG, etc.)
    (calendarSettings.teacherFixedEvents || []).forEach(evt => {
        if (evt.teacherId !== teacher.id) return;

        const timeSlot = data.timeSlots[evt.slotIdx];
        if (!timeSlot) return;

        const targetJSDay = (evt.dayIdx + 1) % 7;
        let eventDate = new Date(schoolStart);
        let addDays = (targetJSDay - eventDate.getDay() + 7) % 7;
        eventDate.setDate(eventDate.getDate() + addDays);
        if (eventDate > schoolEnd) return;

        const [startH, startM] = timeSlot.start.split(':');
        const [endH, endM] = timeSlot.end.split(':');

        eventCount++;
        icsLines.push('BEGIN:VEVENT');
        icsLines.push(`UID:${uid()}@gradeinteligente.com`);
        icsLines.push(`DTSTAMP:${nowString}`);
        icsLines.push(`SUMMARY:${cleanText(evt.title)}`);
        icsLines.push(`DESCRIPTION:${cleanText(evt.title + ' (Recorrente)')}`);
        icsLines.push(`DTSTART;TZID=America/Sao_Paulo:${formatICSTime(eventDate, startH, startM)}`);
        icsLines.push(`DTEND;TZID=America/Sao_Paulo:${formatICSTime(eventDate, endH, endM)}`);

        const untilDate = new Date(schoolEnd);
        untilDate.setHours(23, 59, 59);
        const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        icsLines.push(`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`);

        // Excluir datas de férias/feriados para estes eventos também
        (calendarSettings.events || []).forEach(globalEvt => {
            if (!globalEvt.start || !globalEvt.end) return;
            const evtStart = parseDateInput(globalEvt.start);
            const evtEnd = parseDateInput(globalEvt.end);
            if (!evtStart || !evtEnd) return;

            let cursor = new Date(evtStart);
            let diff = (targetJSDay - cursor.getDay() + 7) % 7;
            cursor.setDate(cursor.getDate() + diff);

            while (cursor <= evtEnd) {
                if (cursor >= evtStart) {
                    icsLines.push(`EXDATE;TZID=America/Sao_Paulo:${formatICSTime(cursor, startH, startM)}`);
                }
                cursor.setDate(cursor.getDate() + 7);
            }
        });

        icsLines.push('END:VEVENT');
    });

    if (eventCount === 0) {
        alert(`Nenhuma aula ou evento encontrado para o professor ${teacher.name} no período letivo configurado.`);
        return;
    }

    icsLines.push('END:VCALENDAR');
    const finalContent = icsLines.map(foldLine).join('\r\n');

    console.log('--- ICS Content Start ---');
    console.log(finalContent);
    console.log('--- ICS Content End ---');

    const blob = new Blob([finalContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `Agenda_${teacher.name.replace(/\s+/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
