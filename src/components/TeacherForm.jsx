import React from 'react';
import { Plus, Check, X } from 'lucide-react';

/**
 * Formulário de adição de professor
 */
const TeacherForm = ({ 
  isAdding, 
  setIsAdding, 
  name, 
  setName, 
  shifts, 
  setShifts,
  onAdd 
}) => {
  const availableShifts = ['Manhã', 'Tarde', 'Noite', 'Integral (Manhã e Tarde)', 'Integral (Tarde e Noite)'];

  const handleSubmit = () => {
    if (name.trim()) {
      onAdd();
    }
  };

  const toggleShift = (shift) => {
    setShifts(prev => 
      prev.includes(shift) 
        ? prev.filter(s => s !== shift) 
        : [...prev, shift]
    );
  };

  const handleCancel = () => {
    setIsAdding(false);
    setName('');
    setShifts([]);
  };

  if (!isAdding) {
    return (
      <button 
        onClick={() => setIsAdding(true)} 
        className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1 transition-colors w-full sm:w-auto justify-center"
      >
        <Plus size={16} /> Novo Professor
      </button>
    );
  }

  return (
    <div className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="new-teacher-input" className="sr-only">Nome do Professor</label>
        <input
          id="new-teacher-input"
          type="text"
          autoFocus
          placeholder="Nome do Professor"
          aria-label="Nome do Professor"
          className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        <button 
          onClick={handleSubmit} 
          className="bg-emerald-600 text-white px-3 py-2 rounded text-sm font-bold hover:bg-emerald-700"
          aria-label="Salvar professor"
        >
          <Check size={16} />
        </button>
        <button 
          onClick={handleCancel} 
          className="bg-slate-300 text-slate-700 px-3 py-2 rounded text-sm font-bold hover:bg-slate-400"
          aria-label="Cancelar"
        >
          <X size={16} />
        </button>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-2">Turnos do Professor (um ou mais)</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {availableShifts.map(shift => (
            <label 
              key={shift} 
              className="flex items-center gap-2 cursor-pointer p-2 rounded border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              <input
                type="checkbox"
                checked={shifts.includes(shift)}
                onChange={() => toggleShift(shift)}
                className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-700">{shift}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeacherForm;
