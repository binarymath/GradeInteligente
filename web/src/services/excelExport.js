import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';

/**
 * Helper para renderizar uma tabela de turma em uma worksheet.
 * @param {ExcelJS.Worksheet} worksheet 
 * @param {number} startRow - Linha para começar a desenhar
 * @param {Object} classItem 
 * @param {Object} data 
 * @returns {number} - A próxima linha livre após a tabela
 */
const renderClassTable = (worksheet, startRow, classItem, data) => {
    let currentRowIdx = startRow;

    // 1. Título da Turma
    const titleRow = worksheet.getRow(currentRowIdx);
    titleRow.getCell(1).value = `Turma: ${classItem.name} (${classItem.shift})`;
    titleRow.font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
    currentRowIdx++;

    // 2. Cabeçalho da Tabela
    const headerRow = worksheet.getRow(currentRowIdx);
    headerRow.values = ['Horário', ...DAYS];

    // Estilo do Cabeçalho
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F46E5' } // Indigo-600
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        // Bordas
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });
    // Altura do cabeçalho
    headerRow.height = 25;

    currentRowIdx++;

    // --- CALCULAR SLOTS ATIVOS (Lógica idêntica ao ManualEditSection) ---
    // Determina quais slots IDs são "visíveis" para esta turma
    const classActiveSlots = (() => {
        // 1. Sistema Novo: Por Dia
        if (classItem.activeSlotsByDay && Object.keys(classItem.activeSlotsByDay).length > 0) {
            const visibleSlots = new Set();
            for (let d = 0; d < DAYS.length; d++) {
                const daySlots = classItem.activeSlotsByDay[d];
                if (Array.isArray(daySlots)) {
                    daySlots.forEach(id => visibleSlots.add(id));
                }
            }
            return Array.from(visibleSlots);
        }
        // 2. Sistema Antigo: Lista Global
        if (classItem.activeSlots && Array.isArray(classItem.activeSlots) && classItem.activeSlots.length > 0) {
            return classItem.activeSlots;
        }
        // 3. Fallback (Se sem config, assume vazio ou todos? UI assume VAZIO com warning)
        return [];
    })();

    // 3. Preencher Linhas (Horários)
    data.timeSlots.forEach((slot, slotIndex) => {
        // --- FILTRAGEM ESTRITA ---
        // Se a turma tem configuração de slots, SÓ MOSTRA O QUE ESTÁ NA LISTA.
        // Se a lista estiver vazia (classActiveSlots.length === 0), tentaremos fallback para Turno para não zerar exportação de turmas novas.

        if (classActiveSlots.length > 0) {
            if (!classActiveSlots.includes(slot.id)) return;
        } else {
            // Fallback para turmas legadas sem activeSlots configurado: Filtro por Turno
            const slotShift = computeSlotShift(slot);
            let shiftMatch = false;
            if (classItem.shift === 'Integral (Manhã e Tarde)') {
                shiftMatch = slotShift === 'Manhã' || slotShift === 'Tarde' || slotShift === 'Integral (Manhã e Tarde)';
            } else if (classItem.shift === 'Integral (Tarde e Noite)') {
                shiftMatch = slotShift === 'Tarde' || slotShift === 'Noite' || slotShift === 'Integral (Tarde e Noite)';
            } else {
                shiftMatch = slotShift === classItem.shift;
            }
            if (!shiftMatch && slotShift !== 'Geral') return;
        }

        // --- RENDERIZAÇÃO DA LINHA ---
        const isInterval = slot.type === 'intervalo';
        const row = worksheet.getRow(currentRowIdx);

        // Coluna 1: Horário
        const timeCell = row.getCell(1);
        timeCell.value = `${slot.start} - ${slot.end}`;
        timeCell.font = { bold: true };
        timeCell.alignment = { vertical: 'middle', horizontal: 'center' };
        timeCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Colunas 2..6: Dias
        DAYS.forEach((day, dayIndex) => {
            const cell = row.getCell(dayIndex + 2);
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

            // Verificar disponibilidade no dia específico (para pintar cinza)
            // Lógica similar ao ManualEditSection isSlotActiveLocal
            let isActiveThisDay = true;
            if (classItem.activeSlotsByDay && Object.keys(classItem.activeSlotsByDay).length > 0) {
                const dSlots = classItem.activeSlotsByDay[dayIndex];
                isActiveThisDay = Array.isArray(dSlots) && dSlots.includes(slot.id);
            } else if (classItem.activeSlots && Array.isArray(classItem.activeSlots) && classItem.activeSlots.length > 0) {
                isActiveThisDay = classItem.activeSlots.includes(slot.id);
            }
            // Se fallback por turno, assume ativo

            if (!isActiveThisDay && classActiveSlots.length > 0) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate-100 (Bloqueado)
                return;
            }

            if (isInterval) {
                cell.value = 'INTERVALO';
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
                cell.font = { italic: true, color: { argb: 'FF888888' }, size: 10 };
            } else {
                // Buscar dados
                const scheduleKey = `${classItem.id}-${day}-${slotIndex}`;
                const entry = data.schedule[scheduleKey];

                if (entry) {
                    const subject = data.subjects.find(s => s.id === entry.subjectId);
                    const teacher = data.teachers.find(t => t.id === entry.teacherId);

                    const subjectName = subject ? subject.name : 'Matéria Genérica';
                    const teacherName = teacher ? teacher.name : '';

                    cell.value = `${subjectName}\n(${teacherName})`;

                    // Cor
                    let colorHex = 'EFF6FF'; // Default blue-50
                    if (subject && subject.color) {
                        colorHex = subject.color.replace('#', '');
                    }

                    if (!/^[0-9A-Fa-f]{6}$/.test(colorHex)) colorHex = 'EFF6FF';

                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF' + colorHex }
                    };
                    cell.font = { color: { argb: 'FF000000' }, bold: true };
                } else {
                    cell.value = '-';
                }
            }
        });

        row.height = 40; // Altura fixa para consistência
        currentRowIdx++;
    });

    return currentRowIdx;
};

