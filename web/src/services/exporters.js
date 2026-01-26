import { saveAs } from 'file-saver';
import { DAYS } from '../utils';

/**
 * Helper to get standardized filename
 */
function getFileName(viewMode, selectedEntity, data) {
  let entityName = '';
  if (viewMode === 'class') {
    entityName = data.classes.find(c => c.id === selectedEntity)?.name || 'Turma';
  } else if (viewMode === 'teacher') {
    entityName = data.teachers.find(t => t.id === selectedEntity)?.name || 'Professor';
  } else if (viewMode === 'subject') {
    entityName = data.subjects.find(s => s.id === selectedEntity)?.name || 'Matéria';
  } else if (viewMode === 'day') {
    entityName = selectedEntity || 'Dia';
  }
  // Remove caracteres inválidos para nome de arquivo
  const safeName = entityName.replace(/[<>:"/\\|?*]/g, '');
  return `GradeInteligente (${safeName})`;
}

/**
 * Gera PDF da grade para uma turma ou professor.
 * @param {Object} params
 * @param {'class'|'teacher'} params.viewMode
 * @param {string} params.selectedEntity
 * @param {Object} params.data Estado completo (classes, teachers, subjects, timeSlots, schedule)
 * @param {Array} params.displayPeriods Períodos filtrados para exibição
 */
export async function exportPDF({ viewMode, selectedEntity, data, displayPeriods }) {
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default || autoTableModule;

  const doc = new jsPDF({ orientation: 'landscape' });
  const fileName = getFileName(viewMode, selectedEntity, data);
  const titleText = fileName.replace('GradeInteligente', 'Grade Horária');

  doc.setFontSize(18);
  doc.text(titleText, 14, 22);
  doc.setFontSize(10);
  doc.text('Gerado pelo Sistema de Grade Inteligente', 14, 28);

  const head = [['Horário', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']];
  const body = displayPeriods.map(slot => {
    const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
    const row = [`${slot.start} - ${slot.end}`];

    if (slot.type !== 'aula') {
      const label = slot.type === 'almoco' ? 'ALMOÇO' : slot.type === 'jantar' ? 'JANTAR' : 'INTERVALO';
      return [row[0], { content: label, colSpan: 5, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: [100, 100, 100], fontStyle: 'bold' } }];
    }

    DAYS.forEach((_, dayIdx) => {
      const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;
      let cellContent = '';

      if (viewMode === 'class') {
        const entry = Object.values(data.schedule).find(v => v.classId === selectedEntity && v.timeKey === timeKey);
        if (entry) {
          const subj = data.subjects.find(s => s.id === entry.subjectId);
          const teacher = data.teachers.find(t => t.id === entry.teacherId);
          if (subj && teacher) {
            cellContent = `${subj.name}\n(${teacher.name})`;
          }
        }
      } else if (viewMode === 'teacher') {
        const entry = Object.values(data.schedule).find(v => v.teacherId === selectedEntity && v.timeKey === timeKey);
        if (entry) {
          const subj = data.subjects.find(s => s.id === entry.subjectId);
          const cls = data.classes.find(c => c.id === entry.classId);
          if (subj && cls) {
            cellContent = `${subj.name}\n(${cls.name})`;
          }
        }
      } else if (viewMode === 'subject') {
        const entries = Object.values(data.schedule).filter(v => v.subjectId === selectedEntity && v.timeKey === timeKey);
        if (entries.length) {
          cellContent = entries.map(e => {
            const cls = data.classes.find(c => c.id === e.classId);
            const teacher = data.teachers.find(t => t.id === e.teacherId);
            return `${cls?.name || '?'} (${teacher?.name || '?'})`;
          }).join('\n');
        }
      }
      row.push(cellContent);
    });
    return row;
  });

  autoTable(doc, {
    head, body,
    startY: 35,
    styles: { fontSize: 10, cellPadding: 3, valign: 'middle' },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    theme: 'grid',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35, halign: 'center' } }
  });

  doc.save(`${fileName}.pdf`);
}

/**
 * Exporta a grade em Excel (XLSX) para turma ou professor.
 * @param {Object} params
 * @param {'class'|'teacher'} params.viewMode
 * @param {string} params.selectedEntity
 * @param {Object} params.data Estado completo
 */
/**
 * @param {'class'|'teacher'|'day'|'subject'} params.viewMode
 * @param {string|string[]} params.selectedEntities
 * @param {Object} params.data Estado completo
 */
export async function exportExcel({ viewMode, selectedEntities, data, filteredClassIds = null }) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');

  // Ensure array
  const entities = Array.isArray(selectedEntities) ? selectedEntities : [selectedEntities];
  const uniqueEntities = [...new Set(entities.filter(Boolean))];

  if (uniqueEntities.length === 0) {
    console.warn("Nenhuma entidade selecionada para exportação.");
    return;
  }

  // Common Palette
  const COLORS = [
    'FFADAD', 'FFD6A5', 'FDFFB6', 'CAFFBF', '9BF6FF', 'A0C4FF', 'BDB2FF', 'FFC6FF', // Pastels
    'EF476F', 'FFD166', '06D6A0', '118AB2', '073B4C', // Vivids
    'E63946', 'F1FAEE', 'A8DADC', '457B9D', '1D3557'  // Others
  ];

  const getSubjectColor = (subj) => {
    if (subj?.color && /^#[0-9A-Fa-f]{6}$/.test(subj.color)) {
      return subj.color.replace('#', '');
    }
    const idx = data.subjects.findIndex(s => s.id === subj.id);
    if (idx >= 0) return COLORS[idx % COLORS.length];
    return 'EFF6FF';
  };

  // Helper to determine font color (black or white) based on background luminance
  const getFontColor = (hex) => {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Formula for relative luminance
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'FF000000' : 'FFFFFFFF';
  };

  if (viewMode === 'day') {
    // === SINGLE SHEET FOR ALL DAYS ===
    const worksheet = workbook.addWorksheet('Grade Semanal');
    let currentRow = 1;

    // Filter classes once if needed (applied to all days)
    const classesToExport = filteredClassIds !== null
      ? data.classes.filter(c => filteredClassIds.includes(c.id))
      : data.classes;

    // Sort classes alphanumeric
    classesToExport.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    // Global Headers for Day Mode (Time + Classes)
    const headers = ['Horário'];
    classesToExport.forEach(c => headers.push(c.name));

    // Set column widths once
    worksheet.getColumn(1).width = 20;
    for (let i = 2; i <= headers.length; i++) worksheet.getColumn(i).width = 25;

    // Iterate over selected DAYS
    uniqueEntities.forEach((dayName, dayIdx) => {
      // --- Day Title ---
      const titleRow = worksheet.getRow(currentRow);
      titleRow.values = [dayName];
      worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
      titleRow.font = { size: 16, bold: true };
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.height = 30;
      currentRow++;

      // --- Header Row ---
      const headerRow = worksheet.getRow(currentRow);
      headerRow.values = headers;

      // Apply style only to actual header cells
      for (let i = 1; i <= headers.length; i++) {
        const cell = headerRow.getCell(i);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      currentRow++;

      // --- Data Rows ---
      data.timeSlots.forEach((slot, slotIdx) => {
        const row = worksheet.getRow(currentRow);
        row.height = 40;

        // Time Column
        const timeCell = row.getCell(1);
        timeCell.value = `${slot.start} - ${slot.end}`;
        timeCell.font = { bold: true };
        timeCell.alignment = { vertical: 'middle', horizontal: 'center' };
        timeCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        if (slot.type !== 'aula') {
          // Break Row
          worksheet.mergeCells(currentRow, 1, currentRow, headers.length);
          const cell = row.getCell(1);
          cell.value = `${slot.start} - ${slot.end}   ---   ${slot.type.toUpperCase()}   ---`;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
          cell.font = { italic: true, color: { argb: 'FF888888' }, bold: true };
        } else {
          // Class Columns
          classesToExport.forEach((cls, cIdx) => {
            const colIdx = cIdx + 2;
            const cell = row.getCell(colIdx);

            const timeKey = `${dayName}-${slotIdx}`;
            const scheduleKey = `${cls.id}-${timeKey}`;
            const entry = data.schedule[scheduleKey];

            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

            if (entry) {
              const subject = data.subjects.find(s => s.id === entry.subjectId);
              const teacher = data.teachers.find(t => t.id === entry.teacherId);
              cell.value = `${subject?.name || ''}\n(${teacher?.name || ''})`;

              const colorHex = getSubjectColor(subject);
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colorHex } };
              cell.font = { color: { argb: getFontColor(colorHex) }, bold: true };
            } else {
              cell.value = '';
              cell.fill = undefined;
            }
          });
        }
        currentRow++;
      });

      // Add Spacing between days
      currentRow += 2;
    });

  } else {
    // === MULTI SHEET FOR CLASSES/TEACHERS/SUBJECTS ===
    const addSheetForEntity = (selectedEntity) => {
      let sheetName = getFileName(viewMode, selectedEntity, data).replace('GradeInteligente (', '').replace(')', '');
      if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);

      let uniqueSheetName = sheetName;
      let counter = 1;
      while (workbook.getWorksheet(uniqueSheetName)) {
        uniqueSheetName = `${sheetName.substring(0, 28)}(${counter})`;
        counter++;
      }

      const worksheet = workbook.addWorksheet(uniqueSheetName);

      const title = `Grade: ${sheetName}`;

      const headers = ['Horário'];
      DAYS.forEach(d => headers.push(d));

      // Title Row
      const titleRow = worksheet.insertRow(1, [title]);
      worksheet.mergeCells(1, 1, 1, headers.length);
      titleRow.font = { size: 16, bold: true };
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.height = 30;

      // Header Row
      const headerRow = worksheet.insertRow(2, headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.getColumn(1).width = 20;
      for (let i = 2; i <= headers.length; i++) worksheet.getColumn(i).width = 25;

      // Data Rows
      data.timeSlots.forEach((slot, slotIdx) => {
        const rowValues = [`${slot.start} - ${slot.end}`];
        for (let i = 1; i < headers.length; i++) rowValues.push('');

        const row = worksheet.addRow(rowValues);
        row.height = 40;

        row.getCell(1).font = { bold: true };
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        if (slot.type !== 'aula') {
          worksheet.mergeCells(row.number, 1, row.number, headers.length);
          const cell = row.getCell(1);
          cell.value = `${slot.start} - ${slot.end}   ---   ${slot.type.toUpperCase()}   ---`;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
          cell.font = { italic: true, color: { argb: 'FF888888' }, bold: true };
          return;
        }

        DAYS.forEach((day, dayIdx) => {
          const cell = row.getCell(dayIdx + 2);
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

          const timeKey = `${day}-${slotIdx}`;
          let entry = null;

          if (viewMode === 'class') {
            const scheduleKey = `${selectedEntity}-${timeKey}`;
            entry = data.schedule[scheduleKey];
          } else if (viewMode === 'teacher') {
            entry = Object.values(data.schedule).find(v => v.teacherId === selectedEntity && v.timeKey === timeKey);
          } else if (viewMode === 'subject') {
            const entries = Object.values(data.schedule).filter(v => v.subjectId === selectedEntity && v.timeKey === timeKey);
            if (entries.length > 0) {
              const text = entries.map(e => {
                const c = data.classes.find(cl => cl.id === e.classId);
                const t = data.teachers.find(th => th.id === e.teacherId);
                return `${c?.name || '?'}\n(${t?.name || '?'})`;
              }).join('\n\n');
              cell.value = text;
              const subject = data.subjects.find(s => s.id === selectedEntity);
              const colorHex = getSubjectColor(subject);
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colorHex } };
              cell.font = { color: { argb: 'FF000000' }, bold: true };
              return;
            }
          }

          if (entry) {
            let subject, teacher, cls;
            if (viewMode === 'class') {
              subject = data.subjects.find(s => s.id === entry.subjectId);
              teacher = data.teachers.find(t => t.id === entry.teacherId);
              cell.value = `${subject?.name || ''}\n(${teacher?.name || ''})`;
            } else if (viewMode === 'teacher') {
              subject = data.subjects.find(s => s.id === entry.subjectId);
              cls = data.classes.find(c => c.id === entry.classId);
              cell.value = `${subject?.name || ''}\n(${cls?.name || ''})`;
            }
            const colorHex = getSubjectColor(subject);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colorHex } };
            cell.font = { color: { argb: getFontColor(colorHex) }, bold: true };
          }
        });
      });
    };
    // Loop entities
    uniqueEntities.forEach(entity => addSheetForEntity(entity));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const baseName = uniqueEntities.length === 1 && viewMode !== 'day'
    ? getFileName(viewMode, uniqueEntities[0], data).replace('.xlsx', '')
    : `GradeInteligente_Multiplo_${dateStr}`;

  saveAs(blob, `${baseName}.xlsx`);
}

