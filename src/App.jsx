import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Layout, Settings, Clock, BookOpen, Calendar, Menu, X, ChevronLeft, ChevronRight, Upload, Download, AlertTriangle, Info, Edit3, Rocket 
} from 'lucide-react';
import { DAYS } from './utils';
import SidebarItem from './components/SidebarItem';
import TimeSettingsSection from './components/TimeSettingsSection';
import DataInputSection from './components/DataInputSection';
import ActivitiesSection from './components/ActivitiesSection';
import TimetableSection from './components/TimetableSection';
import AgendaSection from './components/AgendaSection';
import AboutSection from './components/AboutSection';
import ManualEditSection from './components/ManualEditSection';
import { exportBackup, importBackup } from './services/stateService';
import { generateScheduleAsync } from './services/scheduleService';

const INITIAL_STATE = {
  timeSlots: [
    { id: 'ts1', start: '07:00', end: '07:50', type: 'aula' },
    { id: 'ts2', start: '07:50', end: '08:40', type: 'aula' },
    { id: 'ts3', start: '08:40', end: '09:30', type: 'aula' },
    { id: 'ts4', start: '09:30', end: '09:50', type: 'intervalo' }, 
    { id: 'ts5', start: '09:50', end: '10:40', type: 'aula' },
    { id: 'ts6', start: '10:40', end: '11:30', type: 'aula' },
    { id: 'ts7', start: '12:00', end: '13:00', type: 'almoco' },
    { id: 'ts8', start: '13:00', end: '13:50', type: 'aula' },
    { id: 'ts9', start: '19:00', end: '20:00', type: 'jantar' },
  ],
  teachers: [
    { id: 't1', name: 'Marisa N. S.', unavailable: [], shifts: ['Manhã'] }, 
    { id: 't2', name: 'Carlos Souza', unavailable: [], shifts: ['Integral (Manhã e Tarde)'] },
    { id: 't3', name: 'Maria Oliveira', unavailable: [], shifts: ['Tarde'] },
    { id: 't4', name: 'Roberto Santos', unavailable: [], shifts: ['Noite'] },
  ],
  subjects: [
    { id: 's1', name: 'Matemática', colorIndex: 1, unavailable: [], preferred: [] }, 
    { id: 's2', name: 'Português', colorIndex: 0, unavailable: [], preferred: [] },
    { id: 's3', name: 'História', colorIndex: 6, unavailable: [], preferred: [] },
    { id: 's4', name: 'Geografia', colorIndex: 2, unavailable: [], preferred: [] },
    { id: 's5', name: 'Ciências', colorIndex: 4, unavailable: [], preferred: [] },
  ],
  classes: [
    { 
      id: 'c1', 
      name: '6º Ano A', 
      shift: 'Manhã',
      activeSlots: ['ts1', 'ts2', 'ts3', 'ts4', 'ts5', 'ts6']
    },
    { 
      id: 'c2', 
      name: '9º Ano Int', 
      shift: 'Integral',
      activeSlots: ['ts1', 'ts2', 'ts3', 'ts4', 'ts5', 'ts6', 'ts7', 'ts8']
    },
  ],
  activities: [
    { id: 'a1', teacherId: 't1', subjectId: 's1', classId: 'c1', quantity: 5, split: 1, doubleLesson: true }, 
    { id: 'a2', teacherId: 't2', subjectId: 's3', classId: 'c1', quantity: 2, split: 1, doubleLesson: true },
  ],
  schedule: {},
  scheduleConflicts: []
};

