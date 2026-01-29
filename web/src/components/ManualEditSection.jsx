
import React, { useState } from 'react';
import { Edit3, Trash2, Printer, FileSpreadsheet, Edit2, PanelLeftClose, PanelLeft, ArrowLeftRight, Maximize2, Minimize2 } from 'lucide-react';
import { COLORS } from '../utils';
import { exportAllSchedulesToExcel } from '../services/excelExport';

// Hooks
import { useManualState } from './manual/hooks/useManualState';
import { useManualCalculations } from './manual/hooks/useManualCalculations';
import { useSuggestionLogic } from './manual/hooks/useSuggestionLogic';
import { useManualActions } from './manual/hooks/useManualActions';

// Components
import PendingSidebar from './manual/ui/PendingSidebar';
import GridTable from './manual/ui/GridTable';
import ResolutionModal from './manual/ui/ResolutionModal';
import AddLessonModal from './manual/ui/AddLessonModal';
import ClassDetailModal from './manual/ui/ClassDetailModal';

// Styles for diagonal stripe (ghost slots)
import '../index.css'; // Make sure diagonal-stripe is defined here or inline

const ManualEditSection = ({ data, setData }) => {
  // State
  const {
    editMode, setEditMode,
    selectedCell, setSelectedCell,
    showAddModal, setShowAddModal,
    resolveModal, setResolveModal,
    manualLog, setManualLog,
    printingClass, setPrintingClass
  } = useManualState();

  const [viewClassId, setViewClassId] = useState(null);

  const [newEntry, setNewEntry] = useState({ teacherId: '', subjectId: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);

  // Logic Hooks
  const { pendingItems, missingDetails, slotAnalysis, summary } = useManualCalculations(data);
  const { calculateSuggestions } = useSuggestionLogic(data);
  const { applySuggestion, removeLesson } = useManualActions(data, setData, setManualLog, setResolveModal, setShowAddModal);

  // Handlers
  const handleResolveClick = (item) => {
    const suggestions = calculateSuggestions(item);
    setResolveModal({ item, suggestions });
  };

  const handleCellClick = (dayIdx, slotIdx, classId) => {
    setSelectedCell({ dayIdx, slotIdx, classId });
    setNewEntry({ teacherId: '', subjectId: '' }); // Reset form
    setShowAddModal(true);
  };

  const handleManualAddLesson = (options = {}) => {
    // Logic from executeAddLesson simplified ideally to "setData" directly here or via hook
    // Since AddLessonModal is simple now, let's implement the save logic here or pass a refined handler
    if (!selectedCell || !newEntry.teacherId || !newEntry.subjectId) return;

    const { dayIdx, slotIdx, classId } = selectedCell;
    const targetClass = data.classes.find(c => c.id === classId);
    const timeSlot = data.timeSlots[slotIdx];

    // Update Data
    const timeKey = `${dayIdx}-${slotIdx}`; // Or DAYS[dayIdx]-idx? 
    // Need consistent timeKey format: "Segunda-0"
    // Wait, utils defines logic for keys. Let's trust ManualActions if we move it there.
    // For now, implementing direct update for simplicity as 'handleForceAddLesson' logic

    // Important: Key format used in GridTable is `classId-Key`.
    // Key format: DAYS[dayIdx]-slotIdx
    const dayName = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'][dayIdx];
    const tKey = `${dayName}-${slotIdx}`;
    const sKey = `${classId}-${tKey}`;

    setData(prev => {
      const newSchedule = { ...(prev.schedule || {}) };

      // 1. Kick Conflict if requested
      if (options && options.conflictKey) {
        delete newSchedule[options.conflictKey];
      }

      // 2. Add New Lesson
      newSchedule[sKey] = {
        teacherId: newEntry.teacherId,
        subjectId: newEntry.subjectId,
        classId,
        timeKey: tKey
      };

      return {
        ...prev,
        schedule: newSchedule
      };
    });

    // Log
    const subName = data.subjects.find(s => s.id === newEntry.subjectId)?.name;
    const extraLog = options?.conflictKey ? ' (Substituição Forçada)' : '';
    setManualLog(prev => [`Adicionado Manual: ${subName} em ${dayName}${extraLog}`, ...prev]);

    setShowAddModal(false);
  };

  // Printing logic (Keep as is or extract if huge)
  const handlePrint = (classId) => {
    // (Placeholder for existing print logic - kept simple here to focus on modularization)
    window.print();
  };

  return (
    <div className={`${isMaximized ? 'fixed inset-0 z-[100] h-screen w-screen rounded-none' : 'flex h-[calc(100vh-140px)] rounded-lg'} bg-slate-50 shadow-sm border border-slate-200 overflow-hidden flex transition-all duration-300`}>

      {/* SIDEBAR */}
      {/* SIDEBAR */}
      {isSidebarOpen && (
        <PendingSidebar
          manualLog={manualLog}
          pendingItems={pendingItems}
          handleResolveClick={handleResolveClick}
          slotAnalysis={slotAnalysis}
          summary={summary}
          data={data}
        />
      )}

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-white">

        {/* TOOLBAR */}
        {/* TOOLBAR (Standard) */}
        {!isMaximized && (
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
            <div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title={isSidebarOpen ? "Recolher Sidebar" : "Expandir Sidebar"}
                >
                  {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
                </button>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Edit3 className="text-indigo-600" />
                    Edição Manual da Grade
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Clique nas células vazias para adicionar. Arraste ou use ações rápidas para ajustar.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => exportAllSchedulesToExcel(data)}
                className="px-3 py-2 bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center gap-2 text-sm font-bold transition-colors"
              >
                <FileSpreadsheet size={16} /> Excel
              </button>

              <div className="h-6 w-px bg-slate-200 mx-1"></div>

              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${editMode
                  ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-200'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                  }`}
              >
                {editMode ? <Edit2 size={16} /> : <Edit2 size={16} />}
                {editMode ? 'Modo de Edição: ATIVO' : 'Ativar Edição'}
              </button>

              <div className="h-6 w-px bg-slate-200 mx-1"></div>

              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className={`p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors ${isMaximized ? 'bg-slate-100 text-indigo-600' : ''}`}
                title={isMaximized ? "Restaurar Tela" : "Expandir Tela"}
              >
                {isMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
            </div>
          </div>
        )}

        {/* FLOATING RESTORE BUTTON (Fullscreen only) */}
        {isMaximized && (
          <div className="absolute top-2 right-4 z-[110]">
            <button
              onClick={() => setIsMaximized(false)}
              className="p-2 rounded-full bg-white/90 shadow-md text-slate-500 hover:text-indigo-600 hover:bg-white border border-slate-200 transition-all backdrop-blur-sm"
              title="Restaurar Tela"
            >
              <Minimize2 size={20} />
            </button>
          </div>
        )}

        {/* GRID */}
        <div className="flex-1 overflow-auto bg-slate-50 relative p-4 flex flex-col">
          {/* Hint Alert */}
          {editMode && (
            <div className="mb-2 bg-indigo-50 border border-indigo-100 p-2 rounded-lg flex items-center gap-2 shadow-sm">
              <div className="text-indigo-600">
                <Edit3 size={14} />
              </div>
              <div className="text-xs text-indigo-800">
                <span className="font-bold mr-1">Modo de Edição Ativo:</span>
                Clique nos espaços vazios (+) para alocar. Passe o mouse para ver ações.
              </div>
            </div>
          )}

          <GridTable
            data={data}
            displayPeriods={['Manhã', 'Tarde']} // Or pass from props
            editMode={editMode}
            selectedCell={selectedCell}
            manualLog={manualLog}
            handleCellClick={handleCellClick}
            handleRemoveLesson={(d, s, c) => removeLesson(d, s, c)}
            COLORS={COLORS}
            onClassClick={(id) => setViewClassId(id)}
            isMaximized={isMaximized}
          />
        </div>

      </div>

      {/* MODALS */}
      <ResolutionModal
        resolveModal={resolveModal}
        onClose={() => setResolveModal(null)}
        onApply={(s) => applySuggestion(s, resolveModal.item)}
        data={data}
      />

      <AddLessonModal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        selectedCell={selectedCell}
        data={data}
        newEntry={newEntry}
        setNewEntry={setNewEntry}
        onSave={handleManualAddLesson}
        availableSlots={[]} // Can calculate if needed
      />

      <ClassDetailModal
        classId={viewClassId}
        onClose={() => setViewClassId(null)}
        data={data}
        COLORS={COLORS}
      />

    </div>
  );
};

export default ManualEditSection;
