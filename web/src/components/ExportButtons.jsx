import React, { useState, useRef, useEffect } from 'react';
import { FileText, Download, Calendar, CalendarPlus, Printer, ChevronDown } from 'lucide-react';
import { exportPDF, exportExcel, exportDOC } from '../services/exporters';
import { exportICS, exportIncrementalICS } from '../services/icsExporter';

/**
 * Conjunto de botões de exportação (PDF, Excel, ICS, ICS Incremental) com acessibilidade.
 * Mostra ICS apenas se calendarSettings for fornecido.
 * Mostra ICS Incremental apenas se houver eventos de dias específicos.
 */
const ExportButtons = ({ viewMode, selectedEntities, data, displayPeriods, calendarSettings, filteredClassIds = null }) => {
  const disabled = !selectedEntities || selectedEntities.length === 0;
  const hasSpecificDayEvents = calendarSettings?.specificDayEvents?.length > 0;
  // For single-item exporters (legacy PDF/DOC support if not updated yet), take first
  const firstEntity = selectedEntities?.[0];

  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const docDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (docDropdownRef.current && !docDropdownRef.current.contains(event.target)) {
        setDocDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleDocExport = (mode) => {
    exportDOC({ viewMode, selectedEntities, data, displayPeriods, filteredClassIds, mode }); // mode: 'combined' | 'separate'
    setDocDropdownOpen(false);
  };

  const commonCls = 'p-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="flex gap-2 relative">
      <div className="relative" ref={docDropdownRef}>
        <button
          type="button"
          onClick={() => setDocDropdownOpen(!docDropdownOpen)}
          disabled={disabled}
          title="Exportar Word (.doc)"
          className={`${commonCls} bg-blue-800 border-blue-800 text-white hover:bg-blue-900 pr-1`}
        >
          <FileText size={14} /> <span className="sr-only">Word</span>
          <ChevronDown size={14} className={`ml-0.5 transition-transform ${docDropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        {docDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1">
            <button
              onClick={() => handleDocExport('combined')}
              className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <FileText size={14} /> Arquivo Único
            </button>
            <button
              onClick={() => handleDocExport('separate')}
              className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <FileText size={14} /> Arquivos Individualizados (.zip)
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        disabled={disabled}
        title="Imprimir"
        className={`${commonCls} bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700`}
      >
        <Printer size={14} /> <span className="sr-only">Imprimir</span>
      </button>
      <button
        type="button"
        onClick={() => exportExcel({ viewMode, selectedEntities, data, filteredClassIds })}
        disabled={disabled}
        title="Exportar Excel"
        className={`${commonCls} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700`}
      >
        <Download size={14} /> <span className="sr-only">Excel</span>
      </button>
    </div>
  );
};

export default ExportButtons;
