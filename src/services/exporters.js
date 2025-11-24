// Serviços de exportação (PDF, Excel) seguindo princípios de responsabilidade única.
// Cada função recebe o estado mínimo necessário.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
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
export function exportPDF({ viewMode, selectedEntity, data, displayPeriods }) {
  const doc = new jsPDF({ orientation: 'landscape' });
  let titleText = '';
  if (viewMode === 'class') {
    titleText = `Grade Horária - ${data.classes.find(c => c.id === selectedEntity)?.name}`;
  } else if (viewMode === 'teacher') {
    titleText = `Grade Horária - Professor(a) ${data.teachers.find(t => t.id === selectedEntity)?.name}`;
  } else if (viewMode === 'subject') {
    titleText = `Grade Horária - Matéria ${data.subjects.find(s => s.id === selectedEntity)?.name}`;
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
      return [row[0], { content: label, colSpan: 5, styles: { halign: 'center', fillColor: [240,240,240], textColor: [100,100,100], fontStyle: 'bold' } }];
    }

    DAYS.forEach((_, dayIdx) => {
      const timeKey = `${dayIdx}-${absoluteIndex}`;
      let cellContent = '';
      if (viewMode === 'class') {
        const scheduleKey = `${selectedEntity}-${timeKey}`;
        const entry = data.schedule[scheduleKey];
        if (entry) {
          const subj = data.subjects.find(s => s.id === entry.subjectId);
          const teacher = data.teachers.find(t => t.id === entry.teacherId);
          cellContent = `${subj.name}\n(${teacher.name})`;
        }
      } else if (viewMode === 'teacher') {
        const entry = Object.entries(data.schedule).find(([_, val]) => val.teacherId === selectedEntity && val.timeKey === timeKey);
        if (entry) {
          const item = entry[1];
          const subj = data.subjects.find(s => s.id === item.subjectId);
          const cls = data.classes.find(c => c.id === item.classId);
          cellContent = `${subj.name}\n(${cls.name})`;
        }
      } else if (viewMode === 'subject') {
        const entries = Object.values(data.schedule).filter(val => val.subjectId === selectedEntity && val.timeKey === timeKey);
        if (entries.length) {
          cellContent = entries.map(e => {
            const cls = data.classes.find(c => c.id === e.classId);
            const teacher = data.teachers.find(t => t.id === e.teacherId);
            return `${cls?.name} (${teacher?.name})`;
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
    headStyles: { fillColor: [79,70,229], textColor: 255, fontStyle: 'bold' },
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
export function exportExcel({ viewMode, selectedEntity, data }) {
  const rows = [["Turma", "Dia", "Início", "Fim", "Matéria", "Professor"]];

  Object.entries(data.schedule).forEach(([key, slot]) => {
    if (viewMode === 'class' && slot.classId !== selectedEntity) return;
    if (viewMode === 'teacher' && slot.teacherId !== selectedEntity) return;
    if (viewMode === 'subject' && slot.subjectId !== selectedEntity) return;

    const parts = key.split('-');
    const dayIdx = parseInt(parts[1]);
    const slotIdx = parseInt(parts[2]);
    const timeSlot = data.timeSlots[slotIdx];
    if (!timeSlot) return;

    const subject = data.subjects.find(s => s.id === slot.subjectId);
    const teacher = data.teachers.find(t => t.id === slot.teacherId);
    const clsObj = data.classes.find(c => c.id === slot.classId);
    if (subject && teacher && clsObj) {
      rows.push([
        clsObj.name,
        DAYS[dayIdx],
        timeSlot.start,
        timeSlot.end,
        subject.name,
        teacher.name
      ]);
    }
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Grade Horária');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  saveAs(blob, `Grade_${viewMode}_${selectedEntity}.xlsx`);
}
