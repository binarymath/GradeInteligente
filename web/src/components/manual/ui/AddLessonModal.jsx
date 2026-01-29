
import React from 'react';
import { X, Save } from 'lucide-react';
import { DAYS } from '../../../utils';

const AddLessonModal = ({
    show,
    onClose,
    onSave,
    selectedCell,
    data,
    newEntry,
    setNewEntry,
    availableSlots
}) => {
    const [conflict, setConflict] = React.useState(null);

    React.useEffect(() => {
        if (!selectedCell || !newEntry.teacherId || !data.schedule) {
            setConflict(null);
            return;
        }

        const { dayIdx, slotIdx, classId } = selectedCell;
        const timeKey = `${DAYS[dayIdx]}-${slotIdx}`; // Or direct slotIdx check

        // Check if teacher is busy in OTHER class
        // Iterate schedule
        let foundConflict = null;
        for (const [key, entry] of Object.entries(data.schedule)) {
            if (entry.teacherId === newEntry.teacherId) {
                // Check time match
                // Logic must match GridTable/Scheduler: compare timeKey
                // Entry timeKey might be "Segunda-0" or "0-0" depending on legacy.
                // Best to match exactly what we use.
                // Check entry.timeKey vs current timeKey.
                // Note: data.schedule keys are "classId-day-slot" usually.

                // entry.timeKey is usually "Segunda-0". 
                // Let's assume strict equality for now or parse.
                // "Segunda-0" vs "Segunda-0".

                const entryTimeParts = entry.timeKey.split('-');
                const myTimeParts = timeKey.split('-');
                // Compare Days (Name or Index causes issues, ensure consistency)
                // In ManualEditSection we save as `${dayName}-${slotIdx}`.

                // Let's compare raw parts if possible or use helper.
                if (entry.timeKey === `${DAYS[dayIdx]}-${slotIdx}`) {
                    if (entry.classId !== classId) {
                        foundConflict = {
                            key,
                            classId: entry.classId,
                            className: data.classes.find(c => c.id === entry.classId)?.name || 'Outra Turma',
                            subjectName: data.subjects.find(s => s.id === entry.subjectId)?.name || 'Matéria'
                        };
                        break;
                    }
                }
            }
        }
        setConflict(foundConflict);

    }, [newEntry.teacherId, selectedCell, data]);

    // Filters Logic
    const classActivities = React.useMemo(() => {
        if (!selectedCell) return [];
        return data.activities.filter(a => a.classId === selectedCell.classId);
    }, [data.activities, selectedCell]);

    const filteredTeachers = React.useMemo(() => {
        if (!selectedCell) return []; // If selectedCell is null, classActivities will be empty, so this will naturally be empty.
        let acts = classActivities;
        if (newEntry.subjectId) {
            acts = acts.filter(a => a.subjectId === newEntry.subjectId);
        }
        const ids = new Set(acts.map(a => a.teacherId));
        return data.teachers.filter(t => ids.has(t.id));
    }, [classActivities, newEntry.subjectId, data.teachers, selectedCell]);

    const filteredSubjects = React.useMemo(() => {
        if (!selectedCell) return []; // If selectedCell is null, classActivities will be empty, so this will naturally be empty.
        let acts = classActivities;
        if (newEntry.teacherId) {
            acts = acts.filter(a => a.teacherId === newEntry.teacherId);
        }
        const ids = new Set(acts.map(a => a.subjectId));
        return data.subjects.filter(s => ids.has(s.id));
    }, [classActivities, newEntry.teacherId, data.subjects, selectedCell]);

    const handleSave = () => {
        // Pass conflict info to parent if exists
        onSave(conflict ? { conflictKey: conflict.key } : null);
    };

    if (!show || !selectedCell) return null;

    const targetClass = data.classes.find(c => c.id === selectedCell.classId);
    if (!targetClass) return null;


    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
            <div className="bg-white rounded-lg shadow-xl w-96 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-slate-800">Adicionar Aula</h3>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-red-500" /></button>
                </div>

                <div className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded text-sm text-slate-600">
                        <div>Turma: <strong>{targetClass.name}</strong></div>
                        <div>Horário: <strong>{DAYS[selectedCell.dayIdx]} - {data.timeSlots[selectedCell.slotIdx]?.start}</strong></div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Professor</label>
                        <select
                            className="w-full border p-2 rounded text-sm"
                            value={newEntry.teacherId}
                            onChange={e => setNewEntry({ ...newEntry, teacherId: e.target.value })}
                        >
                            <option value="">Selecione...</option>
                            {filteredTeachers.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Matéria</label>
                        <select
                            className="w-full border p-2 rounded text-sm disabled:opacity-50"
                            value={newEntry.subjectId}
                            onChange={e => setNewEntry({ ...newEntry, subjectId: e.target.value })}
                            disabled={!newEntry.teacherId}
                        >
                            <option value="">Selecione...</option>
                            {(availableSlots || []).filter(s => filteredSubjects.some(fs => fs.id === s.subjectId)).map(s => (
                                <option key={s.subjectId} value={s.subjectId}>
                                    {s.subjectName} ({s.allocated}/{s.total})
                                </option>
                            ))}
                            <option disabled>---</option>
                            {filteredSubjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {conflict && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                            <strong>⚠️ Conflito Detectado:</strong>
                            <div className="mt-1">
                                O professor já está alocado na turma <strong>{conflict.className}</strong> ({conflict.subjectName}).
                            </div>
                            <div className="mt-1 font-bold">
                                Salvar irá REMOVER a aula da outra turma.
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={!newEntry.teacherId || !newEntry.subjectId}
                        className={`w-full py-2 text-white rounded font-bold hover:brightness-110 disabled:bg-slate-300 transition-colors flex items-center justify-center gap-2 ${conflict ? 'bg-amber-600' : 'bg-indigo-600'}`}
                    >
                        <Save size={16} /> {conflict ? 'Substituir e Corrigir' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddLessonModal;
