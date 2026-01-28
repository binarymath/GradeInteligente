import React from 'react';
import { Menu } from 'lucide-react';

const Header = ({ sidebarOpen, setSidebarOpen, isMobile, view, subView, calendarSettings }) => {
    return (
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-4">
                {isMobile && !sidebarOpen && (
                    <button onClick={() => setSidebarOpen(true)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors">
                        <Menu size={24} />
                    </button>
                )}
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    {view === 'data' ? (subView === 'timeSettings' ? 'Configuração de Horários' : 'Cadastro de Dados') :
                        view === 'activities' ? 'Atribuições de Aulas' :
                            view === 'generate' ? 'Gerar e Visualizar Grade' :
                                view === 'manualEdit' ? 'Edição Manual' : 'Sobre o Sistema'}
                </h2>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ano Letivo</div>
                    <div className="font-bold text-indigo-700 bg-indigo-50 px-2 rounded">{calendarSettings.schoolYearStart.split('-')[0]}</div>
                </div>
            </div>
        </header>
    );
};

export default Header;
