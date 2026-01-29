
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { DAYS } from '../../../utils';
import { isSlotActiveLocal, getSubjectColor } from '../utils';

const GridTable = ({
    data,
    displayPeriods,
    editMode,
    selectedCell,
    manualLog,
    handleCellClick,
    handleRemoveLesson,
    COLORS,
    onClassClick,
    isMaximized
}) => {
    const [tooltip, setTooltip] = useState(null); // { x, y, allocations, total }

    const getScheduleEntry = (dayIdx, slot, classId) => {
        // 1. Tenta Key Direta "Class-Day-Slot"
        const keyDirect = `${classId}-${DAYS[dayIdx]}-${slot}`;
        if (data.schedule && data.schedule[keyDirect]) return data.schedule[keyDirect];

        // 2. Itera para achar por timeKey
        const entryKey = Object.keys(data.schedule || {}).find(k => {
            const e = data.schedule[k];
            if (e.classId !== classId) return false;

            // Check day
            if (e.timeKey === `${DAYS[dayIdx]}-${slot}` || e.timeKey === `${dayIdx}-${slot}`) return true;
            return false;
        });

        if (entryKey) return data.schedule[entryKey];
        return null;
    };

    const getAllocations = (classId, subjectId) => {
        if (!data || !data.schedule) return [];
        const allocs = [];
        const itemClassId = String(classId);
        const itemSubjectId = String(subjectId);

        for (const [key, entry] of Object.entries(data.schedule)) {
            if (String(entry.classId) === itemClassId && String(entry.subjectId) === itemSubjectId) {
                const timeKey = entry.timeKey || key.split('-').slice(1).join('-');
                if (timeKey) {
                    const [day, slotIdx] = timeKey.split('-');
                    const slot = data.timeSlots[parseInt(slotIdx)];
                    const timeLabel = slot ? `${slot.start} - ${slot.end}` : slotIdx;
                    allocs.push({ day, timeLabel, id: key });
                }
            }
        }

        const DAYS_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        return allocs.sort((a, b) => {
            const da = DAYS_ORDER.indexOf(a.day);
            const db = DAYS_ORDER.indexOf(b.day);
            if (da !== db) return da - db;
            return a.timeLabel.localeCompare(b.timeLabel);
        });
    };

    const handleMouseEnter = (e, classId, subjectId) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const allocs = getAllocations(classId, subjectId);
        // Find total expected
        const activity = data.activities.find(a => String(a.classId) === String(classId) && String(a.subjectId) === String(subjectId));
        const total = activity ? activity.quantity : '?';

        setTooltip({
            x: rect.right + 10,
            y: rect.top,
            allocations: allocs,
            total
        });
    };

    const handleMouseLeave = () => {
        setTooltip(null);
    };

    // Helper local para renderizar conteúdo da célula
    const renderCellContent = (dayIdx, slotIdx, classId) => {
        const entry = getScheduleEntry(dayIdx, slotIdx, classId);

        if (entry) {
            const subject = data.subjects.find(s => s.id === entry.subjectId);
            const teacher = data.teachers.find(t => t.id === entry.teacherId);
            const colorProps = getSubjectColor(data, entry.subjectId, COLORS);

            return (
                <div
                    className={`p-1.5 rounded text-xs h-full flex flex-col justify-center relative group transition-all ${colorProps.className}`}
                    style={colorProps.style}
                    onMouseEnter={(e) => handleMouseEnter(e, classId, entry.subjectId)}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="font-bold truncate leading-tight" title={subject?.name}>{subject?.name}</div>
                    <div className="text-[10px] truncate opacity-90 leading-tight mt-0.5" title={teacher?.name}>{teacher?.name}</div>

                    {editMode && (
                        <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-bl cursor-pointer hover:bg-red-500 hover:text-white"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveLesson(dayIdx, slotIdx, classId);
                            }}
                        >
                            <Trash2 size={12} />
                        </div>
                    )}
                </div>
            );
        }

        // Empty state in edit mode
        if (editMode) {
            const isSelected = selectedCell?.dayIdx === dayIdx && selectedCell?.slotIdx === slotIdx && selectedCell?.classId === classId;
            return (
                <div className={`h-full w-full flex items-center justify-center rounded border-2 border-dashed 
            ${isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 hover:border-indigo-200'} transition-colors`}>
                    <Plus size={14} className={isSelected ? 'text-indigo-500' : 'text-slate-300'} />
                </div>
            );
        }

        return null;
    };

    return (
        <div className={`overflow-auto pb-4 shadow-inner bg-slate-100 border rounded-lg transition-all duration-300 ${isMaximized ? 'h-[calc(100vh-40px)]' : 'max-h-[calc(100vh-220px)]'}`}>
            <table className="w-full border-collapse relative">
                <thead className="sticky top-0 z-50 shadow-sm">
                    <tr>
                        <th className="p-3 border-b border-r bg-white text-left text-xs font-bold text-slate-700 w-24 sticky left-0 z-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            Horário
                        </th>
                        {data.classes.map(cls => (
                            <th
                                key={cls.id}
                                className="p-2 border-b border-r bg-slate-50 text-center text-xs font-bold text-slate-700 min-w-[120px] cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                onClick={() => onClassClick && onClassClick(cls.id)}
                                title="Ver grade detalhada"
                            >
                                {cls.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {DAYS.map((day, dayIdx) => (
                        <React.Fragment key={day}>
                            {/* Sticky Day Header Row */}
                            <tr className="bg-slate-200/90 shadow-sm sticky top-[41px] z-40">
                                <td colSpan={data.classes.length + 1} className="py-1 px-3 text-xs font-bold text-slate-700 uppercase tracking-wider sticky left-0 z-40 bg-slate-200/90 border-b border-t border-slate-300 backdrop-blur-sm">
                                    {day}
                                </td>
                            </tr>

                            {data.timeSlots.map((slot, slotIdx) => {
                                if (slot.type !== 'aula') return null;

                                return (
                                    <tr key={`${day}-${slotIdx}`} className="bg-white hover:bg-slate-50">
                                        <td className="p-2 border-r border-b text-xs text-center font-mono text-slate-500 sticky left-0 bg-white z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            {slot.start} - {slot.end}
                                        </td>
                                        {data.classes.map(cls => {
                                            const isActive = isSlotActiveLocal(data, cls.id, dayIdx, slotIdx);

                                            // Empty/Ghost Slot
                                            if (!isActive) {
                                                return <td key={cls.id} className="p-0 border-r border-b bg-slate-100/50 relative diagonal-stripe"></td>;
                                            }

                                            // Determine cell style based on usage
                                            const entry = getScheduleEntry(dayIdx, slotIdx, cls.id);
                                            const cellBg = entry ? '' : (editMode ? 'hover:bg-indigo-50/50 cursor-pointer' : '');

                                            return (
                                                <td
                                                    key={cls.id}
                                                    className={`p-1 border-r border-b h-16 align-top transition-colors ${cellBg}`}
                                                    onClick={() => editMode && handleCellClick(dayIdx, slotIdx, cls.id)}
                                                >
                                                    {renderCellContent(dayIdx, slotIdx, cls.id)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>

            {/* PORTAL TOOLTIP */}
            {tooltip && createPortal(
                <div
                    className="fixed z-[9999] w-64 bg-slate-800 text-white text-xs rounded-lg shadow-xl p-3 pointer-events-none animate-in fade-in zoom-in-95 duration-200"
                    style={{ top: tooltip.y, left: tooltip.x }}
                >
                    <div className="font-bold mb-2 border-b border-slate-600 pb-1 flex justify-between">
                        <span>Alocações Atuais</span>
                        <span className="text-emerald-400">{tooltip.allocations.length}/{tooltip.total}</span>
                    </div>
                    {tooltip.allocations.length === 0 ? (
                        <div className="text-slate-400 italic">Nenhuma aula alocada ainda.</div>
                    ) : (
                        <div className="space-y-1">
                            {tooltip.allocations.map((alloc, i) => (
                                <div key={i} className="flex justify-between">
                                    <span className="font-medium text-slate-200">{alloc.day}</span>
                                    <span className="text-slate-400">{alloc.timeLabel}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Seta indicativa (lado esquerdo) */}
                    <div className="absolute top-4 -left-1 w-2 h-2 bg-slate-800 transform rotate-45"></div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default GridTable;
