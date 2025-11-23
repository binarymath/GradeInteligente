import React from 'react';
import { FileText, Download, Calendar } from 'lucide-react';
import { exportPDF, exportExcel } from '../services/exporters';
import { exportICS } from '../services/icsExporter';

/**
 * Conjunto de botões de exportação (PDF, Excel, ICS) com acessibilidade.
 * Mostra ICS apenas se calendarSettings for fornecido.
 */
const ExportButtons = ({ viewMode, selectedEntity, data, displayPeriods, calendarSettings }) => {
  const disabled = !selectedEntity;
  const commonCls = 'p-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => exportPDF({ viewMode, selectedEntity, data, displayPeriods })}
        disabled={disabled}
        title="Exportar PDF"
        className={`${commonCls} bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700`}
      >
        <FileText size={14} /> <span className="sr-only">PDF</span>
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
    </div>
  );
};

export default ExportButtons;
