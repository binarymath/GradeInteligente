import React from 'react';
import { Rocket, Settings, AlertTriangle, Upload, ChevronUp, ChevronDown, X } from 'lucide-react';
import TimetableSection from '../TimetableSection';

const GenerateView = ({
    generating,
    generateSchedule,
    repairing,
    handleSmartRepair,
    verifySchedule,
    viewMode,
    selectedEntities,
    filteredClassIds,
    data,
    displayPeriods,
    handleExportState,
    exportExcel,
    triggerFileUpload,
    fileInputRef,
    handleImportState,
    generationLog,
    isVerified,
    showLog,
    setShowLog,
    handleCloseLog,
    logContainerRef,
    setViewMode,
    setSelectedEntities,
    setFilteredClassIds,
    dropdownRef,
    isDropdownOpen,
    setIsDropdownOpen,
    classFilterRef,
    isClassFilterOpen,
    setIsClassFilterOpen,
    calendarSettings,
    setCalendarSettings
}) => {
    return (
        <div className="space-y-6">
            {/* Header / Actions */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                {/* Grade Generation Controls */}
                <div className="flex flex-wrap gap-2 w-full xl:w-auto">
                    <button
                        onClick={generating ? null : generateSchedule}
                        disabled={generating || repairing}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white shadow-md transition-all ${generating ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0'
                            }`}
                    >
                        {generating ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <Rocket size={20} />}
                        {generating ? 'Gerando...' : 'Gerar Grade'}
                    </button>

                    <button
                        onClick={repairing ? null : handleSmartRepair}
                        disabled={generating || repairing}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                    >
                        {repairing ? <div className="animate-spin h-4 w-4 border-2 border-emerald-600 border-t-transparent rounded-full" /> : <Settings size={18} />}
                        {repairing ? 'Ajustando...' : 'Ajustar'}
                    </button>

                    <button
                        onClick={verifySchedule}
                        disabled={generating || repairing}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors"
                    >
                        <AlertTriangle size={18} className="text-amber-500" />
                        Verificar
                    </button>
                </div>

                {/* Export / Import Controls */}
                <div className="flex flex-wrap gap-2 w-full xl:w-auto border-t xl:border-t-0 pt-3 xl:pt-0 border-slate-100">

                    <div className="hidden md:block w-px h-8 bg-slate-300 mx-2"></div>

                    <button
                        onClick={triggerFileUpload}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                        title="Carregar Backup"
                    >
                        <Upload size={16} />
                        Importar
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImportState} accept=".json" className="hidden" />
                </div>
            </div>

            {/* Logs Area */}
            {(generationLog.length > 0) && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col max-h-[500px] animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center sticky top-0 z-10">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isVerified ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></div>
                            Status da Operação
                        </h3>
                        <div className="flex gap-2">
                            <button onClick={() => setShowLog(!showLog)} className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors">
                                {showLog ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                            <button onClick={handleCloseLog} className="p-1 hover:bg-red-50 hover:text-red-500 rounded text-slate-400 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    {showLog && (
                        <div ref={logContainerRef} className="p-4 overflow-y-auto bg-slate-900 font-mono text-xs md:text-sm leading-relaxed text-slate-300 custom-scrollbar">
                            {generationLog.map((line, idx) => {
                                let className = "py-0.5 border-l-2 pl-3 border-transparent hover:bg-white/5 transition-colors block";
                                if (line.includes('✅') || line.includes('Finalizado')) className += " text-emerald-400 border-emerald-500/50 bg-emerald-500/5";
                                else if (line.includes('⚠️') || line.includes('conflito')) className += " text-amber-300 border-amber-500/50 bg-amber-500/5";
                                else if (line.includes('🚨') || line.includes('Erro')) className += " text-red-400 border-red-500/50 bg-red-500/5 font-bold";
                                else if (line.includes('💡')) className += " text-blue-300 border-blue-500/50";
                                else if (line.startsWith('   •')) className += " ml-4 text-slate-400";
                                else if (line === '') className = "h-2";

                                return <span key={idx} className={className}>{line}</span>;
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Main Timetable */}
            <TimetableSection
                data={data}
                viewMode={viewMode}
                setViewMode={setViewMode}
                selectedEntities={selectedEntities}
                setSelectedEntities={setSelectedEntities}
                displayPeriods={displayPeriods}
                filteredClassIds={filteredClassIds}
                setFilteredClassIds={setFilteredClassIds}
                dropdownRef={dropdownRef}
                isDropdownOpen={isDropdownOpen}
                setIsDropdownOpen={setIsDropdownOpen}
                classFilterRef={classFilterRef}
                isClassFilterOpen={isClassFilterOpen}
                setIsClassFilterOpen={setIsClassFilterOpen}
                calendarSettings={calendarSettings}
                setCalendarSettings={setCalendarSettings}
            />
        </div>
    );
};

export default GenerateView;