/**
 * Exporta a grade em formato Word (.doc) simulado via HTML.
 * @param {Object} params
 * @param {'class'|'teacher'} params.viewMode
 * @param {string} params.selectedEntity
 * @param {Object} params.data Estado completo
 * @param {Array} params.displayPeriods Períodos filtrados
 */
export async function exportDOC({ viewMode, selectedEntities, data, displayPeriods, filteredClassIds = null }) {
  // Ensure array
  const entities = Array.isArray(selectedEntities) ? selectedEntities : [selectedEntities];
  const uniqueEntities = [...new Set(entities.filter(Boolean))];

  if (uniqueEntities.length === 0) {
    console.warn("Nenhuma entidade selecionada para exportação.");
    return;
  }

  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const fileName = uniqueEntities.length === 1 && viewMode !== 'day'
    ? getFileName(viewMode, uniqueEntities[0], data).replace('.xlsx', '')
    : `GradeInteligente_Multiplo_${dateStr}`;
  const titleText = `Grade Horária - ${new Date().toLocaleDateString('pt-BR')}`;

  let html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${titleText}</title>
      <!--[if gte mso 9]>
      <xml>
      <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>90</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
      </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page {
          size: 29.7cm 21cm;
          margin: 0.5cm;
          mso-page-orientation: landscape;
        }
        @page Section1 {
          size: 29.7cm 21cm;
          margin: 0.5cm;
          mso-header-margin: 0.2in;
          mso-footer-margin: 0.2in;
          mso-paper-source: 0;
        }
        div.Section1 {
          page: Section1;
        }
        body { 
          font-family: Arial, sans-serif; 
          font-size: 11px;
        }
        h1 { 
          text-align: center; 
          font-size: 16px;
          margin-bottom: 5px;
          margin-top: 0;
        }
        h2 {
          text-align: center;
          font-size: 14px;
          margin-bottom: 10px;
          color: #444;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          table-layout: fixed;
          margin-bottom: 20px;
          page-break-inside: avoid;
        }
        th, td { 
          border: 1px solid black; 
          padding: 2px 2px; 
          text-align: center; 
          font-size: 10px;
          vertical-align: middle;
          word-wrap: break-word;
        }
        th { 
          background-color: #f0f0f0; 
          font-weight: bold; 
          color: #333;
          height: 25px;
          line-height: normal;
        }
        .break { 
          background-color: #e0e0e0; 
          font-weight: bold; 
          color: #555; 
          letter-spacing: 1px;
          font-size: 9px;
          height: 15px;
        }
        .page-break {
          page-break-before: always;
        }
      </style>
    </head>
    <body>
      <div class="Section1">
  `;

  // === GENERATE TABLES LOOP ===
  uniqueEntities.forEach((entity, idx) => {
    // Add page break for subsequent items
    if (idx > 0) html += '<div class="page-break"></div>';

    let sectionTitle = '';
    if (viewMode === 'day') sectionTitle = entity; // entity is day name
    else sectionTitle = getFileName(viewMode, entity, data).replace('GradeInteligente (', '').replace(')', '');

    html += `<h1>${titleText}</h1>`;
    html += `<h2>${sectionTitle}</h2>`;

    // Determine Columns
    let headers = ['Horário'];
    let classesToExport = []; // Only for Day View

    if (viewMode === 'day') {
      classesToExport = filteredClassIds !== null
        ? data.classes.filter(c => filteredClassIds.includes(c.id))
        : data.classes;
      // Sort alphanumeric
      classesToExport.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      classesToExport.forEach(c => headers.push(c.name));
    } else {
      DAYS.forEach(d => headers.push(d));
    }

    html += `<table><thead><tr>`;
    headers.forEach(h => html += `<th>${h}</th>`);
    html += `</tr></thead><tbody>`;

    // Data Rows
    displayPeriods.forEach(slot => {
      const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
      html += `<tr><td>${slot.start} - ${slot.end}</td>`;

      if (slot.type !== 'aula') {
        const label = slot.type.toUpperCase();
        html += `<td colspan="${headers.length - 1}" class="break">${label}</td>`;
      } else {
        // Fill Columns
        if (viewMode === 'day') {
          classesToExport.forEach(cls => {
            const dayName = entity || DAYS[0];
            const timeKey = `${dayName}-${absoluteIndex}`;
            const scheduleKey = `${cls.id}-${timeKey}`;
            const entry = data.schedule[scheduleKey];

            let cellContent = '';
            if (entry) {
              const subject = data.subjects.find(s => s.id === entry.subjectId);
              const teacher = data.teachers.find(t => t.id === entry.teacherId);
              if (subject) {
                cellContent = `<b>${subject.name}</b><br><span style="font-size:10px; color:#555;">(${teacher?.name || ''})</span>`;
              }
            }
            html += `<td>${cellContent}</td>`;
          });
        } else {
          DAYS.forEach((day, dayIdx) => {
            const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;
            let cellContent = '';

            let entry = null;

            if (viewMode === 'class') {
              const scheduleKey = `${entity}-${timeKey}`;
              entry = data.schedule[scheduleKey];
            } else if (viewMode === 'teacher') {
              entry = Object.values(data.schedule).find(v => v.teacherId === entity && v.timeKey === timeKey);
            } else if (viewMode === 'subject') {
              const entries = Object.values(data.schedule).filter(v => v.subjectId === entity && v.timeKey === timeKey);
              if (entries.length) {
                cellContent = entries.map(e => {
                  const cls = data.classes.find(c => c.id === e.classId);
                  const teacher = data.teachers.find(t => t.id === e.teacherId);
                  return `<b>${cls?.name || '?'}</b><br><span style="font-size:10px; color:#555;">(${teacher?.name || '?'})</span>`;
                }).join('<br><br>');
              }
            }

            if (entry && !cellContent) {
              if (viewMode === 'class') {
                const subj = data.subjects.find(s => s.id === entry.subjectId);
                const teacher = data.teachers.find(t => t.id === entry.teacherId);
                if (subj) cellContent = `<b>${subj.name}</b><br><span style="font-size:10px; color:#555;">(${teacher?.name || ''})</span>`;
              } else if (viewMode === 'teacher') {
                const subj = data.subjects.find(s => s.id === entry.subjectId);
                const cls = data.classes.find(c => c.id === entry.classId);
                if (subj) cellContent = `<b>${subj.name}</b><br><span style="font-size:10px; color:#555;">(${cls?.name || ''})</span>`;
              }
            }
            html += `<td>${cellContent}</td>`;
          });
        }
      }
      html += `</tr>`;
    });
    html += `</tbody></table>`;
  });

  html += `
      <p style="text-align: center; font-size: 10px; margin-top: 20px; color: #777;">Gerado pelo Sistema de Grade Inteligente - ${new Date().toLocaleDateString('pt-BR')}</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
  saveAs(blob, `${fileName}.doc`);
}
