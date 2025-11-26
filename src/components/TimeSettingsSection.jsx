import React, { useState, useMemo } from 'react';
import { Plus, BookOpen, Coffee, Utensils, ArrowUp, ArrowDown, Trash2, Pencil, X, Check, Moon } from 'lucide-react';
import { uid } from '../utils';

const TimeSettingsSection = ({ data, setData }) => {
  const [newSlot, setNewSlot] = useState({ start: '', end: '', type: '', shift: '' });
  const [shiftFilter, setShiftFilter] = useState('Todos');
  const [editingId, setEditingId] = useState(null);
  const [editSlot, setEditSlot] = useState({ start: '', end: '', type: 'aula', shift: 'Manhã' });

  const shiftOptions = ['Todos','Manhã','Tarde','Noite','Integral (Manhã e Tarde)','Integral (Tarde e Noite)'];

  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  const getShiftLabel = (hhmm) => {
    const startMin = toMinutes(hhmm);
    if (startMin < 12 * 60) return 'Manhã';
    if (startMin < 18 * 60) return 'Tarde';
    return 'Noite';
  };

  const filteredSlots = useMemo(() => {
    if (shiftFilter === 'Todos') return data.timeSlots;
    // Só mostra horários explicitamente marcados como o turno selecionado
    return data.timeSlots.filter(slot => {
      if (!slot.shift) return false;
      if (shiftFilter === 'Integral (Manhã e Tarde)') return slot.shift === 'Integral (Manhã e Tarde)';
      if (shiftFilter === 'Integral (Tarde e Noite)') return slot.shift === 'Integral (Tarde e Noite)';
      if (shiftFilter === 'Manhã') return slot.shift === 'Manhã';
      if (shiftFilter === 'Tarde') return slot.shift === 'Tarde';
      if (shiftFilter === 'Noite') return slot.shift === 'Noite';
      return false;
    });
  }, [shiftFilter, data.timeSlots]);

  const handleAddSlot = () => {
    if (!newSlot.start || !newSlot.end || !newSlot.type) return;
    const slotData = {
      id: uid(),
      start: newSlot.start,
      end: newSlot.end,
      type: newSlot.type
    };
    if (newSlot.shift) {
      slotData.shift = newSlot.shift;
    }
    setData(prev => ({
      ...prev,
      timeSlots: [...prev.timeSlots, slotData]
    }));
    setNewSlot({ start: '', end: '', type: '', shift: '' });
  };

  const startEdit = (slot) => {
    setEditingId(slot.id);
    const defaultShift = slot.shift ? slot.shift : 'AUTO';
    setEditSlot({ start: slot.start, end: slot.end, type: slot.type, shift: defaultShift });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSlot({ start: '', end: '', type: 'aula' });
  };

  const saveEdit = () => {
    if (!editSlot.start || !editSlot.end) return;
    const toMin = (v) => {
      const [h,m] = v.split(':').map(Number);
      return h*60+m;
    };
    if (toMin(editSlot.end) <= toMin(editSlot.start)) {
      alert('Fim deve ser maior que Início.');
      return;
    }
    setData(prev => ({
      ...prev,
      timeSlots: prev.timeSlots.map(s => s.id === editingId ? { ...s, start: editSlot.start, end: editSlot.end, type: editSlot.type, shift: editSlot.shift } : s)
    }));
    cancelEdit();
  };

  const removeSlot = (id) => {
    setData(prev => ({ ...prev, timeSlots: prev.timeSlots.filter(s => s.id !== id) }));
  };

  const moveSlot = (index, direction) => {
    const newSlots = [...data.timeSlots];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newSlots.length) return;
    [newSlots[index], newSlots[targetIndex]] = [newSlots[targetIndex], newSlots[index]];
    setData(prev => ({ ...prev, timeSlots: newSlots }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="mb-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 font-bold"><ArrowUp size={12}/> Manhã</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-bold"><ArrowDown size={12}/> Tarde</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-violet-100 text-violet-700 font-bold"><Moon size={12}/> Noite</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-teal-100 text-teal-700 font-bold"><BookOpen size={12}/> Integral (Manhã e Tarde)</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-fuchsia-100 text-fuchsia-700 font-bold"><BookOpen size={12}/> Integral (Tarde e Noite)</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <span className="font-bold text-slate-700">Integral (Manhã e Tarde):</span> abrange todos os horários de manhã e tarde.<br/>
            <span className="font-bold text-slate-700">Integral (Tarde e Noite):</span> abrange todos os horários de tarde e noite.
          </div>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-4">
          <h2 className="text-lg font-bold text-slate-800">Configuração de Horários</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Turno:</label>
            <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} className="text-xs border border-slate-300 rounded px-2 py-1 outline-none focus:border-blue-500 bg-slate-50">
              {shiftOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-6">Defina os blocos de tempo e o tipo global. Você pode filtrar pelos turnos para facilitar a visualização.</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end bg-slate-50 p-4 rounded-lg border border-slate-200">
           <div className="col-span-1">
             <label className="block text-xs font-semibold text-slate-500 mb-1">Início</label>
             <input type="time" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={newSlot.start} onChange={e => setNewSlot({...newSlot, start: e.target.value})} />
           </div>
           <div className="col-span-1">
             <label className="block text-xs font-semibold text-slate-500 mb-1">Fim</label>
             <input type="time" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={newSlot.end} onChange={e => setNewSlot({...newSlot, end: e.target.value})} />
           </div>
           <div className="col-span-1">
             <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo</label>
             <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={newSlot.type} onChange={e => setNewSlot({...newSlot, type: e.target.value})}>
               <option value="">Escolha o tipo</option>
               <option value="aula">Aula</option>
               <option value="intervalo">Intervalo</option>
               <option value="almoco">Almoço</option>
               <option value="jantar">Jantar</option>
             </select>
           </div>
           <div className="col-span-1">
             <label className="block text-xs font-semibold text-slate-500 mb-1">Turno</label>
             <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={newSlot.shift} onChange={e => setNewSlot({...newSlot, shift: e.target.value})}>
               <option value="">Automático</option>
               <option value="Manhã">Manhã</option>
               <option value="Tarde">Tarde</option>
               <option value="Noite">Noite</option>
               <option value="Integral (Manhã e Tarde)">Integral (Manhã e Tarde)</option>
               <option value="Integral (Tarde e Noite)">Integral (Tarde e Noite)</option>
             </select>
           </div>
           <button onClick={handleAddSlot} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"><Plus size={18} /> Adicionar</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">Grade Horária ({filteredSlots.length}{shiftFilter !== 'Todos' ? ` / ${data.timeSlots.length}` : ''})</h3>
        </div>
        <div className="p-2 overflow-x-auto scrollbar-elegant">
          <table className="w-full text-sm text-left min-w-[650px]">
            <thead className="text-xs text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">Horário</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Turno</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSlots.map((slot, index) => {
                const originalIndex = data.timeSlots.findIndex(s => s.id === slot.id);
                return (
                <tr key={slot.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{index + 1}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">
                    {editingId === slot.id ? (
                      <div className="flex items-center gap-2">
                        <input type="time" className="border border-slate-300 rounded px-2 py-1 text-xs" value={editSlot.start} onChange={e => setEditSlot({ ...editSlot, start: e.target.value })} />
                        <span className="text-slate-400">–</span>
                        <input type="time" className="border border-slate-300 rounded px-2 py-1 text-xs" value={editSlot.end} onChange={e => setEditSlot({ ...editSlot, end: e.target.value })} />
                      </div>
                    ) : (
                      `${slot.start} - ${slot.end}`
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === slot.id ? (
                      <select className="border border-slate-300 rounded px-2 py-1 text-xs" value={editSlot.type} onChange={e => setEditSlot({ ...editSlot, type: e.target.value })}>
                        <option value="aula">Aula</option>
                        <option value="intervalo">Intervalo</option>
                        <option value="almoco">Almoço</option>
                        <option value="jantar">Jantar</option>
                      </select>
                    ) : (
                      slot.type === 'aula' 
                        ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-bold"><BookOpen size={12}/> Aula</span>
                        : slot.type === 'intervalo'
                          ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-orange-100 text-orange-700 text-xs font-bold"><Coffee size={12}/> Intervalo</span>
                          : slot.type === 'almoco'
                            ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-bold"><Utensils size={12}/> Almoço</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-100 text-indigo-700 text-xs font-bold"><Utensils size={12}/> Jantar</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === slot.id ? (
                      <select className="border border-slate-300 rounded px-2 py-1 text-xs" value={editSlot.shift} onChange={e => setEditSlot({ ...editSlot, shift: e.target.value })}>
                        <option value="AUTO">Automático</option>
                        <option value="Manhã">Manhã</option>
                        <option value="Tarde">Tarde</option>
                        <option value="Noite">Noite</option>
                        <option value="Integral (Manhã e Tarde)">Integral (Manhã e Tarde)</option>
                        <option value="Integral (Tarde e Noite)">Integral (Tarde e Noite)</option>
                      </select>
                    ) : (() => {
                      const autoLbl = getShiftLabel(slot.start);
                      const lbl = slot.shift ? slot.shift : autoLbl;
                      const styles = lbl.startsWith('Manhã')
                        ? 'bg-amber-100 text-amber-700'
                        : lbl.startsWith('Tarde')
                          ? 'bg-emerald-100 text-emerald-700'
                          : lbl.startsWith('Noite')
                            ? 'bg-violet-100 text-violet-700'
                            : lbl.startsWith('Integral (Manhã e Tarde)')
                              ? 'bg-teal-100 text-teal-700'
                              : 'bg-fuchsia-100 text-fuchsia-700';
                      return <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${styles}`}>{lbl}{slot.shift ? '' : ' (auto)'}</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2">
                    {editingId === slot.id ? (
                      <>
                        <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700 p-1"><Check size={16} /></button>
                        <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => moveSlot(originalIndex, -1)} className="text-slate-400 hover:text-blue-600 p-1 disabled:opacity-30" disabled={originalIndex === 0}><ArrowUp size={16} /></button>
                        <button onClick={() => moveSlot(originalIndex, 1)} className="text-slate-400 hover:text-blue-600 p-1 disabled:opacity-30" disabled={originalIndex === data.timeSlots.length - 1}><ArrowDown size={16} /></button>
                        <button onClick={() => startEdit(slot)} className="text-slate-400 hover:text-indigo-600 p-1"><Pencil size={16} /></button>
                        <div className="w-px h-4 bg-slate-300 mx-2 self-center"></div>
                        <button onClick={() => removeSlot(slot.id)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                      </>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TimeSettingsSection;
