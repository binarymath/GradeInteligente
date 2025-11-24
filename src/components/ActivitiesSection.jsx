import React, { useState, useMemo } from 'react';
import { BookOpen, Users, Layout, Sparkles, Plus, X, Layers, Search, Trash2, Pencil, Check } from 'lucide-react';
import { uid } from '../utils';
import { useDebounce } from '../hooks/useDebounce';

const apiKey = ""; 

const ActivitiesSection = ({ data, setData, callGemini, aiLoading, setAiLoading }) => {
  const [newActivity, setNewActivity] = useState({ teacherId: '', subjectId: '', classId: '', quantity: '', doubleLesson: false });
  const [suggestion, setSuggestion] = useState(null);
  const [filter, setFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [editActivity, setEditActivity] = useState({ teacherId: '', subjectId: '', classId: '', quantity: 2, doubleLesson: false });

  const debouncedFilter = useDebounce(filter, 300);

  const totalLessons = useMemo(() => 
    data.activities.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0),
    [data.activities]
  );
  
  const uniqueTeachers = useMemo(() => 
    new Set(data.activities.map(a => a.teacherId)).size,
    [data.activities]
  );
  
  const uniqueClasses = useMemo(() => 
    new Set(data.activities.map(a => a.classId)).size,
    [data.activities]
  );

  // Estatísticas por professor
  const teacherStats = useMemo(() => {
    if (!teacherFilter) return null;
    const teacherActivities = data.activities.filter(a => a.teacherId === teacherFilter);
    return {
      totalLessons: teacherActivities.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0),
      activitiesCount: teacherActivities.length,
      classesCount: new Set(teacherActivities.map(a => a.classId)).size
    };
  }, [teacherFilter, data.activities]);

  const filteredActivities = useMemo(() => {
    let activities = data.activities;
    
    // Filtro por professor
    if (teacherFilter) {
      activities = activities.filter(a => a.teacherId === teacherFilter);
    }
    
    // Filtro por texto
    if (!debouncedFilter) return activities;
    const searchLower = debouncedFilter.toLowerCase();
    return activities.filter(act => {
      const tName = data.teachers.find(t => t.id === act.teacherId)?.name.toLowerCase() || '';
      const sName = data.subjects.find(s => s.id === act.subjectId)?.name.toLowerCase() || '';
      const cName = data.classes.find(c => c.id === act.classId)?.name.toLowerCase() || '';
      return tName.includes(searchLower) || sName.includes(searchLower) || cName.includes(searchLower);
    });
  }, [debouncedFilter, teacherFilter, data.activities, data.teachers, data.subjects, data.classes]);

  const handleAddActivity = () => {
    if (!newActivity.teacherId || !newActivity.subjectId || !newActivity.classId) return;
    setData(prev => ({
      ...prev,
      activities: [...prev.activities, { ...newActivity, id: uid(), split: 1 }]
    }));
    // Clear suggestion and reset form fields after adding
    setSuggestion(null);
    setNewActivity({ teacherId: '', subjectId: '', classId: '', quantity: '', doubleLesson: false });
  };

  const handleAiSuggestion = async () => {
     const subject = data.subjects.find(s => s.id === newActivity.subjectId);
     const classroom = data.classes.find(c => c.id === newActivity.classId);
     if(!subject || !classroom) { alert("Selecione a matéria e a turma primeiro."); return; }
     setAiLoading(true);
     const prompt = `Matéria: ${subject.name}, Turma: ${classroom.name}. Sugira a quantidade ideal de aulas semanais. Responda JSON: {"quantity": numero, "reason": "curto"}.`;
     try {
       const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
       const resData = await response.json();
       const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
       if (text) { 
         const cleanText = text.replace(/```json|```/g, '').trim();
         const result = JSON.parse(cleanText); 
         if(result) { setNewActivity(prev => ({ ...prev, quantity: result.quantity })); setSuggestion(result.reason); } 
       }
     } catch (e) { console.error(e); } finally { setAiLoading(false); }
  };

  const startEditActivity = (act) => {
    setEditingActivityId(act.id);
    setEditActivity({
      teacherId: act.teacherId,
      subjectId: act.subjectId,
      classId: act.classId,
      quantity: act.quantity,
      doubleLesson: act.doubleLesson || false
    });
  };

  const cancelEditActivity = () => {
    setEditingActivityId(null);
    setEditActivity({ teacherId: '', subjectId: '', classId: '', quantity: 2, doubleLesson: false });
  };

  const saveEditActivity = () => {
    if (!editActivity.teacherId || !editActivity.subjectId || !editActivity.classId) return;
    setData(prev => ({
      ...prev,
      activities: prev.activities.map(a => a.id === editingActivityId ? { ...a, ...editActivity } : a)
    }));
    cancelEditActivity();
  };

  return (
    <div className="flex flex-col gap-6 h-auto min-h-0 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
         <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><BookOpen size={24} /></div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase">Total de Aulas</p>
              <h3 className="text-2xl font-bold text-slate-700">{totalLessons}</h3>
            </div>
         </div>
         <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><Users size={24} /></div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase">Professores Alocados</p>
              <h3 className="text-2xl font-bold text-slate-700">{uniqueTeachers} <span className="text-sm font-normal text-slate-400">/ {data.teachers.length}</span></h3>
            </div>
         </div>
         <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><Layout size={24} /></div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase">Turmas Atendidas</p>
              <h3 className="text-2xl font-bold text-slate-700">{uniqueClasses} <span className="text-sm font-normal text-slate-400">/ {data.classes.length}</span></h3>
            </div>
         </div>
      </div>

      {/* Filtro por Professor */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <label htmlFor="teacher-filter" className="text-xs font-semibold text-slate-600 mb-1 block">Filtrar por Professor</label>
            <select 
              id="teacher-filter"
              value={teacherFilter} 
              onChange={e => setTeacherFilter(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Escolha o professor</option>
              {data.teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {teacherFilter && teacherStats && (
            <div className="flex gap-3 sm:gap-4 flex-wrap">
              <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                <p className="text-[10px] text-blue-600 font-semibold uppercase">Qtde. Aulas</p>
                <p className="text-xl font-bold text-blue-700">{teacherStats.totalLessons}</p>
              </div>
              <div className="bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-200">
                <p className="text-[10px] text-emerald-600 font-semibold uppercase">Atribuições</p>
                <p className="text-xl font-bold text-emerald-700">{teacherStats.activitiesCount}</p>
              </div>
              <div className="bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-200">
                <p className="text-[10px] text-indigo-600 font-semibold uppercase">Turmas</p>
                <p className="text-xl font-bold text-indigo-700">{teacherStats.classesCount}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-white to-slate-50 p-6 rounded-2xl shadow-sm border border-slate-200 shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none [mask-image:radial-gradient(circle_at_30%_20%,white,transparent)] bg-[linear-gradient(120deg,rgba(99,102,241,0.08)_0%,rgba(99,102,241,0)_60%)]"></div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5 relative z-10">
           <div>
             <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2"><Plus size={18} className="text-blue-600"/> Nova Atividade</h2>
             <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><BookOpen size={12} className="text-slate-400"/> Vincule Professor, Matéria e Turma abaixo.</p>
           </div>
           <div className="flex items-center gap-3">
             {aiLoading && (
               <span 
                 className="text-[10px] text-indigo-600 flex items-center gap-1 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100"
                 role="status"
                 aria-live="polite"
               >
                 <Sparkles size={12} className="animate-pulse"/> IA analisando...
               </span>
             )}
             <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-400">
               <span className="inline-flex items-center gap-1"><Layers size={12} className="text-purple-500"/> Aulas Duplas</span>
               <span className="inline-flex items-center gap-1"><Sparkles size={12} className="text-indigo-500"/> Sugestão IA</span>
             </div>
           </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5 relative z-10">
           <div className="xl:col-span-3 group">
             <label htmlFor="new-activity-teacher" className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1"><Users size={12} className="text-blue-500"/> Professor</label>
             <div className="relative">
               <select 
                 id="new-activity-teacher"
                 className="peer w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm transition-all focus:border-blue-500" 
                 value={newActivity.teacherId} 
                 onChange={e => setNewActivity({...newActivity, teacherId: e.target.value})}
                 aria-label="Selecionar professor"
               >
                 <option value="">Selecione...</option>
                 {data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
               </select>
               <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none opacity-40"><Users size={16}/></div>
             </div>
           </div>
           <div className="xl:col-span-3 group">
             <label htmlFor="new-activity-subject" className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1"><BookOpen size={12} className="text-emerald-500"/> Matéria</label>
             <div className="relative">
               <select 
                 id="new-activity-subject"
                 className="peer w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white/80 backdrop-blur-sm transition-all focus:border-emerald-500" 
                 value={newActivity.subjectId} 
                 onChange={e => setNewActivity({...newActivity, subjectId: e.target.value})}
                 aria-label="Selecionar matéria"
               >
                 <option value="">Selecione...</option>
                 {data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
               </select>
               <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none opacity-40"><BookOpen size={16}/></div>
             </div>
           </div>
           <div className="xl:col-span-2 group">
             <label htmlFor="new-activity-class" className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1"><Layout size={12} className="text-indigo-500"/> Turma</label>
             <div className="relative">
               <select 
                 id="new-activity-class"
                 className="peer w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white/80 backdrop-blur-sm transition-all focus:border-indigo-500" 
                 value={newActivity.classId} 
                 onChange={e => setNewActivity({...newActivity, classId: e.target.value})}
                 aria-label="Selecionar turma"
               >
                 <option value="">Selecione...</option>
                 {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
               </select>
               <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none opacity-40"><Layout size={16}/></div>
             </div>
           </div>
           <div className="xl:col-span-2 relative group">
             <label htmlFor="new-activity-quantity" className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
               <span className="flex items-center gap-1"><Layers size={12} className="text-purple-500"/> Qtd. Aulas</span>
               <button 
                 onClick={handleAiSuggestion} 
                 title="Sugestão IA" 
                 disabled={aiLoading}
                 aria-busy={aiLoading}
                 aria-label="Solicitar sugestão de IA"
                 className="text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
               >
                 <Sparkles size={14} />
               </button>
             </label>
             <input 
               id="new-activity-quantity"
               type="number" 
               min="1" 
               max="10" 
               placeholder="0" 
               aria-label="Quantidade de aulas semanais"
               className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-white/80 backdrop-blur-sm transition-all font-semibold text-center tracking-wide" 
               value={newActivity.quantity} 
               onChange={e => { const val = e.target.value; setNewActivity({ ...newActivity, quantity: val === '' ? '' : parseInt(val) }); }} 
             />
             {suggestion && (
               <div 
                 className="absolute top-full left-0 right-0 mt-2 z-10 bg-indigo-600/95 text-white text-[11px] p-3 rounded-lg shadow-lg animate-fadeIn border border-indigo-400"
                 role="status"
                 aria-live="polite"
               >
                  <div className="flex justify-between items-start mb-1">
                    <strong className="flex items-center gap-1"><Sparkles size={10}/> Sugestão IA</strong>
                    <button onClick={() => setSuggestion(null)} className="text-indigo-200 hover:text-white"><X size={12}/></button>
                  </div>
                  {suggestion}
               </div>
             )}
           </div>
           <div className="xl:col-span-2 flex flex-col items-center gap-4">
             <div className="flex items-center gap-2 -mt-1">
               <input
                 type="checkbox"
                 id="doubleLesson"
                 checked={newActivity.doubleLesson}
                 onChange={e => setNewActivity({ ...newActivity, doubleLesson: e.target.checked })}
                 className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
               />
               <label
                 htmlFor="doubleLesson"
                 className={`text-[11px] font-semibold flex items-center gap-1 cursor-pointer px-2 py-1 rounded transition-colors ${newActivity.doubleLesson ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'text-slate-600 hover:bg-slate-100'}`}
               >
                 <Layers size={12} className={newActivity.doubleLesson ? 'text-purple-600' : 'text-purple-500'} /> Você prefere aula dupla
               </label>
             </div>
             <button onClick={handleAddActivity} className="group mx-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-6 py-3 text-sm font-bold tracking-wide hover:from-blue-500 hover:to-indigo-500 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-xl active:scale-[0.97]">
               <Plus size={18} className="group-hover:rotate-12 transition-transform"/> Adicionar Atividade
             </button>
             <div className="text-[10px] text-slate-400 flex items-center gap-1"><Sparkles size={10} className="text-indigo-400"/> Após adicionar, o formulário é resetado automaticamente.</div>
           </div>
        </div>
        <div className="mt-6 rounded-lg bg-white/60 backdrop-blur p-3 border border-slate-200 text-[11px] flex flex-wrap gap-3">
           <div className="flex items-center gap-1"><Users size={12} className="text-blue-500"/> <span className="font-medium">{newActivity.teacherId ? data.teachers.find(t => t.id === newActivity.teacherId)?.name : 'Professor não selecionado'}</span></div>
           <div className="flex items-center gap-1"><BookOpen size={12} className="text-emerald-500"/> <span className="font-medium">{newActivity.subjectId ? data.subjects.find(s => s.id === newActivity.subjectId)?.name : 'Matéria não selecionada'}</span></div>
           <div className="flex items-center gap-1"><Layout size={12} className="text-indigo-500"/> <span className="font-medium">{newActivity.classId ? data.classes.find(c => c.id === newActivity.classId)?.name : 'Turma não selecionada'}</span></div>
           <div className="flex items-center gap-1"><Layers size={12} className="text-purple-500"/> <span className="font-medium">{newActivity.quantity || 0} aulas</span></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
             <h3 className="font-bold text-slate-700 text-lg">Atividades Cadastradas</h3>
             <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{filteredActivities.length}</span>
          </div>
          <div className="relative w-full sm:w-64">
            <input 
               type="text" 
               placeholder="Buscar por professor, matéria..." 
               className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
               value={filter}
               onChange={e => setFilter(e.target.value)}
            />
            <div className="absolute left-3 top-2.5 text-slate-400">
               <Search size={16} />
            </div>
          </div>
        </div>
        
        <div className="overflow-auto scrollbar-elegant">
          <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-100 sticky top-0">
              <tr>
                <th className="px-6 py-3 font-semibold">Professor</th>
                <th className="px-6 py-3 font-semibold">Matéria</th>
                <th className="px-6 py-3 font-semibold">Turma</th>
                <th className="px-6 py-3 text-center font-semibold">Carga</th>
                <th className="px-6 py-3 text-center font-semibold">Preferência</th>
                <th className="px-6 py-3 text-right font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredActivities.map(act => {
                 const tName = data.teachers.find(t => t.id === act.teacherId)?.name;
                 const sName = data.subjects.find(s => s.id === act.subjectId)?.name;
                 const cName = data.classes.find(c => c.id === act.classId)?.name;
                 const isEditing = editingActivityId === act.id;
                 return (
                   <tr key={act.id} className="hover:bg-slate-50/80 transition-colors group">
                     {/* Professor */}
                     <td className="px-6 py-4 font-medium text-slate-700">
                       {isEditing ? (
                         <select className="border border-slate-300 rounded px-2 py-1 text-xs bg-white" value={editActivity.teacherId} onChange={e => setEditActivity({ ...editActivity, teacherId: e.target.value })}>
                           <option value="">Prof...</option>
                           {data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                         </select>
                       ) : (
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">{tName?.charAt(0)}</div>
                           {tName}
                         </div>
                       )}
                     </td>
                     {/* Matéria */}
                     <td className="px-6 py-4 text-slate-600">
                       {isEditing ? (
                         <select className="border border-slate-300 rounded px-2 py-1 text-xs bg-white" value={editActivity.subjectId} onChange={e => setEditActivity({ ...editActivity, subjectId: e.target.value })}>
                           <option value="">Mat...</option>
                           {data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                         </select>
                       ) : sName}
                     </td>
                     {/* Turma */}
                     <td className="px-6 py-4 text-slate-600">
                       {isEditing ? (
                         <select className="border border-slate-300 rounded px-2 py-1 text-xs bg-white" value={editActivity.classId} onChange={e => setEditActivity({ ...editActivity, classId: e.target.value })}>
                           <option value="">Tur...</option>
                           {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                       ) : (
                         <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">{cName}</span>
                       )}
                     </td>
                     {/* Carga */}
                     <td className="px-6 py-4 text-center">
                       {isEditing ? (
                         <input type="number" min="1" max="10" className="w-16 border border-slate-300 rounded px-2 py-1 text-xs text-center" value={editActivity.quantity} onChange={e => setEditActivity({ ...editActivity, quantity: e.target.value })} />
                       ) : (
                         <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold">{act.quantity} aulas</span>
                       )}
                     </td>
                     {/* Preferência */}
                     <td className="px-6 py-4 text-center">
                       {isEditing ? (
                         <label className="inline-flex items-center gap-1 text-xs">
                           <input type="checkbox" checked={editActivity.doubleLesson} onChange={e => setEditActivity({ ...editActivity, doubleLesson: e.target.checked })} className="h-3 w-3 rounded border-slate-300 text-purple-600" />
                           <span>Dupla</span>
                         </label>
                       ) : (
                         act.doubleLesson ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold"><Layers size={12}/> Dupla</span> : <span className="text-[10px] text-slate-400">—</span>
                       )}
                     </td>
                     {/* Ação */}
                     <td className="px-6 py-4 text-right">
                       {isEditing ? (
                         <div className="flex justify-end gap-2">
                           <button onClick={saveEditActivity} className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700">Salvar</button>
                           <button onClick={cancelEditActivity} className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300">Cancelar</button>
                         </div>
                       ) : (
                         <div className="flex justify-end gap-2">
                           <button onClick={() => startEditActivity(act)} className="text-slate-400 hover:text-indigo-600 p-2 transition-colors" title="Editar"><Pencil size={16} /></button>
                           <button onClick={() => setData(prev => ({ ...prev, activities: prev.activities.filter(a => a.id !== act.id) }))} className="text-slate-400 hover:text-red-600 p-2 transition-colors" title="Excluir"><Trash2 size={16} /></button>
                         </div>
                       )}
                     </td>
                   </tr>
                 )
              })}
              {filteredActivities.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-slate-400 bg-slate-50/30">
                     <div className="flex flex-col items-center gap-2">
                        <BookOpen size={40} className="opacity-20 mb-2"/>
                        <p className="font-medium">Nenhuma atividade encontrada</p>
                        <p className="text-xs">Adicione novas atividades no formulário acima</p>
                     </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ActivitiesSection;
