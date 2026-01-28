import React from 'react';
import { Layout, Info, Clock, Settings, BookOpen, Rocket, Edit3, X, ChevronLeft, ChevronRight } from 'lucide-react';
import SidebarItem from '../SidebarItem';

const Sidebar = ({ sidebarOpen, setSidebarOpen, isMobile, view, subView, setView, setSubView }) => {
    return (
        <aside className={`bg-white border-r border-slate-200 flex flex-col shadow-lg transition-all duration-300 ease-in-out ${isMobile ? (sidebarOpen ? 'w-64 z-50' : 'w-0') : sidebarOpen ? 'w-64' : 'w-16'} lg:relative shrink-0`}>
            <div className={`border-b border-slate-100 flex items-center ${sidebarOpen ? 'p-6 justify-between' : 'p-3 justify-center'} overflow-hidden whitespace-nowrap ${isMobile && !sidebarOpen ? 'hidden' : ''}`}>
                <div className="flex items-center gap-2 text-indigo-700 mb-1">
                    <Layout className="w-6 h-6 shrink-0" />
                    {sidebarOpen && (
                        <div className="flex flex-col">
                            <span className="font-extrabold text-xl tracking-tight leading-none">Grade Inteligente</span>
                            <span className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold mt-0.5">Atualizado em {__BUILD_DATE__}</span>
                        </div>
                    )}
                </div>
                {sidebarOpen && isMobile && (
                    <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                )}
                {sidebarOpen && !isMobile && (
                    <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={20} /></button>
                )}
                {!sidebarOpen && !isMobile && (
                    <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-slate-600"><ChevronRight size={20} /></button>
                )}
            </div>

            {!isMobile && (
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={`absolute top-1/2 -translate-y-1/2 right-[-14px] bg-white border border-slate-200 shadow-sm rounded-full p-1 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors ${isMobile && !sidebarOpen ? 'hidden' : ''}`}
                >
                    {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                </button>
            )}

            <div className={`flex-1 py-4 space-y-1 overflow-hidden whitespace-nowrap overflow-y-auto ${isMobile && !sidebarOpen ? 'hidden' : ''}`}>
                <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Info} label="Sobre o Sistema" active={view === 'about'} onClick={() => { setView('about'); if (isMobile) setSidebarOpen(false); }} />
                <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Clock} label="Configure os Horários" active={view === 'data' && subView === 'timeSettings'} onClick={() => { setView('data'); setSubView('timeSettings'); if (isMobile) setSidebarOpen(false); }} />
                <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Settings} label="Cadastro" active={view === 'data' && subView !== 'timeSettings'} onClick={() => { setView('data'); setSubView('subjects'); if (isMobile) setSidebarOpen(false); }} />
                <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={BookOpen} label="Atribuições" active={view === 'activities'} onClick={() => { setView('activities'); if (isMobile) setSidebarOpen(false); }} />
                <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Rocket} label="Gerar/Visualizar" active={view === 'generate'} onClick={() => { setView('generate'); if (isMobile) setSidebarOpen(false); }} />
                <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Edit3} label="Edição Manual" active={view === 'manualEdit'} onClick={() => { setView('manualEdit'); if (isMobile) setSidebarOpen(false); }} />
            </div>
        </aside>
    );
};

export default Sidebar;
