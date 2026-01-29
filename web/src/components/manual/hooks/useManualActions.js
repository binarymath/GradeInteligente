
import { DAYS } from '../../../utils';

export const useManualActions = (data, setData, setManualLog, setResolveModal, setShowAddModal) => {

    const applySuggestion = (suggestion, resolveModalItem) => {
        const { classId } = suggestion;
        const { subjectId } = resolveModalItem;

        if (suggestion.type === 'direct') {
            const { dayIdx, slotIdx, teacherId } = suggestion;
            const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
            const scheduleKey = `${classId}-${timeKey}`;

            setData(prev => ({
                ...prev,
                schedule: {
                    ...(prev.schedule || {}),
                    [scheduleKey]: { teacherId, subjectId, classId, timeKey }
                }
            }));
            setManualLog(prev => [`Resolvido: +${data.subjects.find(s => s.id === subjectId)?.name} em ${DAYS[dayIdx]}`, ...prev]);

        } else if (suggestion.type === 'swap') {
            const { originalSlot, destSlot, targetTeacher, occupant } = suggestion;
            const keyOriginal = `${classId}-${originalSlot.timeKey}`;
            const keyDest = `${classId}-${destSlot.timeKey}`;

            setData(prev => {
                const newSchedule = { ...(prev.schedule || {}) };
                newSchedule[keyDest] = {
                    teacherId: occupant.teacherId,
                    subjectId: occupant.subjectId,
                    classId,
                    timeKey: destSlot.timeKey
                };
                newSchedule[keyOriginal] = {
                    teacherId: targetTeacher.id,
                    subjectId: subjectId,
                    classId,
                    timeKey: originalSlot.timeKey
                };
                return { ...prev, schedule: newSchedule };
            });
            setManualLog(prev => [`Troca: ${occupant.subjectName} movido p/ ${destSlot.day} ${destSlot.time}. +${data.subjects.find(s => s.id === subjectId)?.name} em ${originalSlot.day}`, ...prev]);

        } else if (suggestion.type === 'remote_move') {
            const { remoteMove, targetSlot, targetTeacher } = suggestion;
            const keyY_Old = remoteMove.originalKey;
            const keyY_New = `${remoteMove.classId}-${remoteMove.toTimeKey}`;
            const keyX_New = `${classId}-${targetSlot.timeKey}`;

            setData(prev => {
                const newSchedule = { ...(prev.schedule || {}) };
                const entryY = newSchedule[keyY_Old];
                delete newSchedule[keyY_Old];
                newSchedule[keyY_New] = { ...entryY, timeKey: remoteMove.toTimeKey };
                newSchedule[keyX_New] = { teacherId: targetTeacher.id, subjectId, classId, timeKey: targetSlot.timeKey };
                return { ...prev, schedule: newSchedule };
            });
            setManualLog(prev => [`Remoto: ${remoteMove.className} movido p/ ${remoteMove.toTime}. +${data.subjects.find(s => s.id === subjectId)?.name} aqui.`, ...prev]);

        } else if (suggestion.type === 'remote_swap') {
            const { remoteSwap, targetSlot, targetTeacher } = suggestion;
            const keyA = remoteSwap.teacherA.entryKey;
            const keyB = remoteSwap.teacherB.entryKey;
            const keyX = `${classId}-${targetSlot.timeKey}`;

            setData(prev => {
                const newSchedule = { ...(prev.schedule || {}) };
                const entryA = newSchedule[keyA];
                const entryB = newSchedule[keyB];
                const newKeyForA = `${remoteSwap.classId}-${remoteSwap.teacherB.timeKey}`;
                const newKeyForB = `${remoteSwap.classId}-${remoteSwap.teacherA.timeKey}`;

                delete newSchedule[keyA];
                delete newSchedule[keyB];

                newSchedule[newKeyForA] = { ...entryA, timeKey: remoteSwap.teacherB.timeKey };
                newSchedule[newKeyForB] = { ...entryB, timeKey: remoteSwap.teacherA.timeKey };

                newSchedule[keyX] = { teacherId: targetTeacher.id, subjectId, classId, timeKey: targetSlot.timeKey };
                return { ...prev, schedule: newSchedule };
            });
            setManualLog(prev => [`Remoto COMPLEXO: ${remoteSwap.teacherB.name} trocou com ${remoteSwap.teacherA.name} na ${remoteSwap.className}. +${data.subjects.find(s => s.id === subjectId)?.name} aqui.`, ...prev]);
        }
        setResolveModal(null);
    };

    const executeAddLesson = (scheduleKey, targetClass, timeKey, subjectName, teacherName, className, dayIdx, slot) => {
        // Implementação básica de adicionar/sobrescrever
        // (Requer newEntry e selectedCell dos inputs, mas aqui vamos receber argumentos prontos)
        // Para simplificar, AddLessonModal chamará setData diretamente ou este hook precisaria de mais args.
        // Vamos manter este hook para actions complexas como applySuggestion.
        // As ações simples podem ficar no componente ou num hook menor.
    };

    // Helper para remover aula
    const removeLesson = (dayIdx, slotIdx, classId) => {
        const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
        const scheduleKey = `${classId}-${timeKey}`;

        setData(prev => {
            const newSchedule = { ...prev.schedule };
            delete newSchedule[scheduleKey];
            return { ...prev, schedule: newSchedule };
        });
        setManualLog(prev => [`Removido: Aula removida manualmente`, ...prev]);
    };

    return { applySuggestion, removeLesson };
};
