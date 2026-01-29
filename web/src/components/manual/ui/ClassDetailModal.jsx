
import React from 'react';
import { X, Clock, Calendar } from 'lucide-react';
import { DAYS } from '../../../utils';
import { getSubjectColor } from '../utils';

const ClassDetailModal = ({ classId, data, onClose, COLORS }) => {
    if (!classId) return null;

    const classObj = data.classes.find(c => c.id === classId);
    if (!classObj) return null;

    // Helper to get entry
    const getEntry = (dayIdx, slotIdx) => {
        // Try direct key
        const key = `${classId}-${DAYS[dayIdx]}-${slotIdx}`;
        if (data.schedule && data.schedule[key]) return data.schedule[key];

        // Try iter (if needed, but grid usually uses direct keys now or we can use the same helper logic)
        // For read-only detail, iterating is fine if direct key fails, but direct key is primary.
        return Object.values(data.schedule || {}).find(e =>
            e.classId === classId &&
            (e.timeKey === `${DAYS[dayIdx]}-${slotIdx}` || e.timeKey === `${dayIdx}-${slotIdx}`)
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-[900px] max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-indigo-600 text-white">
                    <div>
                        <h2 className="text-2xl font-bold">{classObj.name}</h2>
                        <p className="text-indigo-100 text-sm mt-1">Grade Curricular Detalhada</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body - Single Class Grid */}
                <div className="p-6 overflow-auto bg-slate-50 flex-1">
                    <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-3 border-b bg-slate-50 text-left text-xs font-bold text-slate-500 w-24">
                                        Horário
                                    </th>
                                    {DAYS.map(day => (
                                        <th key={day} className="p-3 border-b border-l bg-slate-50 text-center text-xs font-bold text-slate-700 w-[18%]">
                                            {day}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.timeSlots.map((slot, slotIdx) => {
                                    if (slot.type !== 'aula') return null;

                                    return (
                                        <tr key={slotIdx} className="hover:bg-slate-50/50">
                                            <td className="p-2 border-b border-r text-xs font-mono text-slate-500 text-center bg-white">
                                                {slot.start} - {slot.end}
                                            </td>
                                            {DAYS.map((_, dayIdx) => {
                                                const entry = getEntry(dayIdx, slotIdx);

                                                if (!entry) {
                                                    return <td key={dayIdx} className="p-2 border-b border-r bg-slate-50/30"></td>;
                                                }

                                                const colorProps = getSubjectColor(data, entry.subjectId, COLORS);
                                                const subject = data.subjects.find(s => s.id === entry.subjectId);
                                                const teacher = data.teachers.find(t => t.id === entry.teacherId);

                                                return (
                                                    <td key={dayIdx} className="p-1 border-b border-r h-20 align-top">
                                                        <div
                                                            className={`h-full w-full rounded p-2 flex flex-col justify-center shadow-sm ${colorProps.className}`}
                                                            style={colorProps.style}
                                                        >
                                                            <div className="font-bold text-sm leading-tight text-center">{subject?.name}</div>
                                                            <div className="text-xs opacity-90 text-center mt-1">{teacher?.name}</div>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClassDetailModal;
