import React from 'react';
import { Plus, Check, X, Clock } from 'lucide-react';

/**
 * Formulário de adição/edição de turma
 */
const ClassForm = ({ 
  isAdding, 
  setIsAdding,
  isEditing,
  name, 
  setName,
  shift,
  setShift,
  selectedSlots,
  setSelectedSlots,
  allSlots,
  onSave,
  onCancel
}) => {
  const availableShifts = ['Manhã', 'Tarde', 'Noite', 'Integral'];

  const toggleSlot = (slotId) => {
    setSelectedSlots(prev => 
      prev.includes(slotId) 
        ? prev.filter(id => id !== slotId) 
        : [...prev, slotId]
    );
  };

  const handleSubmit = () => {
    if (name.trim()) {
      onSave();
    }
  };

  if (!isAdding) {
    return (
      <button 
        onClick={() => setIsAdding(true)} 
        className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1 transition-colors"
      >
        <Plus size={16} /> Nova Turma
      </button>
    );
  }

  return (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4 animate-fadeIn">
      <h4 className="text-sm font-bold text-slate-700">
        {isEditing ? 'Editar Turma' : 'Nova Turma'}
      </h4>
      
      <div className="flex gap-2 mb-3">
        <label htmlFor="class-name-input" className="sr-only">Nome da Turma</label>
        <input
          id="class-name-input"
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da turma (ex: 6º Ano A)"
          aria-label="Nome da turma"
          className="border p-2 rounded flex-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        
        <label htmlFor="class-shift-select" className="sr-only">Turno da Turma</label>
        <select
          id="class-shift-select"
          value={shift}
          onChange={(e) => setShift(e.target.value)}
          aria-label="Turno da turma"
          className="border p-2 rounded text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {availableShifts.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="flex items-center gap-1 text-xs font-bold text-slate-600 mb-2">
          <Clock size={12} /> Horários Ativos para esta Turma
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-2 bg-white rounded border border-slate-200">
          {allSlots.map(slot => (
            <label 
              key={slot.id} 
              className="flex items-center gap-2 cursor-pointer p-2 rounded border border-slate-200 hover:bg-slate-50 transition-colors text-xs"
            >
              <input
                type="checkbox"
                checked={selectedSlots.includes(slot.id)}
                onChange={() => toggleSlot(slot.id)}
                className="w-3 h-3 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
              />
              <span className={slot.type !== 'aula' ? 'text-slate-400 italic' : 'text-slate-700'}>
                {slot.start} {slot.type !== 'aula' && `(${slot.type})`}
              </span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Marque os períodos em que esta turma tem aula. Intervalos/Almoço/Jantar são opcionais.
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <button 
          onClick={onCancel} 
          className="bg-slate-300 text-slate-700 px-4 py-2 rounded text-sm hover:bg-slate-400 transition-colors"
        >
          Cancelar
        </button>
        <button 
          onClick={handleSubmit} 
          className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 transition-colors flex items-center gap-1"
        >
          <Check size={16} /> {isEditing ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>
  );
};

export default ClassForm;