const App = () => {
  const [data, setData] = useState(INITIAL_STATE);
  // Restauração de navegação salva no localStorage (view, subView, viewMode, selectedEntity, sidebarOpen)
  const getInitialNav = () => {
    try {
      const raw = localStorage.getItem('app_nav');
      if (raw) {
        const parsed = JSON.parse(raw);
        // For large screens always start collapsed now (override stored sidebarOpen)
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
        return {
          view: parsed.view || 'generate',
          subView: parsed.subView || 'teachers',
          viewMode: parsed.viewMode || 'class',
          selectedEntity: parsed.selectedEntity || '',
          sidebarOpen: isDesktop ? false : (typeof parsed.sidebarOpen === 'boolean' ? parsed.sidebarOpen : true)
        };
      }
    } catch (e) {
      // ignore and fall back to defaults
    }
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    return { view: 'generate', subView: 'teachers', viewMode: 'class', selectedEntity: '', sidebarOpen: !isDesktop };
  };
  const initialNav = getInitialNav();
  // Default view changed to 'generate' so Grade Inteligente is homepage
  const [view, setView] = useState(initialNav.view);
  const [subView, setSubView] = useState(initialNav.subView);
  const [sidebarOpen, setSidebarOpen] = useState(initialNav.sidebarOpen);
  const [generating, setGenerating] = useState(false);
  const [generationLog, setGenerationLog] = useState([]);
  const [viewMode, setViewMode] = useState(initialNav.viewMode);
  const [selectedEntity, setSelectedEntity] = useState(initialNav.selectedEntity);
  const [calendarSettings, setCalendarSettings] = useState({
    schoolYearStart: '2025-02-01',
    schoolYearEnd: '2025-12-15',
    events: []
  });

  const fileInputRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Persiste navegação para manter a página/visualização após reload
  useEffect(() => {
    try {
      const nav = { view, subView, viewMode, selectedEntity, sidebarOpen };
      localStorage.setItem('app_nav', JSON.stringify(nav));
    } catch (e) {
      // ignore quota or serialization errors
    }
  }, [view, subView, viewMode, selectedEntity, sidebarOpen]);

  const handleExportState = useCallback(() => exportBackup(data), [data]);

  const handleImportState = useCallback((e) => importBackup(e.target.files[0], setData), []);

  const generateSchedule = useCallback(() => 
    generateScheduleAsync(data, setData, setGenerationLog, setGenerating),
    [data]
  );


  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
      {isMobile && !sidebarOpen && (<button onClick={() => setSidebarOpen(true)} className="fixed top-3 left-4 z-50 p-2 bg-indigo-600 text-white rounded shadow-lg lg:hidden"><Menu size={20} /></button>)}
      {isMobile && sidebarOpen && (<div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}/>)}

      <aside className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 flex flex-col shadow-lg transition-all duration-300 ease-in-out ${isMobile ? (sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64') : sidebarOpen ? 'w-64' : 'w-16'} lg:relative lg:translate-x-0`}>
        <div className={`border-b border-slate-100 flex items-center ${sidebarOpen ? 'p-6 justify-between' : 'p-3 justify-center'} overflow-hidden whitespace-nowrap`}>
           <div className="flex items-center gap-2 text-indigo-700 mb-1">
             <Layout className="w-6 h-6 shrink-0" />
             {sidebarOpen && <span className="font-extrabold text-xl tracking-tight">Grade Inteligente</span>}
           </div>
           {sidebarOpen && !isMobile && (
             <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600" title="Colapsar">
               <ChevronLeft size={20} />
             </button>
           )}
           {!sidebarOpen && !isMobile && (
             <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-slate-600" title="Expandir">
               <ChevronRight size={20} />
             </button>
           )}
           {isMobile && sidebarOpen && (
             <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
           )}
        </div>
        <div className={`flex-1 py-4 space-y-1 overflow-hidden whitespace-nowrap overflow-y-auto`}>
          {sidebarOpen && <div className="px-4 pb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Menu Principal</div>}
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Info} label="Sobre o Sistema" active={view === 'about'} onClick={() => { setView('about'); if(isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Clock} label="Configure os Horários" active={view === 'data' && subView === 'timeSettings'} onClick={() => { setView('data'); setSubView('timeSettings'); if(isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Settings} label="Cadastro" active={view === 'data' && subView !== 'timeSettings'} onClick={() => { setView('data'); setSubView('teachers'); if(isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={BookOpen} label="Atribuições" active={view === 'activities'} onClick={() => { setView('activities'); if(isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Rocket} label="Gerar/Visualizar" active={view === 'generate'} onClick={() => { setView('generate'); if(isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Edit3} label="Edição Manual" active={view === 'manualEdit'} onClick={() => { setView('manualEdit'); if(isMobile) setSidebarOpen(false); }} />
          <div className="my-4 border-t border-slate-100"></div>
          {sidebarOpen && <div className="px-4 pb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Operações</div>}
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Calendar} label="Agenda e Grade" active={view === 'agenda'} onClick={() => { setView('agenda'); if(isMobile) setSidebarOpen(false); }} />
          <div className="my-4 border-t border-slate-100"></div>
          {sidebarOpen && <div className="px-4 pb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Contato</div>}
          <a href="https://github.com/binarymath" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-md transition-colors mx-2">
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            {sidebarOpen && <span className="font-medium">GitHub</span>}
          </a>
          <a href="https://www.linkedin.com/in/fabiomatech/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors mx-2">
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            {sidebarOpen && <span className="font-medium">LinkedIn</span>}
          </a>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-100 transition-all duration-300">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shadow-sm z-0 relative shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-md"><Menu size={24} /></button>
            {/* Toggle removido do header em telas grandes; controle agora dentro do sidebar */}
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate">{view === 'about' ? 'Sobre o Sistema' : view === 'data' && subView === 'timeSettings' ? 'Configuração de Horários' : view === 'data' ? 'Dados Institucionais' : view === 'activities' ? 'Atribuições' : view === 'manualEdit' ? 'Edição Manual da Grade' : view === 'agenda' ? 'Agenda e Grade' : 'Gerar/Visualizar Grade'}</h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
             <input type="file" ref={fileInputRef} onChange={handleImportState} style={{display: 'none'}} accept=".json" />
             <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors text-sm font-medium" title="Importar Backup"><Upload size={16} /> <span className="hidden sm:inline">Restaurar</span></button>
             <button onClick={handleExportState} className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors text-sm font-medium" title="Salvar Backup"><Download size={16} /> <span className="hidden sm:inline">Backup</span></button>
          </div>
        </header>
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
           {view === 'about' && <AboutSection />}
           {view === 'data' && subView === 'timeSettings' && <TimeSettingsSection data={data} setData={setData} />}
           {view === 'data' && subView !== 'timeSettings' && <DataInputSection data={data} setData={setData} subView={subView} setSubView={setSubView} />}
           {view === 'activities' && <ActivitiesSection data={data} setData={setData} />}
           {view === 'manualEdit' && <ManualEditSection data={data} setData={setData} />}
           {view === 'generate' && (
             <div className="flex flex-col gap-4">
               <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                 <h2 className="text-lg font-bold text-slate-800">Gerar Grade</h2>
                 <button onClick={generateSchedule} disabled={generating} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed" aria-busy={generating}>
                   {generating ? 'Gerando...' : 'Gerar Agora'}
                 </button>
               </div>
               {generationLog.length > 0 && (
                 <div 
                   className="bg-slate-800 text-slate-200 p-4 rounded-lg text-xs font-mono max-h-40 overflow-y-auto"
                   role="log"
                   aria-live="polite"
                   aria-label="Log de geração da grade"
                 >
                   {generationLog.map((log, i) => <div key={i}>{log}</div>)}
                 </div>
               )}
               {data.scheduleConflicts && data.scheduleConflicts.length > 0 && (
                 <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm flex flex-col gap-2" role="alert" aria-live="assertive">
                   <div className="flex items-center gap-2 font-semibold text-red-700"><AlertTriangle size={16}/> Conflitos de professor detectados</div>
                   <ul className="list-disc pl-5 space-y-1 text-red-700">
                     {data.scheduleConflicts.map((c, idx) => {
                       const teacherName = data.teachers.find(t => t.id === c.teacherId)?.name || c.teacherId;
                       const classNames = c.classes.map(cid => data.classes.find(cl => cl.id === cid)?.name || cid).join(' & ');
                       const dayName = DAYS[c.dayIdx] || `Dia ${c.dayIdx}`;
                       return (
                         <li key={idx}>
                           <span className="font-semibold">{teacherName}</span> conflito em <span className="font-medium">{classNames}</span> ({dayName}) — {c.reason}
                         </li>
                       );
                     })}
                   </ul>
                   <p className="text-[11px] text-red-600">Ajuste atividades, turnos ou horários para eliminar conflitos.</p>
                 </div>
               )}
               <div className="flex flex-wrap gap-6 mb-4">
                 <div className="flex flex-col">
                   <label className="text-xs font-semibold text-slate-600 mb-1">Visualizar Grade</label>
                   <select value={viewMode} onChange={e => { setViewMode(e.target.value); setSelectedEntity(''); }} className="border p-2 rounded text-sm bg-white shadow-sm">
                     <option value="class">Turmas</option>
                     <option value="teacher">Professores</option>
                     <option value="subject">Matérias</option>
                   </select>
                 </div>
                 <div className="flex flex-col">
                   <label className="text-xs font-semibold text-slate-600 mb-1">{viewMode === 'class' ? 'Selecione a Turma' : viewMode === 'teacher' ? 'Selecione o Professor' : 'Selecione a Matéria'}</label>
                   <select value={selectedEntity} onChange={e => setSelectedEntity(e.target.value)} className="border p-2 rounded text-sm bg-white shadow-sm min-w-[180px]">
                     <option value="">{viewMode === 'class' ? 'Escolha a turma...' : viewMode === 'teacher' ? 'Escolha o professor...' : 'Escolha a matéria...'}</option>
                     <option value="all">📋 Todos</option>
                     {viewMode === 'class' && data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                     {viewMode === 'teacher' && data.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                     {viewMode === 'subject' && data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                   </select>
                 </div>
               </div>
               {selectedEntity && selectedEntity !== 'all' && (
                 <TimetableSection 
                   data={data} 
                   viewMode={viewMode} 
                   selectedEntity={selectedEntity} 
                   calendarSettings={calendarSettings} 
                   setCalendarSettings={setCalendarSettings} 
                    showAgendaControls={false}
                  />
               )}
               {selectedEntity === 'all' && (
                 <div className="space-y-4">
                   {viewMode === 'class' && data.classes.map(cls => (
                         <div key={cls.id} className="border-t-4 border-indigo-500 pt-4">
                           <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                             <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm">{cls.name}</span>
                           </h3>
                           <TimetableSection 
                             data={data} 
                             viewMode={viewMode} 
                             selectedEntity={cls.id} 
                             calendarSettings={calendarSettings} 
                             setCalendarSettings={setCalendarSettings} 
                             showAgendaControls={false}
                           />
                         </div>
                       ))}
                   {viewMode === 'teacher' && data.teachers.map(teacher => (
                         <div key={teacher.id} className="border-t-4 border-emerald-500 pt-4">
                           <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                             <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm">{teacher.name}</span>
                           </h3>
                           <TimetableSection 
                             data={data} 
                             viewMode={viewMode} 
                             selectedEntity={teacher.id} 
                             calendarSettings={calendarSettings} 
                             setCalendarSettings={setCalendarSettings} 
                             showAgendaControls={false}
                           />
                         </div>
                       ))}
                   {viewMode === 'subject' && data.subjects.map(subject => (
                      <div key={subject.id} className="border-t-4 border-violet-500 pt-4">
                        <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                          <span className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full text-sm">{subject.name}</span>
                        </h3>
                        <TimetableSection 
                          data={data} 
                          viewMode={viewMode} 
                          selectedEntity={subject.id} 
                          calendarSettings={calendarSettings} 
                          setCalendarSettings={setCalendarSettings} 
                          showAgendaControls={false}
                        />
                      </div>
                   ))}
                 </div>
               )}
             </div>
           )}
           {view === 'agenda' && (
             <AgendaSection 
               data={data}
               calendarSettings={calendarSettings}
               setCalendarSettings={setCalendarSettings}
             />
           )}
        </div>
      </main>
    </div>
  );
};

export default App;
