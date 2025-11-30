import React, { useState, useMemo } from 'react';
import { Edit3, Trash2, Plus, X, Save, AlertCircle } from 'lucide-react';
import { DAYS, COLORS } from '../utils';

const ManualEditSection = ({ data, setData }) => {
  const [selectedClass, setSelectedClass] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null); // { dayIdx, slotIdx }
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState({ teacherId: '', subjectId: '' });

  // Filtrar apenas slots de aula
  const lessonSlots = useMemo(() => 
    data.timeSlots.filter(slot => slot.type === 'aula'),
    [data.timeSlots]
  );

  const handleCellClick = (dayIdx, slotIdx, classId = null) => {
    const targetClass = classId || selectedClass;
    if (!editMode || !targetClass || targetClass === 'all') return;
    setSelectedCell({ dayIdx, slotIdx, classId: targetClass });
    setShowAddModal(true);
  };

  const handleRemoveLesson = (dayIdx, slotIdx, classId = null) => {
    const targetClass = classId || selectedClass;
    if (!targetClass || targetClass === 'all') return;
    const timeKey = `${dayIdx}-${slotIdx}`;
    const scheduleKey = `${targetClass}-${timeKey}`;
    
    setData(prev => {
      const newSchedule = { ...prev.schedule };
      delete newSchedule[scheduleKey];
      return { ...prev, schedule: newSchedule };
    });
  };

  const handleAddLesson = () => {
    if (!newEntry.teacherId || !newEntry.subjectId || !selectedCell) return;
    
    const { dayIdx, slotIdx, classId } = selectedCell;
    const targetClass = classId || selectedClass;
    if (!targetClass || targetClass === 'all') return;
    
    const timeKey = `${dayIdx}-${slotIdx}`;
    const scheduleKey = `${targetClass}-${timeKey}`;

    // Verificar conflito de professor
    const teacherConflict = Object.values(data.schedule).find(
      entry => entry.teacherId === newEntry.teacherId && entry.timeKey === timeKey
    );

    if (teacherConflict) {
      const conflictClass = data.classes.find(c => c.id === teacherConflict.classId);
      alert(`Conflito: Professor já está alocado na turma ${conflictClass?.name} neste horário.`);
      return;
    }

    setData(prev => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [scheduleKey]: {
          teacherId: newEntry.teacherId,
          subjectId: newEntry.subjectId,
          classId: targetClass,
          timeKey: timeKey
        }
      }
    }));

    setShowAddModal(false);
    setNewEntry({ teacherId: '', subjectId: '' });
    setSelectedCell(null);
  };

  const getScheduleEntry = (dayIdx, slotIdx, classId = null) => {
    const targetClass = classId || selectedClass;
    if (!targetClass || targetClass === 'all') return null;
    const absoluteIndex = data.timeSlots.findIndex(s => s.id === lessonSlots[slotIdx].id);
    const timeKey = `${dayIdx}-${absoluteIndex}`;
    const scheduleKey = `${targetClass}-${timeKey}`;
    return data.schedule[scheduleKey];
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Edit3 className="w-6 h-6" />
              Edição Manual da Grade
            </h2>
            <p className="text-indigo-100 mt-2">
              Adicione, remova ou substitua aulas diretamente na grade horária
            </p>
          </div>
          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
              editMode 
                ? 'bg-white text-indigo-600 hover:bg-indigo-50' 
                : 'bg-indigo-800 text-white hover:bg-indigo-900'
            }`}
          >
            {editMode ? (
              <>
                <Save size={18} /> Finalizar Edição
              </>
            ) : (
              <>
                <Edit3 size={18} /> Ativar Modo Edição
              </>
            )}
          </button>
        </div>
      </div>

      {/* Seletor de Turma */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <label className="text-sm font-semibold text-slate-700 mb-3 block">
          Selecione a Turma para Editar
        </label>
        <select
          value={selectedClass}
          onChange={e => setSelectedClass(e.target.value)}
          className="w-full md:w-96 border border-slate-300 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Escolha uma turma...</option>
          <option value="all">📋 Todos</option>
          {data.classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Grade Editável */}
      {selectedClass && selectedClass !== 'all' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700">
              Grade de {data.classes.find(c => c.id === selectedClass)?.name}
            </h3>
            {editMode && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                <AlertCircle size={14} />
                Modo edição ativo - Clique nas células para adicionar/remover aulas
              </div>
            )}
          </div>

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-slate-300 p-3 bg-slate-100 font-bold text-slate-700">
                    Horário
                  </th>
                  {DAYS.map(day => (
                    <th key={day} className="border border-slate-300 p-3 bg-slate-100 font-bold text-slate-700">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lessonSlots.map((slot, slotIdx) => {
                  const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
                  return (
                    <tr key={slot.id}>
                      <td className="border border-slate-300 p-3 font-semibold text-slate-600 whitespace-nowrap bg-slate-50">
                        {slot.start} - {slot.end}
                      </td>
                      {DAYS.map((_, dayIdx) => {
                        const entry = getScheduleEntry(dayIdx, slotIdx);
                        const isEmpty = !entry;
                        
                        return (
                          <td
                            key={dayIdx}
                            className={`border border-slate-300 p-2 relative group ${
                              editMode ? 'cursor-pointer hover:bg-indigo-50' : ''
                            } ${isEmpty ? 'bg-slate-50' : ''}`}
                            onClick={() => editMode && !isEmpty && handleCellClick(dayIdx, absoluteIndex)}
                          >
                            {entry ? (
                              <div className="relative">
                                <div className={`p-2 rounded ${COLORS[data.subjects.find(s => s.id === entry.subjectId)?.colorIndex || 0].bg} ${COLORS[data.subjects.find(s => s.id === entry.subjectId)?.colorIndex || 0].border} border`}>
                                  <div className="font-bold text-xs mb-1">
                                    {data.subjects.find(s => s.id === entry.subjectId)?.name}
                                  </div>
                                  <div className="text-[11px] text-slate-600">
                                    {data.teachers.find(t => t.id === entry.teacherId)?.name}
                                  </div>
                                </div>
                                {editMode && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveLesson(dayIdx, absoluteIndex);
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                                    title="Remover aula"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            ) : editMode ? (
                              <button
                                onClick={() => handleCellClick(dayIdx, absoluteIndex)}
                                className="w-full h-full min-h-[60px] flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              >
                                <Plus size={20} />
                              </button>
                            ) : (
                              <div className="min-h-[60px]"></div>
                            )}
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
      )}

      {/* Visualização de Todas as Turmas */}
      {selectedClass === 'all' && (
        <div className="space-y-6">
          {data.classes.map(cls => (
            <div key={cls.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-indigo-100">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-sm">{cls.name}</span>
                  <span className="text-xs text-slate-600">Turno: {cls.shift}</span>
                  {editMode && (
                    <span className="ml-auto flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
                      <AlertCircle size={14} />
                      Editável
                    </span>
                  )}
                </h3>
              </div>

              <div className="p-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 p-3 bg-slate-100 font-bold text-slate-700">
                        Horário
                      </th>
                      {DAYS.map(day => (
                        <th key={day} className="border border-slate-300 p-3 bg-slate-100 font-bold text-slate-700">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lessonSlots.map((slot, slotIdx) => {
                      const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
                      return (
                        <tr key={slot.id}>
                          <td className="border border-slate-300 p-3 font-semibold text-slate-600 whitespace-nowrap bg-slate-50">
                            {slot.start} - {slot.end}
                          </td>
                          {DAYS.map((_, dayIdx) => {
                            const entry = getScheduleEntry(dayIdx, slotIdx, cls.id);
                            const isEmpty = !entry;
                            
                            return (
                              <td
                                key={dayIdx}
                                className={`border border-slate-300 p-2 relative group ${
                                  editMode ? 'cursor-pointer hover:bg-indigo-50' : ''
                                } ${isEmpty ? 'bg-slate-50' : ''}`}
                                onClick={() => editMode && !isEmpty && handleCellClick(dayIdx, absoluteIndex, cls.id)}
                              >
                                {entry ? (
                                  <div className="relative">
                                    <div className={`p-2 rounded ${COLORS[data.subjects.find(s => s.id === entry.subjectId)?.colorIndex || 0].bg} ${COLORS[data.subjects.find(s => s.id === entry.subjectId)?.colorIndex || 0].border} border`}>
                                      <div className="font-bold text-xs mb-1">
                                        {data.subjects.find(s => s.id === entry.subjectId)?.name}
                                      </div>
                                      <div className="text-[11px] text-slate-600">
                                        {data.teachers.find(t => t.id === entry.teacherId)?.name}
                                      </div>
                                    </div>
                                    {editMode && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveLesson(dayIdx, absoluteIndex, cls.id);
                                        }}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                                        title="Remover aula"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                ) : editMode ? (
                                  <button
                                    onClick={() => handleCellClick(dayIdx, absoluteIndex, cls.id)}
                                    className="w-full h-full min-h-[60px] flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  >
                                    <Plus size={20} />
                                  </button>
                                ) : (
                                  <div className="min-h-[60px]"></div>
                                )}
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
          ))}
        </div>
      )}

      {/* Modal Adicionar Aula */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Adicionar Aula
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewEntry({ teacherId: '', subjectId: '' });
                  setSelectedCell(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Professor
                </label>
                <select
                  value={newEntry.teacherId}
                  onChange={e => setNewEntry({ ...newEntry, teacherId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecione o professor...</option>
                  {data.teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Matéria
                </label>
                <select
                  value={newEntry.subjectId}
                  onChange={e => setNewEntry({ ...newEntry, subjectId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecione a matéria...</option>
                  {data.subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {selectedCell && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm">
                  <p className="text-slate-700">
                    <span className="font-semibold">Turma:</span>{' '}
                    {data.classes.find(c => c.id === selectedCell.classId)?.name}
                  </p>
                  <p className="text-slate-700">
                    <span className="font-semibold">Horário:</span>{' '}
                    {DAYS[selectedCell.dayIdx]} - {data.timeSlots[selectedCell.slotIdx]?.start} às {data.timeSlots[selectedCell.slotIdx]?.end}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewEntry({ teacherId: '', subjectId: '' });
                  setSelectedCell(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddLesson}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                Adicionar Aula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualEditSection;