/**
 * Exporta todas as grades de todas as turmas para um único arquivo Excel.
 * Inclui uma aba "Geral" com todas as turmas em sequência.
 * Nomes de abas individuais limitados a 31 chars.
 */
export const exportAllSchedulesToExcel = async (data) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Grade Inteligente';
    workbook.created = new Date();

    // Ordenar turmas
    const sortedClasses = [...data.classes].sort((a, b) => a.name.localeCompare(b.name));

    // --- 1. ABA GERAL (TODAS) ---
    const generalSheet = workbook.addWorksheet('TODAS AS TURMAS');

    // Configurar larguras das colunas na Geral
    generalSheet.columns = [
        { header: '', key: 'time', width: 18 }, // Coluna de horário
        ...DAYS.map(day => ({ header: '', key: day, width: 22 })) // Colunas de dias
    ];

    let currentGeneralRow = 1;

    for (const classItem of sortedClasses) {
        // Renderizar na Geral
        currentGeneralRow = renderClassTable(generalSheet, currentGeneralRow, classItem, data);

        // Espaçamento entre tabelas
        currentGeneralRow += 2;
    }

    // --- 2. ABAS INDIVIDUAIS ---
    for (const classItem of sortedClasses) {
        const sheetName = (classItem.name || 'Turma')
            .replace(/[\\/?*[\]]/g, '')
            .substring(0, 31);

        // Evitar duplicidade de nomes de abas (raro, mas safety)
        let safeSheetName = sheetName;
        let counter = 1;
        while (workbook.getWorksheet(safeSheetName)) {
            safeSheetName = `${sheetName.substring(0, 28)}(${counter})`;
            counter++;
        }

        const worksheet = workbook.addWorksheet(safeSheetName);

        // Configurar colunas
        worksheet.columns = [
            { width: 18 },
            ...DAYS.map(() => ({ width: 22 }))
        ];

        renderClassTable(worksheet, 1, classItem, data);
    }

    // Gerar Buffer e Salvar
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Grade_Geral_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
