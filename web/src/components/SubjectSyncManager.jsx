import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Check, X, Clock, Users, Calendar, HelpCircle } from 'lucide-react';
import { DAYS, getAllSlots, uid } from '../utils';
import SynchronousConfigService from '../services/SynchronousConfigService';

const TimeGridSelector = ({ selectedSlots, onChange, allSlots }) => {
    // Group slots by time to create rows, days as columns
    const timeLabels = useMemo(() => {
        const times = new Set();
        allSlots.forEach(s => times.add(`${s.start}-${s.end}`));
        return Array.from(times).sort();
    }, [allSlots]);

    const toggleSlot = (day, timeLabel) => {
        // Find the original slot based on the TIME, but we need the INDEX relative to the daily schedule
        // The simplified view assumes "rows" are times.
        const slotObj = allSlots.find(s => `${s.start}-${s.end}` === timeLabel);

        // We must use the originalIndex if available, or the index in allSlots if it maps to the daily slot list
        // allSlots here is passed from parent, which is: getAllSlots(data.timeSlots).filter(...)
        // getAllSlots adds 'originalIndex' to each slot.
        // The KEY expected by the system is usually `${day}-${slotIndex}` where slotIndex matches the index in timeSlots array.

        if (!slotObj) return;

        // Use originalIndex if present (it should be, from getAllSlots)
        // If not, fall back to some other logic, but allSlots comes from getAllSlots.
        const slotIndex = slotObj.originalIndex !== undefined ? slotObj.originalIndex : -1;

        if (slotIndex === -1) return;

        const key = `${day}-${slotIndex}`;

        const newSelection = selectedSlots.includes(key)
            ? selectedSlots.filter(k => k !== key)
            : [...selectedSlots, key];
        onChange(newSelection);
    };

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
            <div className="grid grid-cols-[60px_repeat(5,_1fr)_repeat(2,_1fr)] bg-slate-50 border-b border-slate-200">
                <div className="p-2 font-bold text-slate-500 text-center">Horário</div>
                {DAYS.map(day => (
                    // Show simplified day name
                    <div key={day} className={`p-2 font-bold text-center uppercase tracking-wider ${day.startsWith('S') && day !== 'Sexta' ? 'text-slate-400 bg-slate-100' : 'text-slate-600'}`}>
                        {day.substring(0, 3)}
                    </div>
                ))}
            </div>
            <div className="max-h-64 overflow-y-auto">
                {timeLabels.map((timeLabel, idx) => (
                    <div key={timeLabel} className={`grid grid-cols-[60px_repeat(7,_1fr)] border-b border-slate-100 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <div className="p-2 border-r border-slate-100 text-[10px] font-medium text-slate-500 flex items-center justify-center">
                            {timeLabel}
                        </div>
                        {DAYS.map(day => {
                            // Check if this slot is selected
                            // We need to reconstruct the key to check selection state
                            const slotObj = allSlots.find(s => `${s.start}-${s.end}` === timeLabel);
                            // Safety check
                            if (!slotObj) return <div key={day} className="bg-slate-100" />;

                            const slotIndex = slotObj.originalIndex !== undefined ? slotObj.originalIndex : -1;
                            const key = `${day}-${slotIndex}`;
                            const isSelected = selectedSlots.includes(key);

                            return (
                                <button
                                    key={day}
                                    onClick={() => toggleSlot(day, timeLabel)}
                                    className={`transition-all duration-200 m-0.5 rounded-sm h-6 ${isSelected
                                        ? 'bg-indigo-600 shadow-sm scale-95'
                                        : 'hover:bg-indigo-100 bg-slate-50/50'
                                        }`}
                                    title={`${day} ${timeLabel}`}
                                >
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

const SubjectSyncManager = ({ subject, data, onUpdate }) => {
    const [editingConfig, setEditingConfig] = useState(null); // If set, we are editing/creating
    const [searchTerm, setSearchTerm] = useState('');

    const configs = useMemo(() => SynchronousConfigService.getSubjectConfigs(subject) || [], [subject]);
    const allSlots = useMemo(() => getAllSlots(data.timeSlots).filter(s => s.type === 'aula'), [data.timeSlots]);

    const handleAddNew = () => {
        const newConfig = {
            id: uid(),
            name: `Nova Configuração ${configs.length + 1}`,
            days: [],
            timeSlots: [],
            classes: [],
            isActive: true
        };
        setEditingConfig(newConfig);
    };

    const handleEdit = (config) => {
        setEditingConfig({ ...config });
    };

    const handleDelete = (configId) => {
        if (confirm('Tem certeza que deseja remover esta configuração síncrona?')) {
            const updatedConfigs = configs.filter(c => c.id !== configId);
            onUpdate(updatedConfigs);
        }
    };

    const handleSave = () => {
        if (!editingConfig) return;

        // Auto-update days based on selected timeSlots
        const derivedDays = new Set();
        editingConfig.timeSlots.forEach(key => {
            const [day] = key.split('-');
            derivedDays.add(day);
        });

        const finalConfig = {
            ...editingConfig,
            days: Array.from(derivedDays) // Ensure days array matches selected slots
        };

        const validation = SynchronousConfigService.validateConfig(finalConfig, data);
        if (!validation.isValid) {
            alert(validation.errors.join('\n'));
            return;
        }

        const exists = configs.find(c => c.id === finalConfig.id);
        let updatedConfigs;
        if (exists) {
            updatedConfigs = configs.map(c => c.id === finalConfig.id ? finalConfig : c);
        } else {
            updatedConfigs = [...configs, finalConfig];
        }

        onUpdate(updatedConfigs);
        setEditingConfig(null);
    };

    const toggleClass = (classId) => {
        if (!editingConfig) return;
        const current = editingConfig.classes;
        const updated = current.includes(classId)
            ? current.filter(id => id !== classId)
            : [...current, classId];
        setEditingConfig({ ...editingConfig, classes: updated });
    };

    const filteredClasses = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return (data.classes || []).filter(c => c.name.toLowerCase().includes(term));
    }, [data.classes, searchTerm]);

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-2 animate-fadeIn">
            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Users size={16} className="text-indigo-600" />
                Gerenciador Síncrono Visual
            </h4>

            {editingConfig ? (
                <div className="bg-white border border-indigo-200 rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <h5 className="font-bold text-indigo-900">Editar Configuração</h5>
                        <button onClick={() => setEditingConfig(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                    </div>

                    <div className="space-y-4">
                        {/* Nome */}
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Nome (Opcional)</label>
                            <input
                                type="text"
                                value={editingConfig.name}
                                onChange={e => setEditingConfig({ ...editingConfig, name: e.target.value })}
                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:border-indigo-500 outline-none"
                                placeholder="Ex: Turmas Manhã"
                            />
                        </div>

                        {/* Grid de Horários */}
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <label className="block text-xs font-bold text-slate-600">Selecione os Horários</label>
                                <div className="group relative">
                                    <HelpCircle size={14} className="text-slate-400 cursor-help" />
                                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-64 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                                        Clique nos quadrinhos para definir em qual horário esta aula especial deve ocorrer e em quais turmas.
                                    </div>
                                </div>
                            </div>
                            <TimeGridSelector
                                selectedSlots={editingConfig.timeSlots}
                                onChange={(slots) => setEditingConfig({ ...editingConfig, timeSlots: slots })}
                                allSlots={allSlots}
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Os dias serão calculados automaticamente baseados nos horários selecionados.</p>
                        </div>

                        {/* Seleção de Turmas */}
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Selecione as Turmas Participantes</label>
                            <input
                                type="text"
                                placeholder="Filtrar turmas..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full border border-slate-300 rounded px-2 py-1 text-xs mb-2 focus:border-indigo-500 outline-none"
                            />
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                                {filteredClasses.map(cls => {
                                    const isSelected = editingConfig.classes.includes(cls.id);
                                    return (
                                        <button
                                            key={cls.id}
                                            onClick={() => toggleClass(cls.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${isSelected
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-300'
                                                }`}
                                        >
                                            {cls.name}
                                            {isSelected && <span className="ml-1 opacity-80">✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button onClick={() => setEditingConfig(null)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded shadow-sm font-medium flex items-center gap-1">
                                <Check size={16} /> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {configs.length === 0 ? (
                        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
                            <p className="text-slate-400 text-sm mb-2">Nenhuma configuração síncrona criada.</p>
                            <button onClick={handleAddNew} className="text-indigo-600 text-sm font-bold hover:underline">Criar Primeira Configuração</button>
                        </div>
                    ) : (
                        configs.map(config => (
                            <div key={config.id} className="bg-white border border-slate-200 rounded-lg p-3 flex justify-between items-center shadow-sm hover:border-indigo-200 transition-colors">
                                <div>
                                    <h5 className="font-bold text-slate-700 text-sm">{config.name}</h5>
                                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-3">
                                        <span className="flex items-center gap-1"><Users size={12} /> {config.classes.length} Turmas</span>
                                        <span className="flex items-center gap-1"><Clock size={12} /> {config.timeSlots.length} Horários</span>
                                        <span className="flex items-center gap-1"><Calendar size={12} /> {config.days.join(', ').substring(0, 20)}{config.days.join(', ').length > 20 ? '...' : ''}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => handleEdit(config)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(config.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))
                    )}

                    {configs.length > 0 && (
                        <button onClick={handleAddNew} className="w-full py-2 border border-dashed border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 text-xs font-bold flex items-center justify-center gap-1">
                            <Plus size={14} /> Nova Configuração
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default SubjectSyncManager;
