
import { DAYS } from '../../utils';

// Helper para verificar se slot é ativo
export const isSlotActiveLocal = (data, classId, dayIdx, slotIdx) => {
    const cls = data.classes.find(c => c.id === classId);
    if (!cls) return false;
    const slotObj = data.timeSlots[slotIdx];
    const slotId = slotObj ? slotObj.id : String(slotIdx);

    if (cls.activeSlotsByDay && typeof cls.activeSlotsByDay === 'object') {
        const activeForDay = cls.activeSlotsByDay[dayIdx];
        return !!(activeForDay && Array.isArray(activeForDay) && activeForDay.includes(slotId));
    }
    if (cls.activeSlots && Array.isArray(cls.activeSlots) && cls.activeSlots.length > 0) {
        return cls.activeSlots.includes(slotId);
    }
    return true;
};

// Helper para converter horário "HH:MM" em minutos
export const timeToMinutes = (time) => {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

// Helper para detectar conflito de horário real (overlap)
export const findTeacherConflict = (data, teacherId, dayIdx, start, end, excludeClassId = null) => {
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);

    // Itera sobre todo o schedule
    const conflictKey = Object.keys(data.schedule || {}).find(key => {
        const entry = data.schedule[key];

        if (entry.teacherId !== teacherId) return false;
        if (excludeClassId && entry.classId === excludeClassId) return false;

        // Recupera dia e horários da entry
        let entryDayIdx = -1;
        let entryStart = "00:00";
        let entryEnd = "00:00";

        // Tenta parsear da Key
        const parts = key.split('-');
        if (parts.length >= 3) {
            const dStr = parts[parts.length - 2];
            const sStr = parts[parts.length - 1];
            const dIdx = DAYS.indexOf(dStr);
            const sIdx = parseInt(sStr, 10);

            if (dIdx >= 0 && !isNaN(sIdx)) {
                entryDayIdx = dIdx;
                const sObj = data.timeSlots[sIdx];
                if (sObj) {
                    entryStart = sObj.start;
                    entryEnd = sObj.end;
                }
            }
        }

        // Se falhou parse da Key, tenta timeKey (melhor)
        if (entryDayIdx === -1 && entry.timeKey) {
            const tParts = entry.timeKey.split('-');
            const dIdx = DAYS.indexOf(tParts[0]);
            if (dIdx >= 0) {
                entryDayIdx = dIdx;
                const sIdx = parseInt(tParts[1], 10);
                const sObj = data.timeSlots[sIdx];
                if (sObj) {
                    entryStart = sObj.start;
                    entryEnd = sObj.end;
                }
            }
        }

        if (entryDayIdx !== dayIdx) return false;

        // Check Overlap
        const eStartMin = timeToMinutes(entryStart);
        const eEndMin = timeToMinutes(entryEnd);

        // (StartA < EndB) and (EndA > StartB)
        return (startMin < eEndMin && endMin > eStartMin);
    });

    return conflictKey;
};

// Helper para obter cor consistente da matéria
// Helper para obter cor consistente da matéria
export const getSubjectColor = (data, subjectId, COLORS) => {
    if (!subjectId) return { className: 'bg-slate-50 border border-slate-200 text-slate-400' };

    const subj = data.subjects.find(s => s.id === subjectId);
    if (!subj) return { className: 'bg-slate-50 border border-slate-200 text-slate-400' };

    // Se a matéria tem cor definida (HEX)
    if (subj.color && subj.color.startsWith('#')) {
        return {
            className: 'text-white font-semibold shadow-sm border border-black/10',
            style: { backgroundColor: subj.color, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }
        };
    }

    // Hash da string para pegar do array COLORS
    let hash = 0;
    for (let i = 0; i < subj.name.length; i++) {
        hash = subj.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COLORS.length;
    const palette = COLORS[index];

    // Retorna paleta sólida (usando bg e text definidos em COLORS)
    if (palette && palette.bg) {
        return { className: `${palette.bg} ${palette.text} border-2 ${palette.border} font-medium shadow-sm` };
    }

    // Fallback
    return { className: 'bg-gray-100 text-gray-800 border-gray-300' };
};
