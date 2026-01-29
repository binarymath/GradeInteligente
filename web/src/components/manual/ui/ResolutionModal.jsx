
import React from 'react';
import { X, ArrowRight } from 'lucide-react';

const ResolutionModal = ({ resolveModal, onClose, onApply, data }) => {
    if (!resolveModal) return null;

    const { item, suggestions } = resolveModal;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
            <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-indigo-50 rounded-t-lg">
                    <h3 className="font-bold text-indigo-900">Resolver: {item.subjectName}</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1">
                    <p className="text-sm text-slate-600 mb-4">
                        Turma: <strong>{item.className}</strong> • Matéria: <strong className="text-indigo-600">{item.subjectName}</strong> • Prof: <strong>{item.teacherName}</strong>. Escolha uma solução:
                    </p>

                    {suggestions.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                            Nenhuma solução automática encontrada. Tente liberação manual.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => onApply(s)}
                                    className="w-full p-3 border rounded-lg hover:bg-slate-50 text-left transition-colors flex items-center justify-between group"
                                >
                                    <div className="text-xs">
                                        {s.type === 'direct' && (
                                            <div>
                                                <span className="font-bold text-green-700 uppercase mr-2 text-[10px]">Livre</span>
                                                Adicionar em <strong>{s.day} {s.time}</strong>
                                                <div className="text-slate-500 mt-1">Prof: {s.teacherName}</div>
                                            </div>
                                        )}
                                        {s.type === 'swap' && (
                                            <div>
                                                <span className="font-bold text-amber-600 uppercase mr-2 text-[10px]">Troca Local</span>
                                                Mover <strong>{s.occupant.subjectName}</strong> <span className="text-slate-500 text-[10px]">(Prof. {s.occupant.teacherName})</span> para {s.destSlot.day} {s.destSlot.time}
                                                <div className="text-slate-500 mt-0.5 ml-2 pl-2 border-l-2 border-slate-200">
                                                    ↳ Liberando {s.originalSlot.day} {s.originalSlot.time} para {item.subjectName}
                                                </div>
                                            </div>
                                        )}
                                        {s.type === 'remote_move' && (
                                            <div>
                                                <span className="font-bold text-blue-600 uppercase mr-2 text-[10px]">Mover Remoto</span>
                                                Na turma <strong>{s.remoteMove.className}</strong>: Mover {data.subjects.find(sub => sub.id === s.remoteMove.subjectId)?.name || 'Aula'} <span className="text-slate-500 text-[10px]">(Prof. {data.teachers.find(t => t.id === s.remoteMove.teacherId)?.name})</span> p/ {s.remoteMove.toTime.split(' ')[0]}
                                                <div className="text-slate-500 mt-0.5 ml-2 pl-2 border-l-2 border-slate-200">
                                                    ↳ Prof {s.targetTeacher.name} fica livre para {s.targetSlot.day} {s.targetSlot.time}
                                                </div>
                                            </div>
                                        )}
                                        {s.type === 'remote_swap' && (
                                            <div>
                                                <span className="font-bold text-purple-600 uppercase mr-2 text-[10px]">Troca Remota</span>
                                                Na turma <strong>{s.remoteSwap.className}</strong>: Trocar Prof. {s.remoteSwap.teacherB.name} ↔ Prof. {s.remoteSwap.teacherA.name}
                                                <div className="text-slate-500 mt-0.5 ml-2 pl-2 border-l-2 border-slate-200">
                                                    ↳ Prof {s.targetTeacher.name} libera horários de {s.targetSlot.day}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-600" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ResolutionModal;
