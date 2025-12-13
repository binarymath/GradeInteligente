// Serviços de exportação (PDF, Excel) seguindo princípios de responsabilidade única.
// Cada função recebe o estado mínimo necessário.
// Lazy imports serão usados dentro das funções para reduzir bundle inicial.
import { saveAs } from 'file-saver';
import { DAYS } from '../utils';

/**
 * Gera PDF da grade para uma turma ou professor.
 * @param {Object} params
 * @param {'class'|'teacher'} params.viewMode
 * @param {string} params.selectedEntity
 * @param {Object} params.data Estado completo (classes, teachers, subjects, timeSlots, schedule)
 * @param {Array} params.displayPeriods Períodos filtrados para exibição
 */
// Helper to get standardized filename
function getFileName(viewMode, selectedEntity, data) {
  let entityName = '';
  if (viewMode === 'class') {
    entityName = data.classes.find(c => c.id === selectedEntity)?.name || 'Turma';
  } else if (viewMode === 'teacher') {
    entityName = data.teachers.find(t => t.id === selectedEntity)?.name || 'Professor';
  } else if (viewMode === 'subject') {
    entityName = data.subjects.find(s => s.id === selectedEntity)?.name || 'Matéria';
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
export async function exportExcel({ viewMode, selectedEntity, data }) {
  const rows = [["Turma", "Dia", "Início", "Fim", "Matéria", "Professor"]];

  Object.values(data.schedule).forEach(slot => {
    if (viewMode === 'class' && slot.classId !== selectedEntity) return;
    if (viewMode === 'teacher' && slot.teacherId !== selectedEntity) return;
    if (viewMode === 'subject' && slot.subjectId !== selectedEntity) return;

    if (!slot.timeKey) return;

    // Parse timeKey (Day-Index) which is safer than parsing the full schedule Key
    const parts = slot.timeKey.split('-');
    if (parts.length < 2) return;

    const slotIdx = parseInt(parts[parts.length - 1]);
    const dayName = parts.slice(0, parts.length - 1).join('-');

    const timeSlot = data.timeSlots[slotIdx];
    if (!timeSlot) return;

    const subject = data.subjects.find(s => s.id === slot.subjectId);
    const teacher = data.teachers.find(t => t.id === slot.teacherId);
    const clsObj = data.classes.find(c => c.id === slot.classId);

    if (subject && teacher && clsObj) {
      rows.push([
        clsObj.name,
        dayName,
        timeSlot.start,
        timeSlot.end,
        subject.name,
        teacher.name
      ]);
    }
  });

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Grade Horária');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });

  const fileName = getFileName(viewMode, selectedEntity, data);
  saveAs(blob, `${fileName}.xlsx`);
}

/**
 * Exporta a grade em formato Word (.doc) simulado via HTML.
 * @param {Object} params
 * @param {'class'|'teacher'} params.viewMode
 * @param {string} params.selectedEntity
 * @param {Object} params.data Estado completo
 * @param {Array} params.displayPeriods Períodos filtrados
 */
export async function exportDOC({ viewMode, selectedEntity, data, displayPeriods }) {
  const fileName = getFileName(viewMode, selectedEntity, data);
  const titleText = fileName.replace('GradeInteligente', 'Grade Horária');

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
            <w:DoNotOptimizeForBrowser />
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page {
            size: 29.7cm 21cm;
          margin: 1cm 1cm 1cm 1cm;
          mso-page-orientation: landscape;
          }
          @page Section1 {
            size: 29.7cm 21cm;
          margin: 1cm 1cm 1cm 1cm;
          mso-header-margin: 0.5in;
          mso-footer-margin: 0.5in;
          mso-paper-source: 0;
          }
          div.Section1 {
            page: Section1;
          }
          body {
            font - family: Arial, sans-serif;
          font-size: 12px;
          }
          h1 {
            text - align: center;
          font-size: 18px;
          margin-bottom: 20px;
          }
          table {
            width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          }
          th, td {
            border: 1px solid black;
          padding: 8px 4px;
          text-align: center;
          font-size: 11px;
          vertical-align: middle;
          word-wrap: break-word;
          }
          th {
            background - color: #f0f0f0;
          font-weight: bold;
          color: #333;
          height: 40px;
          }
          .break {
            background - color: #e0e0e0;
          font-weight: bold;
          color: #555;
          letter-spacing: 1px;
          }
          /* Garantir que as linhas tenham altura mínima */
          tr {height: 50px; }
        </style>
    </head>
    <body>
      <div class="Section1">
        <h1>${titleText}</h1>
        <table>
          <colgroup>
            <col style="width: 10%">
              <col style="width: 18%">
                <col style="width: 18%">
                  <col style="width: 18%">
                    <col style="width: 18%">
                      <col style="width: 18%">
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Horário</th>
                          <th>Segunda</th>
                          <th>Terça</th>
                          <th>Quarta</th>
                          <th>Quinta</th>
                          <th>Sexta</th>
                        </tr>
                      </thead>
                      <tbody>
                        `;

  displayPeriods.forEach(slot => {
    const absoluteIndex = data.timeSlots.findIndex(s => s.id === slot.id);
    html += `<tr><td>${slot.start} - ${slot.end}</td>`;

    if (slot.type !== 'aula') {
      const label = slot.type.toUpperCase();
      html += `<td colspan="5" class="break">${label}</td>`;
    } else {
      DAYS.forEach((_, dayIdx) => {
        const timeKey = `${DAYS[dayIdx]}-${absoluteIndex}`;
        let cellContent = '';

        if (viewMode === 'class') {
          const entry = Object.values(data.schedule).find(v => v.classId === selectedEntity && v.timeKey === timeKey);
          if (entry) {
            const subj = data.subjects.find(s => s.id === entry.subjectId);
            const teacher = data.teachers.find(t => t.id === entry.teacherId);
            if (subj && teacher) {
              cellContent = `<b>${subj.name}</b><br><span style="font-size:10px; color:#555;">(${teacher.name})</span>`;
            }
          }
        } else if (viewMode === 'teacher') {
          const entry = Object.values(data.schedule).find(v => v.teacherId === selectedEntity && v.timeKey === timeKey);
          if (entry) {
            const subj = data.subjects.find(s => s.id === entry.subjectId);
            const cls = data.classes.find(c => c.id === entry.classId);
            if (subj && cls) {
              cellContent = `<b>${subj.name}</b><br><span style="font-size:10px; color:#555;">(${cls.name})</span>`;
            }
          }
        } else if (viewMode === 'subject') {
          const entries = Object.values(data.schedule).filter(v => v.subjectId === selectedEntity && v.timeKey === timeKey);
          if (entries.length) {
            cellContent = entries.map(e => {
              const cls = data.classes.find(c => c.id === e.classId);
              const teacher = data.teachers.find(t => t.id === e.teacherId);
              return `<b>${cls?.name || '?'}</b><br><span style="font-size:10px; color:#555;">(${teacher?.name || '?'})</span>`;
            }).join('<br><br>');
          }
        }
        html += `<td>${cellContent}</td>`;
      });
    }
    html += `</tr>`;
  });

  html += `
                      </tbody>
                    </table>
                    <p style="text-align: center; font-size: 10px; margin-top: 20px; color: #777;">Gerado pelo Sistema de Grade Inteligente - ${new Date().toLocaleDateString('pt-BR')}</p>
                  </div>
                </body>
              </html>
              `;

  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
  saveAs(blob, `${fileName}.doc`);
}
