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
export async function exportPDF({ viewMode, selectedEntity, data, displayPeriods }) {
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default || autoTableModule;

  const doc = new jsPDF({ orientation: 'landscape' });
  let titleText = '';
  if (viewMode === 'class') {
    titleText = `Grade Horária - ${data.classes.find(c => c.id === selectedEntity)?.name || 'Turma'}`;
  } else if (viewMode === 'teacher') {
    titleText = `Grade Horária - Professor(a) ${data.teachers.find(t => t.id === selectedEntity)?.name || 'Professor'}`;
  } else if (viewMode === 'subject') {
    titleText = `Grade Horária - Matéria ${data.subjects.find(s => s.id === selectedEntity)?.name || 'Matéria'}`;
  }

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

  doc.save(`Grade_${viewMode}_${selectedEntity}.pdf`);
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
  saveAs(blob, `Grade_${viewMode}_${selectedEntity}.xlsx`);
}
