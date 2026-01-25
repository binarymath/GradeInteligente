import React from 'react';
import { FileText, Download, Calendar, CalendarPlus, Printer } from 'lucide-react';
import { exportPDF, exportExcel, exportDOC } from '../services/exporters';
import { exportICS, exportIncrementalICS } from '../services/icsExporter';

/**
 * Conjunto de botões de exportação (PDF, Excel, ICS, ICS Incremental) com acessibilidade.
 * Mostra ICS apenas se calendarSettings for fornecido.
 * Mostra ICS Incremental apenas se houver eventos de dias específicos.
 */
const ExportButtons = ({ viewMode, selectedEntity, data, displayPeriods, calendarSettings }) => {
  const disabled = !selectedEntity;
  const hasSpecificDayEvents = calendarSettings?.specificDayEvents?.length > 0;
  const commonCls = 'p-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => exportDOC({ viewMode, selectedEntity, data, displayPeriods })}
        disabled={disabled}
        title="Exportar Word (.doc)"
        className={`${commonCls} bg-blue-800 border-blue-800 text-white hover:bg-blue-900`}
      >
        <FileText size={14} /> <span className="sr-only">Word</span>
      </button>
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
        onClick={() => exportExcel({ viewMode, selectedEntity, data })}
        disabled={disabled}
        title="Exportar Excel"
        className={`${commonCls} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700`}
      >
        <Download size={14} /> <span className="sr-only">Excel</span>
      </button>
      {calendarSettings && (
        <button
          type="button"
          onClick={() => exportICS({ viewMode, selectedEntity, data, calendarSettings })}
          disabled={disabled}
          title="Exportar Agenda (.ics)"
          className={`${commonCls} bg-blue-600 border-blue-600 text-white hover:bg-blue-700`}
        >
          <Calendar size={14} /> <span className="sr-only">ICS</span>
        </button>
      )}
      {calendarSettings && hasSpecificDayEvents && (
        <button
          type="button"
          onClick={() => exportIncrementalICS({ viewMode, selectedEntity, data, calendarSettings })}
          disabled={disabled}
          title="Exportar Eventos Especiais (.ics)"
          className={`${commonCls} bg-sky-600 border-sky-600 text-white hover:bg-sky-700`}
        >
          <CalendarPlus size={14} /> <span className="sr-only">ICS Incremental</span>
        </button>
      )}
    </div>
  );
};

export default ExportButtons;
