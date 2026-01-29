import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';

const PendingSidebar = ({
    manualLog,
    pendingItems,
    handleResolveClick,
    slotAnalysis,
    summary,
    data
}) => {
    const [tooltip, setTooltip] = useState(null); // { x, y, allocations, total }

    const getAllocations = (item) => {
        if (!data || !data.schedule) return [];
        const allocs = [];
        const itemClassId = String(item.classId);
        const itemSubjectId = String(item.subjectId);

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

    const handleMouseEnter = (e, item) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const allocs = getAllocations(item);
        const total = (allocs.length || 0) + (item.missing || 0);

        setTooltip({
            x: rect.right + 10, // 10px to right of card
            y: rect.top,
            allocations: allocs,
            total
        });
    };

    const handleMouseLeave = () => {
        setTooltip(null);
    };

    return (
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden relative">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <AlertCircle size={16} className="text-orange-500" />
                    Resumo de Pendências
                </h3>
                {summary && (
                    <div className="text-xs text-slate-500 mt-1">
                        {summary.totalAllocated}/{summary.totalExpected} aulas alocadas ({summary.totalPending} faltantes)
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* LOG DE AÇÕES */}
                {manualLog.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Histórico Recente</h4>
                        <div className="space-y-1">
                            {manualLog.slice(0, 5).map((log, i) => (
                                <div key={i} className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 flex items-start gap-2">
                                    <span className="text-green-500 mt-0.5">✓</span>
                                    {log}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* LISTA DE PENDÊNCIAS */}
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Aulas Faltantes</h4>
                    {pendingItems.length === 0 ? (
                        <div className="text-sm text-green-600 flex items-center gap-2 bg-green-50 p-3 rounded-lg border border-green-100">
                            <span>🎉</span> Nenhuma pendência encontrada!
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pendingItems.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="bg-white border boundary-l-4 border-l-orange-400 border-slate-200 rounded p-3 shadow-sm hover:shadow-md transition-shadow relative cursor-default"
                                    onMouseEnter={(e) => handleMouseEnter(e, item)}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-slate-700 text-sm">{item.subjectName}</span>
                                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                                            -{item.missing}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 mb-2">
                                        {item.className} • {item.teacherName}
                                    </div>
                                    <button
                                        onClick={() => handleResolveClick(item)}
                                        className="w-full text-xs bg-indigo-50 text-indigo-700 py-1.5 rounded hover:bg-indigo-100 font-medium transition-colors cursor-pointer"
                                    >
                                        Resolver
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ANALISE DE SLOTS */}
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ocupação por Turma</h4>
                    <div className="space-y-1">
                        {slotAnalysis.map((line, i) => (
                            <div key={i} className="text-xs text-slate-600 font-mono bg-slate-50 px-2 py-1 rounded">
                                {line}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

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

export default PendingSidebar;
