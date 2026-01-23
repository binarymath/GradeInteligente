import React, { useMemo, useState } from 'react';
import { Plus, Check, X, Trash2, Clock, BookOpen, Star, Save, Coffee, Utensils, Sun, Sunset, Moon, Layers, Users, Edit2, Settings } from 'lucide-react';
import { uid, DAYS, COLORS, getAllSlots } from '../utils';
import { computeSlotShift } from '../utils/time';
import SynchronousConfigService from '../services/SynchronousConfigService';
import ClassForm from './ClassForm';

const DataInputSection = ({ data, setData, subView, setSubView }) => {
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherShifts, setNewTeacherShifts] = useState([]);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectShifts, setNewSubjectShifts] = useState([]);
  const [newSubjectIsSynchronous, setNewSubjectIsSynchronous] = useState(false);
  // Subject editing state
  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');
  const [editingSubjectShifts, setEditingSubjectShifts] = useState([]);
  const [editingSubjectIsSynchronous, setEditingSubjectIsSynchronous] = useState(false);

  // Editor simplificado inline para aulas síncronas
  const [inlineSyncEditing, setInlineSyncEditing] = useState({ subjectId: null, configId: null, editingConfig: null, selectedDayForSlots: DAYS[0], classSearch: '' });

  const [isAddingClass, setIsAddingClass] = useState(false);
  const [editingClassId, setEditingClassId] = useState(null);
  const [newClassName, setNewClassName] = useState('');
  const [newClassShift, setNewClassShift] = useState('Manhã');
  const [selectedClassSlots, setSelectedClassSlots] = useState([]); // Legado, compatibilidade
  const [activeSlotsByDay, setActiveSlotsByDay] = useState({}); // Novo: { dayIdx: [slotIds] }
  const [classNames, setClassNames] = useState(['']);

  const allSlots = getAllSlots(data.timeSlots);

  // Teacher editing state
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editingTeacherName, setEditingTeacherName] = useState('');
  const [editingTeacherShifts, setEditingTeacherShifts] = useState([]);

  const toggleInlineSyncEditor = (subject) => {
    setInlineSyncEditing(prev => {
      if (prev.subjectId === subject.id) {
        return { subjectId: null, configId: null, editingConfig: null, selectedDayForSlots: DAYS[0], classSearch: '' };
      }
      return { subjectId: subject.id, configId: null, editingConfig: null, selectedDayForSlots: DAYS[0], classSearch: '' };
    });
  };

  const addInlineSyncConfig = (subject) => {
    const currentConfigs = SynchronousConfigService.getSubjectConfigs(subject);
    const newConfig = SynchronousConfigService.createEmptyConfig(`Configuração ${currentConfigs.length + 1}`);
    const nextConfigs = [...currentConfigs, newConfig];
    setData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === subject.id ? { ...s, synchronousConfigs: nextConfigs } : s)
    }));
    setInlineSyncEditing({ subjectId: subject.id, configId: newConfig.id, editingConfig: newConfig, selectedDayForSlots: newConfig.days[0] || DAYS[0], classSearch: '' });
  };

  const editInlineSyncConfig = (subject, config) => {
    setInlineSyncEditing({ subjectId: subject.id, configId: config.id, editingConfig: { ...config }, selectedDayForSlots: config.days[0] || DAYS[0], classSearch: '' });
  };

  const cancelInlineSyncEdit = () => {
    setInlineSyncEditing({ subjectId: null, configId: null, editingConfig: null, selectedDayForSlots: DAYS[0], classSearch: '' });
  };

  const saveInlineSyncEdit = (subject) => {
    const { editingConfig } = inlineSyncEditing;
    const validation = SynchronousConfigService.validateConfig(editingConfig, data);
    if (!validation.isValid) {
      alert(`Erro na configuração:\n${validation.errors.join('\n')}`);
      return;
    }
    console.log('💾 Salvando configuração inline:', editingConfig);
    setData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === subject.id ? {
        ...s,
        synchronousConfigs: (SynchronousConfigService.getSubjectConfigs(s) || []).map(c => c.id === editingConfig.id ? editingConfig : c)
      } : s)
    }));
    cancelInlineSyncEdit();
  };

  const deleteInlineSyncConfig = (subject, configId) => {
    if (!confirm('Deseja remover esta configuração?')) return;
    setData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === subject.id ? {
        ...s,
        synchronousConfigs: (SynchronousConfigService.getSubjectConfigs(s) || []).filter(c => c.id !== configId)
      } : s)
    }));
    if (inlineSyncEditing.configId === configId) cancelInlineSyncEdit();
  };

  const duplicateInlineSyncConfig = (subject, config) => {
    const dup = SynchronousConfigService.duplicateConfig(config);
    setData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === subject.id ? {
        ...s,
        synchronousConfigs: [...(SynchronousConfigService.getSubjectConfigs(s) || []), dup]
      } : s)
    }));
  };

  const toggleInlineSyncActive = (subject, configId) => {
    setData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === subject.id ? {
        ...s,
        synchronousConfigs: (SynchronousConfigService.getSubjectConfigs(s) || []).map(c => c.id === configId ? { ...c, isActive: !c.isActive } : c)
      } : s)
    }));
  };

  const saveAllInlineSyncConfigs = (subject) => {
    const configs = SynchronousConfigService.getSubjectConfigs(subject) || [];
    const allValid = configs.every(c => SynchronousConfigService.validateConfig(c, data).isValid);
    if (!allValid || inlineSyncEditing.configId) {
      alert(inlineSyncEditing.configId ? 'Conclua a edição antes de salvar.' : 'Algumas configurações possuem erros.');
      return;
    }
    // Já estão salvas no estado global; este botão dá feedback simples
    alert('Configurações sincronas salvas.');
  };

  const toggleTeacherUnavailable = (teacherId, dayIndex, lessonIndex) => {
    const key = `${DAYS[dayIndex]}-${lessonIndex}`;
    setData(prev => ({
      ...prev,
      teachers: prev.teachers.map(t => {
        if (t.id !== teacherId) return t;
        return {
          ...t,
          unavailable: t.unavailable.includes(key)
            ? t.unavailable.filter(k => k !== key)
            : [...t.unavailable, key]
        };
      })
    }));
  };

  const handleAddTeacher = () => {
    if (!newTeacherName.trim()) return;
    setData(prev => ({
      ...prev,
      teachers: [...prev.teachers, { id: uid(), name: newTeacherName.trim(), unavailable: [], shifts: newTeacherShifts.length ? newTeacherShifts : [] }]
    }));
    setNewTeacherName('');
    setNewTeacherShifts([]);
    setIsAddingTeacher(false);
  };
  const startEditTeacher = (teacher) => {
    setEditingTeacherId(teacher.id);
    setEditingTeacherName(teacher.name);
    setEditingTeacherShifts(teacher.shifts || []);
  };
  const cancelEditTeacher = () => {
    setEditingTeacherId(null);
    setEditingTeacherName('');
    setEditingTeacherShifts([]);
  };
  const saveEditTeacher = () => {
    if (!editingTeacherName.trim()) return;
    setData(prev => ({
      ...prev,
      teachers: prev.teachers.map(t => t.id === editingTeacherId ? { ...t, name: editingTeacherName.trim(), shifts: editingTeacherShifts } : t)
    }));
    cancelEditTeacher();
  };
  const handleAddSubject = () => {
    if (newSubjectName.trim()) {
      setData(prev => ({
        ...prev,
        subjects: [
          ...prev.subjects,
          {
            id: uid(),
            name: newSubjectName.trim(),
            colorIndex: Math.floor(Math.random() * COLORS.length),
            unavailable: [],
            preferred: [],
            shifts: newSubjectShifts.length ? newSubjectShifts : [],
            isSynchronous: newSubjectIsSynchronous,
            synchronousConfigs: [] // Only use granular configs
          }
        ]
      }));
      setNewSubjectName('');
      setNewSubjectShifts([]);
      setNewSubjectIsSynchronous(false);
      setIsAddingSubject(false);
    }
  };
  const startEditSubject = (subject) => {
    setEditingSubjectId(subject.id);
    setEditingSubjectName(subject.name);
    setEditingSubjectShifts(subject.shifts || []);
    setEditingSubjectIsSynchronous(subject.isSynchronous || false);
  };
  const cancelEditSubject = () => {
    setEditingSubjectId(null);
    setEditingSubjectName('');
    setEditingSubjectShifts([]);
    setEditingSubjectIsSynchronous(false);
  };
  const saveEditSubject = () => {
    if (!editingSubjectName.trim()) return;
    setData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === editingSubjectId ? {
        ...s,
        name: editingSubjectName.trim(),
        shifts: editingSubjectShifts,
        isSynchronous: editingSubjectIsSynchronous
        // Don't set synchronousGroup or preferredTimeSlots - use granular configs only
      } : s)
    }));
    cancelEditSubject();
  };

  const resetClassForm = () => {
    setNewClassName('');
    setNewClassShift('Manhã');
    setSelectedClassSlots([]);
    setActiveSlotsByDay({});
    setEditingClassId(null);
    setIsAddingClass(false);
    setClassNames(['']);
  };

  const handleEditClass = (cls) => {
    setNewClassName(cls.name);
    setNewClassShift(cls.shift || 'Manhã');

    // Migração: se tem activeSlots (legado), converte para activeSlotsByDay
    if (cls.activeSlotsByDay) {
      setActiveSlotsByDay(cls.activeSlotsByDay);
      setSelectedClassSlots([]);
    } else if (cls.activeSlots) {
      // Legado: aplica os mesmos slots em todos os dias
      const byDay = {};
      DAYS.forEach((_, idx) => {
        byDay[idx] = [...cls.activeSlots];
      });
      setActiveSlotsByDay(byDay);
      setSelectedClassSlots(cls.activeSlots);
    } else {
      setActiveSlotsByDay({});
      setSelectedClassSlots([]);
    }

    setEditingClassId(cls.id);
    setClassNames([cls.name]);
    setIsAddingClass(true);
  };

  const handleSaveClass = () => {
    if (editingClassId) {
      // Modo edição: salva uma única turma
      if (!newClassName.trim()) return;
      const classData = {
        id: editingClassId,
        name: newClassName,
        shift: newClassShift,
        activeSlotsByDay: activeSlotsByDay,
        // 🔴 IMPORTANTE: Se tem activeSlotsByDay (novo), limpar activeSlots (legado) para evitar conflito
        activeSlots: Object.keys(activeSlotsByDay).length > 0 ? [] : selectedClassSlots
      };
      setData(prev => ({
        ...prev,
        classes: prev.classes.map(c => c.id === editingClassId ? { ...c, ...classData } : c)
      }));
      window.alert('Alterações salvas com sucesso.');
    } else {
      // Modo criação: cria múltiplas turmas com os mesmos horários
      const validNames = classNames.filter(name => name.trim() !== '');
      if (validNames.length === 0) return;

      const newClasses = validNames.map(name => ({
        id: uid(),
        name: name.trim(),
        shift: newClassShift,
        activeSlotsByDay: activeSlotsByDay,
        // 🔴 IMPORTANTE: Se tem activeSlotsByDay (novo), limpar activeSlots (legado) para evitar conflito
        activeSlots: Object.keys(activeSlotsByDay).length > 0 ? [] : selectedClassSlots
      }));

      setData(prev => ({
        ...prev,
        classes: [...prev.classes, ...newClasses]
      }));

      // Só fecha o formulário quando criar novas turmas
      resetClassForm();
    }
    // Não fecha o formulário ao salvar edição - mantém aberto para editar outras turmas
  };

  const classesByShift = data.classes.reduce((acc, cls) => {
    if (!acc[cls.shift]) acc[cls.shift] = [];
    acc[cls.shift].push(cls);
    return acc;
  }, {});

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-auto">
      <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-elegant">
        <button onClick={() => setSubView('subjects')} className={`flex-1 min-w-[100px] py-3 text-sm font-medium whitespace-nowrap ${subView === 'subjects' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}>Matérias</button>
        <button onClick={() => setSubView('classes')} className={`flex-1 min-w-[100px] py-3 text-sm font-medium whitespace-nowrap ${subView === 'classes' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}>Turmas</button>
        <button onClick={() => setSubView('teachers')} className={`flex-1 min-w-[100px] py-3 text-sm font-medium whitespace-nowrap ${subView === 'teachers' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}>Professores</button>
      </div>

      <div className="p-4 sm:p-6">
        {subView === 'teachers' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <h3 className="text-lg font-bold text-slate-700">Cadastro e Restrições</h3>
              {!isAddingTeacher ? (
                <button onClick={() => setIsAddingTeacher(true)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1 transition-colors w-full sm:w-auto justify-center"><Plus size={16} /> Novo Professor</button>
              ) : (
                <div className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Nome do Professor"
                      className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                      value={newTeacherName}
                      onChange={e => setNewTeacherName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTeacher()}
                    />
                    <button onClick={handleAddTeacher} className="bg-emerald-600 text-white px-3 py-2 rounded text-sm font-bold hover:bg-emerald-700"><Check size={16} /></button>
                    <button onClick={() => { setIsAddingTeacher(false); setNewTeacherName(''); setNewTeacherShifts([]); }} className="bg-slate-300 text-slate-700 px-3 py-2 rounded text-sm font-bold hover:bg-slate-400"><X size={16} /></button>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2">Turnos do Professor (um ou mais)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {['Manhã', 'Tarde', 'Noite', 'Integral (Manhã e Tarde)', 'Integral (Tarde e Noite)'].map(shift => {
                        const active = newTeacherShifts.includes(shift);
                        return (
                          <button
                            type="button"
                            key={shift}
                            onClick={() => setNewTeacherShifts(prev => prev.includes(shift) ? prev.filter(s => s !== shift) : [...prev, shift])}
                            className={`text-[11px] px-2 py-2 rounded-md border transition-colors flex items-center justify-between ${active ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                          >
                            <span className="truncate">{shift}</span>
                            {active && <Check size={12} className="opacity-90" />}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">Selecione todos os turnos em que este professor pode atuar.</p>
                  </div>
                </div>
              )}
            </div>
            {data.teachers.map(teacher => {
              const isEditing = editingTeacherId === teacher.id;
              // Filtra apenas slots compatíveis com os turnos do professor (mantém integrais distintos)
              const teacherHasShifts = (teacher.shifts || []).length > 0;
              const teacherShiftSet = new Set(teacher.shifts || []);
              const filteredSlotsWithIndex = allSlots
                .map((slot, idx) => ({ slot, idx }))
                .filter(({ slot }) => {
                  if (!teacherHasShifts) return true; // Sem turnos definidos => mostra todos
                  if (slot.shift && (slot.shift.startsWith('Integral'))) {
                    // Slot integral só aparece se professor tiver exatamente aquele integral
                    return teacherShiftSet.has(slot.shift);
                  }
                  // Slot simples ou automático: classificar e comparar
                  const label = slot.shift || (() => {
                    const [h, m] = slot.start.split(':').map(Number);
                    const minutes = h * 60 + m;
                    if (minutes < 12 * 60) return 'Manhã';
                    if (minutes < 18 * 60) return 'Tarde';
                    return 'Noite';
                  })();
                  return teacherShiftSet.has(label);
                });
              return (
                <div key={teacher.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-200 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3 w-full">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold">{teacher.name.charAt(0)}</div>
                      <div className="flex-1">
                        {!isEditing ? (
                          <>
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                              {teacher.name}
                              <button onClick={() => startEditTeacher(teacher)} className="text-slate-400 hover:text-blue-600 transition-colors" title="Editar"><Edit2 size={14} /></button>
                            </h4>
                            {teacher.shifts && teacher.shifts.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {teacher.shifts.map(s => (
                                  <span key={s} className="bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 text-[10px] font-medium">{s}</span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingTeacherName}
                              onChange={e => setEditingTeacherName(e.target.value)}
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                              placeholder="Nome do Professor"
                            />
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">Turnos</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {['Manhã', 'Tarde', 'Noite', 'Integral (Manhã e Tarde)', 'Integral (Tarde e Noite)'].map(shift => {
                                  const active = editingTeacherShifts.includes(shift);
                                  return (
                                    <button
                                      type="button"
                                      key={shift}
                                      onClick={() => setEditingTeacherShifts(prev => prev.includes(shift) ? prev.filter(s => s !== shift) : [...prev, shift])}
                                      className={`text-[11px] px-2 py-2 rounded-md border transition-colors flex items-center justify-between ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                    >
                                      <span className="truncate">{shift}</span>
                                      {active && <Check size={12} className="opacity-90" />}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="mt-2 text-[10px] text-slate-400">Ajuste os turnos em que este professor atua.</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={saveEditTeacher} className="bg-emerald-600 text-white px-3 py-2 rounded text-sm font-bold hover:bg-emerald-700 flex items-center gap-1"><Check size={16} /> Salvar</button>
                              <button onClick={cancelEditTeacher} className="bg-slate-300 text-slate-700 px-3 py-2 rounded text-sm font-bold hover:bg-slate-400 flex items-center gap-1"><X size={16} /> Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <button onClick={() => setData(prev => ({ ...prev, teachers: prev.teachers.filter(t => t.id !== teacher.id) }))} className="text-slate-300 hover:text-red-500 transition-colors" title="Excluir"><Trash2 size={16} /></button>
                      )}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><Clock size={12} /> Clique para marcar H. Extra Classe (Prof indisponível):</p>
                    <div className="overflow-x-auto scrollbar-elegant">
                      <div className="min-w-[300px]">
                        <div className="grid grid-cols-6 gap-1">
                          <div className="text-[10px] font-bold text-slate-400"></div>
                          {DAYS.map(d => <div key={d} className="text-[10px] font-bold text-center text-slate-400 uppercase">{d.substring(0, 3)}</div>)}
                          {filteredSlotsWithIndex.map(({ slot, idx }) => (
                            <React.Fragment key={idx}>
                              <div className="text-[10px] text-slate-400 flex items-center justify-end pr-2">{slot.start}</div>
                              {DAYS.map((d, di) => {
                                const isOff = teacher.unavailable.includes(`${d}-${idx}`);
                                return (
                                  <button key={`${d}-${idx}`} onClick={() => toggleTeacherUnavailable(teacher.id, di, idx)} className={`h-6 rounded text-[10px] font-medium transition-all ${isOff ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-white border border-slate-200 hover:bg-blue-50 text-slate-300'}`}>{isOff ? 'X' : ''}</button>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {subView === 'subjects' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <h3 className="text-lg font-bold text-slate-700">Matérias e Preferências</h3>
              {!isAddingSubject ? (
                <button onClick={() => setIsAddingSubject(true)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1 transition-colors w-full sm:w-auto justify-center"><Plus size={16} /> Nova Matéria</button>
              ) : (
                <div className="flex flex-col gap-3 animate-fadeIn w-full sm:w-auto bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <input type="text" autoFocus placeholder="Nome da Matéria" className="flex-1 sm:w-auto border border-slate-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSubject()} />
                    <button onClick={handleAddSubject} className="bg-emerald-500 text-white p-2 rounded hover:bg-emerald-600"><Check size={16} /></button>
                    <button onClick={() => { setIsAddingSubject(false); setNewSubjectName(''); setNewSubjectShifts([]); setNewSubjectIsSynchronous(false); setNewSubjectSyncGroup(''); setNewSubjectPreferredSlots([]); setNewSubjectSelectedDay('Segunda'); }} className="bg-slate-300 text-slate-600 p-2 rounded hover:bg-slate-400"><X size={16} /></button>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Turnos da Matéria</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {['Manhã', 'Tarde', 'Noite', 'Integral (Manhã e Tarde)', 'Integral (Tarde e Noite)'].map(shift => {
                        const active = newSubjectShifts.includes(shift);
                        return (
                          <button
                            type="button"
                            key={shift}
                            onClick={() => setNewSubjectShifts(prev => prev.includes(shift) ? prev.filter(s => s !== shift) : [...prev, shift])}
                            className={`text-[11px] px-2 py-2 rounded-md border transition-colors flex items-center justify-between ${active ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                          >
                            <span className="truncate">{shift}</span>
                            {active && <Check size={12} className="opacity-90" />}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">Selecione todos os turnos em que esta matéria pode ocorrer.</p>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newSubjectIsSynchronous}
                        onChange={(e) => setNewSubjectIsSynchronous(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <Layers size={14} className="text-blue-600" />
                      Aula Síncrona (todas as turmas ao mesmo tempo)
                    </label>
                  </div>
                </div>
              )}
            </div>

            {data.subjects.map(subject => {
              const isEditing = editingSubjectId === subject.id;
              // Filtra visualmente apenas slots compatíveis com os turnos da matéria para evitar ambiguidade
              const subjectHasShifts = (subject.shifts || []).length > 0;
              const subjectShiftSet = new Set(subject.shifts || []);
              const filteredSlotsWithIndex = allSlots
                .map((slot, idx) => ({ slot, idx }))
                .filter(({ slot }) => {
                  if (!subjectHasShifts) return true; // Sem turnos definidos => mostra todos
                  if (slot.shift && (slot.shift.startsWith('Integral'))) {
                    // Slot integral só aparece se matéria também tiver exatamente aquele integral
                    return subjectShiftSet.has(slot.shift);
                  }
                  // Slot simples ou automático: classificar e comparar
                  const label = slot.shift || (() => {
                    const [h, m] = slot.start.split(':').map(Number);
                    const minutes = h * 60 + m;
                    if (minutes < 12 * 60) return 'Manhã';
                    if (minutes < 18 * 60) return 'Tarde';
                    return 'Noite';
                  })();
                  return subjectShiftSet.has(label);
                });
              return (
                <div key={subject.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-200 transition-colors bg-white">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-8 h-8 rounded-full ${COLORS[subject.colorIndex].bg} border ${COLORS[subject.colorIndex].border} flex items-center justify-center`}>
                        <BookOpen size={16} className={COLORS[subject.colorIndex].text} />
                      </div>
                      {!isEditing ? (
                        <div>
                          <h4 className="font-bold text-slate-700 flex items-center gap-2 flex-wrap">
                            {subject.name}
                            {subject.isSynchronous && (
                              <span className="bg-blue-100 text-blue-700 border border-blue-300 rounded px-2 py-0.5 text-[9px] font-medium flex items-center gap-1">
                                <Layers size={10} />
                                Síncrona
                              </span>
                            )}
                            {subject.isSynchronous && (
                              <button
                                onClick={() => toggleInlineSyncEditor(subject)}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors"
                                title="Configurar aulas síncronas (simplificado)"
                              >
                                <Settings size={14} />
                              </button>
                            )}
                            <button onClick={() => startEditSubject(subject)} className="text-slate-400 hover:text-blue-600 transition-colors" title="Editar"><Edit2 size={14} /></button>
                          </h4>
                          {subject.shifts && subject.shifts.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {subject.shifts.map(s => (
                                <span key={s} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-0.5 text-[10px] font-medium">{s}</span>
                              ))}
                            </div>
                          )}
                          {subject.isSynchronous && (() => {
                            const activeConfigs = SynchronousConfigService.getActiveConfigs(subject);
                            if (!activeConfigs || activeConfigs.length === 0) return null;
                            return (
                              <div className="mt-2">
                                <div className="text-[9px] text-slate-500 mb-1">Configurações síncronas ativas ({activeConfigs.length}):</div>
                                <div className="flex flex-wrap gap-1">
                                  {activeConfigs.map(cfg => (
                                    <span key={cfg.id} className="bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 text-[9px] font-medium">
                                      {cfg.name} • {cfg.days.length}d • {cfg.timeSlots.length}h • {cfg.classes.length}t
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Editor inline simplificado */}
                          {subject.isSynchronous && inlineSyncEditing.subjectId === subject.id && (
                            <div className="mt-3 border border-blue-200 rounded-lg bg-blue-50 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-blue-700">Configuração Síncrona Granular (inline)</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => addInlineSyncConfig(subject)}
                                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                                    title="Adicionar nova configuração de aula síncrona"
                                  >
                                    Adicionar
                                  </button>
                                  <button
                                    onClick={() => saveAllInlineSyncConfigs(subject)}
                                    className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                                    title="Salvar todas as configurações desta matéria"
                                  >
                                    Salvar Configurações
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {(SynchronousConfigService.getSubjectConfigs(subject) || []).length === 0 ? (
                                  <div className="text-[11px] text-slate-600">Nenhuma configuração criada.</div>
                                ) : (
                                  (SynchronousConfigService.getSubjectConfigs(subject) || []).map(config => (
                                    <div key={config.id} className={`p-2 rounded border ${inlineSyncEditing.configId === config.id ? 'border-blue-500 bg-white' : 'border-slate-200 bg-white'}`}>
                                      {inlineSyncEditing.configId === config.id ? (
                                        <div className="space-y-2">
                                          <input
                                            type="text"
                                            value={inlineSyncEditing.editingConfig.name}
                                            onChange={e => setInlineSyncEditing(prev => ({ ...prev, editingConfig: { ...prev.editingConfig, name: e.target.value } }))}
                                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                                            placeholder="Nome da configuração"
                                          />
                                          <div>
                                            <div className="text-[10px] font-bold text-slate-700 mb-1">Dias da Semana</div>
                                            <div className="flex gap-1 flex-wrap">
                                              {DAYS.map(day => (
                                                <button
                                                  key={day}
                                                  type="button"
                                                  onClick={() => {
                                                    const has = inlineSyncEditing.editingConfig.days.includes(day);
                                                    const updated = has
                                                      ? inlineSyncEditing.editingConfig.days.filter(d => d !== day)
                                                      : [...inlineSyncEditing.editingConfig.days, day];
                                                    const newDay = updated.length > 0 ? updated[0] : DAYS[0];
                                                    setInlineSyncEditing(prev => ({ ...prev, selectedDayForSlots: newDay, editingConfig: { ...prev.editingConfig, days: updated } }));
                                                  }}
                                                  className={`px-2 py-1 rounded text-[10px] ${inlineSyncEditing.editingConfig.days.includes(day) ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                                                  title={`${inlineSyncEditing.editingConfig.days.includes(day) ? 'Remover' : 'Adicionar'} ${day}`}
                                                >
                                                  {day.substring(0, 3)}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-[10px] font-bold text-slate-700 mb-1">Horários das Aulas Síncronas ({inlineSyncEditing.selectedDayForSlots})</div>
                                            <div className="flex gap-1 mb-1 flex-wrap">
                                              {inlineSyncEditing.editingConfig.days.map(day => (
                                                <button
                                                  key={day}
                                                  type="button"
                                                  onClick={() => setInlineSyncEditing(prev => ({ ...prev, selectedDayForSlots: day }))}
                                                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${inlineSyncEditing.selectedDayForSlots === day ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                                                  title={`Ver horários de ${day}`}
                                                >
                                                  {day.substring(0, 3)}
                                                </button>
                                              ))}
                                            </div>
                                            <div className="max-h-28 overflow-y-auto border border-slate-300 rounded p-2 bg-white">
                                              {allSlots
                                                .filter(s => s.type === 'aula')
                                                .map((slot, idx) => {
                                                  const slotKey = `${inlineSyncEditing.selectedDayForSlots}-${idx}`;
                                                  const isSel = inlineSyncEditing.editingConfig.timeSlots.includes(slotKey);
                                                  return (
                                                    <button
                                                      key={slotKey}
                                                      type="button"
                                                      onClick={() => {
                                                        const updated = isSel
                                                          ? inlineSyncEditing.editingConfig.timeSlots.filter(k => k !== slotKey)
                                                          : [...inlineSyncEditing.editingConfig.timeSlots, slotKey];
                                                        setInlineSyncEditing(prev => ({ ...prev, editingConfig: { ...prev.editingConfig, timeSlots: updated } }));
                                                      }}
                                                      className={`w-full text-left px-2 py-1 mb-1 rounded text-[10px] ${isSel ? 'bg-blue-600 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'}`}
                                                      title={`${isSel ? 'Remover' : 'Adicionar'} horário ${slot.start}-${slot.end}`}
                                                    >
                                                      {slot.start}-{slot.end}
                                                    </button>
                                                  );
                                                })}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-[10px] font-bold text-slate-700 mb-1">Turmas</div>
                                            <div className="flex items-center gap-2 mb-1">
                                              <input type="text" value={inlineSyncEditing.classSearch} onChange={e => setInlineSyncEditing(prev => ({ ...prev, classSearch: e.target.value }))} className="flex-1 border border-slate-300 rounded px-2 py-1 text-[11px] outline-none focus:border-blue-500" placeholder="Pesquisar turmas" />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const needle = inlineSyncEditing.classSearch.trim().toLowerCase();
                                                  const ids = data.classes.filter(c => (c.name || '').toLowerCase().includes(needle)).map(c => c.id);
                                                  const setIds = new Set(inlineSyncEditing.editingConfig.classes);
                                                  ids.forEach(id => setIds.add(id));
                                                  setInlineSyncEditing(prev => ({ ...prev, editingConfig: { ...prev.editingConfig, classes: Array.from(setIds) } }));
                                                }}
                                                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"
                                                title="Adicionar turmas filtradas à seleção"
                                              >
                                                Selecionar filtradas
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const needle = inlineSyncEditing.classSearch.trim().toLowerCase();
                                                  const ids = new Set(data.classes.filter(c => (c.name || '').toLowerCase().includes(needle)).map(c => c.id));
                                                  setInlineSyncEditing(prev => ({ ...prev, editingConfig: { ...prev.editingConfig, classes: prev.editingConfig.classes.filter(id => !ids.has(id)) } }));
                                                }}
                                                className="text-[10px] bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"
                                                title="Remover turmas filtradas da seleção"
                                              >
                                                Limpar filtradas
                                              </button>
                                            </div>
                                            <div className="max-h-28 overflow-y-auto border border-slate-300 rounded p-2 bg-white">
                                              {(data.classes || []).filter(c => {
                                                const needle = inlineSyncEditing.classSearch.trim().toLowerCase();
                                                if (!needle) return true;
                                                return (c.name || '').toLowerCase().includes(needle);
                                              }).map(cls => {
                                                const active = inlineSyncEditing.editingConfig.classes.includes(cls.id);
                                                return (
                                                  <button
                                                    key={cls.id}
                                                    type="button"
                                                    onClick={() => {
                                                      const updated = active
                                                        ? inlineSyncEditing.editingConfig.classes.filter(id => id !== cls.id)
                                                        : [...inlineSyncEditing.editingConfig.classes, cls.id];
                                                      setInlineSyncEditing(prev => ({ ...prev, editingConfig: { ...prev.editingConfig, classes: updated } }));
                                                    }}
                                                    className={`w-full text-left px-2 py-1 mb-1 rounded text-[10px] ${active ? 'bg-indigo-600 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'}`}
                                                    title={`${active ? 'Remover' : 'Adicionar'} turma ${cls.name}`}
                                                  >
                                                    {cls.name}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                          {(() => {
                                            const v = SynchronousConfigService.validateConfig(inlineSyncEditing.editingConfig, data);
                                            if (v.isValid) return null;
                                            return <div className="text-[10px] text-red-600">{v.errors.join(' • ')}</div>;
                                          })()}
                                          <div className="flex justify-end gap-2">
                                            <button
                                              onClick={() => cancelInlineSyncEdit()}
                                              className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300"
                                              title="Cancelar edição e descartar alterações"
                                            >
                                              Cancelar
                                            </button>
                                            <button
                                              onClick={() => saveInlineSyncEdit(subject)}
                                              className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                                              title="Salvar esta configuração"
                                            >
                                              Salvar
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-start justify-between">
                                          <div className="text-[11px] text-slate-700">
                                            <span className="font-bold">{config.name}</span>
                                            <span className="ml-2 text-slate-500">
                                              📅 {config.days.length} {config.days.length === 1 ? 'dia' : 'dias'} •
                                              🕐 {config.timeSlots.length} {config.timeSlots.length === 1 ? 'horário' : 'horários'} •
                                              👥 {config.classes.length} {config.classes.length === 1 ? 'turma' : 'turmas'}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => toggleInlineSyncActive(subject, config.id)}
                                              className={`text-xs px-2 py-1 rounded ${config.isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}
                                              title={config.isActive ? 'Desativar esta configuração' : 'Ativar esta configuração'}
                                            >
                                              {config.isActive ? 'Ativa' : 'Inativa'}
                                            </button>
                                            <button
                                              onClick={() => duplicateInlineSyncConfig(subject, config)}
                                              className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded hover:bg-slate-200"
                                              title="Criar uma cópia desta configuração"
                                            >
                                              Duplicar
                                            </button>
                                            <button
                                              onClick={() => editInlineSyncConfig(subject, config)}
                                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                                              title="Editar esta configuração"
                                            >
                                              Editar
                                            </button>
                                            <button
                                              onClick={() => deleteInlineSyncConfig(subject, config.id)}
                                              className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                                              title="Remover esta configuração"
                                            >
                                              Remover
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 w-full">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingSubjectName}
                              onChange={e => setEditingSubjectName(e.target.value)}
                              className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                              placeholder="Nome da Matéria"
                              autoFocus
                            />
                            <button onClick={saveEditSubject} className="bg-emerald-500 text-white p-1 rounded hover:bg-emerald-600" title="Salvar"><Check size={16} /></button>
                            <button onClick={cancelEditSubject} className="bg-slate-300 text-slate-600 p-1 rounded hover:bg-slate-400" title="Cancelar"><X size={16} /></button>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Turnos</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-1">
                              {['Manhã', 'Tarde', 'Noite', 'Integral (Manhã e Tarde)', 'Integral (Tarde e Noite)'].map(shift => {
                                const active = editingSubjectShifts.includes(shift);
                                return (
                                  <button
                                    type="button"
                                    key={shift}
                                    onClick={() => setEditingSubjectShifts(prev => prev.includes(shift) ? prev.filter(s => s !== shift) : [...prev, shift])}
                                    className={`text-[11px] px-2 py-2 rounded-md border transition-colors flex items-center justify-between ${active ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                  >
                                    <span className="truncate">{shift}</span>
                                    {active && <Check size={12} className="opacity-90" />}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-slate-400">Ajuste os turnos em que esta matéria pode ocorrer.</p>
                          </div>
                          <div className="border-t border-slate-200 pt-2">
                            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 mb-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingSubjectIsSynchronous}
                                onChange={(e) => setEditingSubjectIsSynchronous(e.target.checked)}
                                className="w-4 h-4"
                              />
                              <Layers size={14} className="text-blue-600" />
                              Aula Síncrona (todas as turmas ao mesmo tempo)
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                    {!isEditing && (
                      <button onClick={() => setData(prev => ({ ...prev, subjects: prev.subjects.filter(s => s.id !== subject.id) }))} className="text-slate-300 hover:text-red-500 transition-colors" title="Excluir"><Trash2 size={16} /></button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {subView === 'classes' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <h3 className="text-lg font-bold text-slate-700">Turmas / Classes</h3>
              {!isAddingClass ? (
                <button onClick={() => setIsAddingClass(true)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1 transition-colors w-full sm:w-auto justify-center"><Plus size={16} /> Nova Turma</button>
              ) : (
                <div className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn">
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          {editingClassId ? 'Selecione a Turma para Editar' : 'Nomes das Turmas (uma por linha)'}
                        </label>
                        {editingClassId ? (
                          <div className="space-y-2">
                            <select
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium"
                              value={editingClassId}
                              onChange={e => {
                                const classToEdit = data.classes.find(c => c.id === e.target.value);
                                if (classToEdit) {
                                  handleEditClass(classToEdit);
                                }
                              }}
                            >
                              {data.classes.map(cls => (
                                <option key={cls.id} value={cls.id}>
                                  {cls.name} ({cls.shift})
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Ex: 6º Ano A"
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                              value={newClassName}
                              onChange={e => setNewClassName(e.target.value)}
                            />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {classNames.map((name, idx) => (
                              <div key={idx} className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder={`Ex: ${idx === 0 ? '6º Ano A' : '6º Ano B'}`}
                                  className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                                  value={name}
                                  onChange={e => {
                                    const newNames = [...classNames];
                                    newNames[idx] = e.target.value;
                                    setClassNames(newNames);
                                  }}
                                />
                                {classNames.length > 1 && (
                                  <button
                                    onClick={() => setClassNames(classNames.filter((_, i) => i !== idx))}
                                    className="text-slate-400 hover:text-red-500 transition-colors p-2"
                                    title="Remover"
                                  >
                                    <X size={16} />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={() => setClassNames([...classNames, ''])}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                            >
                              <Plus size={14} /> Adicionar mais uma turma
                            </button>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Todas as turmas terão o mesmo turno e horários selecionados
                            </p>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Turno</label>
                        <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500" value={newClassShift} onChange={e => setNewClassShift(e.target.value)}>
                          <option value="Manhã">Manhã</option>
                          <option value="Tarde">Tarde</option>
                          <option value="Noite">Noite</option>
                          <option value="Integral (Manhã e Tarde)">Integral (Manhã e Tarde)</option>
                          <option value="Integral (Tarde e Noite)">Integral (Tarde e Noite)</option>
                        </select>
                      </div>
                    </div>

                    <ClassForm
                      timeSlots={data.timeSlots}
                      selectedShift={newClassShift}
                      activeSlotsByDay={activeSlotsByDay}
                      setActiveSlotsByDay={setActiveSlotsByDay}
                    />

                    <div className="flex justify-end gap-2">
                      <button onClick={handleSaveClass} className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"><Save size={16} /> {editingClassId ? 'Salvar Alterações' : 'Criar Turma'}</button>
                      <button onClick={resetClassForm} className="bg-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-bold hover:bg-slate-400 transition-colors">Cancelar</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {Object.entries(classesByShift).map(([shiftName, classes]) => (
              <div key={shiftName} className="mb-6">
                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  {shiftName === 'Manhã' ? <Sun size={16} /> : shiftName === 'Tarde' ? <Sunset size={16} /> : shiftName === 'Noite' ? <Moon size={16} /> : <Layers size={16} />}
                  {shiftName} ({classes.length})
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  {classes.map(cls => (
                    <div key={cls.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-white">
                      <div className="flex items-center gap-3">
                        <Users size={18} className="text-slate-400" />
                        <div>
                          <span className="font-medium text-slate-700 block">{cls.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {cls.activeSlotsByDay
                              ? new Set(Object.values(cls.activeSlotsByDay).flat()).size
                              : (cls.activeSlots || []).length} horários ativos
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEditClass(cls)} className="text-slate-400 hover:text-blue-500 transition-colors p-2" title="Editar Turma"><Edit2 size={16} /></button>
                        <button onClick={() => setData(prev => ({ ...prev, classes: prev.classes.filter(c => c.id !== cls.id) }))} className="text-slate-400 hover:text-red-500 transition-colors p-2" title="Remover Turma"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataInputSection;
