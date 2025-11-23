import React from 'react';
import { Plus, Check, X } from 'lucide-react';

/**
 * Formulário de adição de matéria
 */
const SubjectForm = ({ 
  isAdding, 
  setIsAdding, 
  name, 
  setName,
  onAdd 
}) => {
  const handleSubmit = () => {
    if (name.trim()) {
      onAdd();
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setName('');
  };

  if (!isAdding) {
    return (
      <button 
        onClick={() => setIsAdding(true)} 
        className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1 transition-colors"
      >
        <Plus size={16} /> Nova Matéria
      </button>
    );
  }

  return (
    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 animate-fadeIn">
      <div className="flex gap-2">
        <label htmlFor="new-subject-input" className="sr-only">Nome da Matéria</label>
        <input 
          id="new-subject-input"
          type="text" 
          autoFocus
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Nome da matéria" 
          aria-label="Nome da matéria"
          className="border p-2 rounded flex-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }} 
        />
        <button 
          onClick={handleSubmit} 
          className="bg-emerald-600 text-white px-3 py-2 rounded text-sm hover:bg-emerald-700"
          aria-label="Salvar matéria"
        >
          <Check size={16} />
        </button>
        <button 
          onClick={handleCancel} 
          className="bg-slate-300 text-slate-700 px-3 py-2 rounded text-sm hover:bg-slate-400"
          aria-label="Cancelar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default SubjectForm;
