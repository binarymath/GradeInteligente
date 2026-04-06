/**
 * Serviço de Geração de Grade
 * Responsabilidade: Orquestração da geração e reparo de agendamentos
 * 
 * Módulos usados:
 * - scheduleHelpers: Funções utilitárias e formatação
 * - scheduleValidators: Validações e detecção de problemas
 * - smartRepairService: Estratégias de alocação e repair
 * - scheduleAnalyzer: Análise e logging
 */

import ScheduleManager from '../models/ScheduleManager';
import SmartAllocationResolver from '../models/SmartAllocationResolver';
import DoubleBreakResolver from '../models/DoubleBreakResolver';
import ForceAllocationResolver from '../models/ForceAllocationResolver';
import SynchronousScheduler from './SynchronousScheduler';
import SynchronousClassValidator from './SynchronousClassValidator';

import { LIMITS } from '../constants/schedule';
import { DAYS } from '../utils';

// Imports dos novos módulos modularizados
import {
  describeActivity,
  isSlotActive,
  computeOverAllocations,
  buildPendingActivitiesForRepair
} from './scheduleHelpers';
import {
  validateAndFixSynchronizedClasses,
  removeExcessAllocations
} from './scheduleValidators';
import {
  findMovableEntryInSlot,
  tryRepairSingle,
  tryRepairDouble,
  relocateBlockingEntry,
  relocateBlockingEntryDeep,
  tryRepairSingleDeep,
  aggressiveExcessRemoval  // ⭐ ESTRATÉGIA 3: Import da nova função de excess removal agressivo
} from './smartRepairService';
import {
  analyzeExistingSchedule,
  generateFinalLog
} from './scheduleAnalyzer';

/**
 * Gera a grade delegando todo o processamento a um Web Worker.
 * Retorna a instância do Worker para que o chamador possa gerir o ciclo de vida
 * (ex: worker.terminate() no cleanup do useEffect em caso de desmontagem do componente).
 *
 * @returns {Worker} instância do worker em execução
 */
export function generateScheduleAsync(data, setData, setGenerationLog, setGenerating) {
  setGenerating(true);
  setGenerationLog([]);

  const worker = new Worker(
    new URL('../workers/scheduleWorker.js', import.meta.url),
    { type: 'module' }
  );

  worker.onmessage = (event) => {
    const { type, payload } = event.data;

    if (type === 'LOG') {
      // Append cada linha de log em tempo real
      setGenerationLog(prev => [...prev, payload]);

    } else if (type === 'SUCCESS') {
      setData(prev => ({ ...prev, schedule: payload.schedule || {} }));
      setGenerating(false);
      worker.terminate();

    } else if (type === 'ERROR') {
      setGenerationLog(prev => [...prev, '❌ Erro crítico no Worker: ' + payload]);
      setGenerating(false);
      worker.terminate();
    }
  };

  worker.onerror = (err) => {
    setGenerationLog(prev => [
      ...prev,
      '❌ Erro inesperado no Worker: ' + (err.message || String(err)),
    ]);
    setGenerating(false);
    worker.terminate();
  };

  // Enviar dados para o worker iniciar o pipeline
  worker.postMessage({ data });

  return worker; // Retorna para gestão de ciclo de vida no componente
}
/**
 * Ajusta pendências pontuais usando Smart Repair
 */
export async function smartRepairAsync(data, setData, setGenerationLog, setRepairing) {
  setRepairing(true);
  setGenerationLog(['🔧 Iniciando Smart Repair (trocas pontuais)...']);

  await new Promise(resolve => setTimeout(resolve, 50));

  const log = ['🔧 Iniciando Smart Repair (trocas pontuais)...'];

  try {
    if (!data.schedule || Object.keys(data.schedule).length === 0) {
      log.push('⚠️ Nenhuma grade carregada para ajustar. Gere uma grade antes de usar "Ajustar".');
      setGenerationLog(log);
      setRepairing(false);
      return;
    }

    // LIMPAR AULAS EM HORÁRIOS/DIAS NÃO PERMITIDOS
    const invalidAulas = [];
    const invalidDetails = []; // Para log detalhado
    let processedCount = 0;

    for (const [key, entry] of Object.entries(data.schedule)) {
      // Yield a cada 50 aulas processadas
      if (processedCount % 50 === 0 && processedCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      processedCount++;

      if (!entry.classId || !entry.subjectId) continue;

      const parts = key.split('-');
      if (parts.length < 3) continue;
      const [classId, dayStr, slotStr] = parts;
      const slotIdx = parseInt(slotStr, 10);

      const classData = data.classes?.find(c => c.id === classId);
      const slot = data.timeSlots[slotIdx];
      const subject = data.subjects?.find(s => s.id === entry.subjectId);
      const teacher = data.teachers?.find(t => t.id === entry.teacherId);

      if (!classData || !slot) continue;

      const slotId = slot.id || String(slotIdx);
      let allowed = true;

      // Verificar se slot está permitido
      if (classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
        const dayIdx = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'].indexOf(dayStr);
        const activeForDay = dayIdx >= 0 ? classData.activeSlotsByDay[dayIdx] : null;
        if (!activeForDay || !activeForDay.includes(slotId)) {
          allowed = false;
        }
      } else if (classData.activeSlots && Array.isArray(classData.activeSlots) && classData.activeSlots.length > 0) {
        if (!classData.activeSlots.includes(slotId)) {
          allowed = false;
        }
      }

      // NOVO: Forçar remoção se o slot não for do tipo 'aula' (ex: intervalo)
      if (slot.type !== 'aula') {
        allowed = false;
      }

      // EXCEÇÃO: Se for aula síncrona ou fixa, ignorar validação de slot (Constraints Bypassed)
      if (entry.isSynchronous || entry.isGranularSync || entry.locked || entry.isFixed) {
        allowed = true;
      }

      if (!allowed) {
        invalidAulas.push(key);
        // Guardar detalhes para log
        const subjectName = subject?.name || 'Desconhecida';
        const teacherName = teacher?.name || 'Desconhecido';
        const reason = slot.type !== 'aula' ? '(Horário de Intervalo)' : '(Horário Inativo)';

        invalidDetails.push({
          className: classData.name,
          subjectName,
          teacherName,
          day: dayStr,
          time: `${slot.start}-${slot.end} ${reason}`
        });
      }
    }

    if (invalidAulas.length > 0) {
      log.push(`🧹 Limpando ${invalidAulas.length} aula(s) em horários/dias NÃO permitidos...`);

      // Detalhar o que será removido
      const groupedByClass = {};
      invalidDetails.forEach(detail => {
        if (!groupedByClass[detail.className]) {
          groupedByClass[detail.className] = [];
        }
        groupedByClass[detail.className].push(detail);
      });

      Object.entries(groupedByClass).forEach(([className, details]) => {
        log.push(`   📍 ${className}:`);
        details.forEach(d => {
          log.push(`      • ${d.subjectName} (${d.teacherName}) - ${d.day} ${d.time}`);
        });
      });

      // Remover do schedule
      for (const key of invalidAulas) {
        delete data.schedule[key];
      }
      setData(prev => ({ ...prev, schedule: { ...data.schedule } }));
      log.push(`✅ ${invalidAulas.length} aula(s) removida(s) com sucesso!`);
    }

    // === SEGUNDA CAMADA: RESOLVER CONFLITO POR NOME DE PROFESSOR (COM CHECAGEM DE HORÁRIO REAL) ===
    // Agora verifica sobreposição de horários (start/end) e não apenas slotIdx igual
    const allocationsByTeacher = {}; // Key: "TeacherName" -> [ {key, entry, className, startStr, endStr, dayIdx} ]
    const nameConflictsToRemove = [];
    const teacherMap = new Map((data.teachers || []).map(t => [t.id, t]));

    // Helper para converter "HH:MM" em minutos
    const getMinutes = (t) => {
      if (!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    // 1. Agrupar todas as aulas por Professor (usando Nome para garantir unicidade visual)
    let groupProcessedCount = 0;
    for (const [key, entry] of Object.entries(data.schedule)) {
      // Yield a cada 50 aulas processadas
      if (groupProcessedCount % 50 === 0 && groupProcessedCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      groupProcessedCount++;

      if (!entry.teacherId) continue;

      const teacher = teacherMap.get(entry.teacherId);
      if (!teacher || !teacher.name) continue;

      const teacherName = teacher.name.trim();

      // Parse day/slot
      let dayIdx = entry.dayIdx;
      let slotIdx = entry.slotIdx;

      if (dayIdx === undefined || slotIdx === undefined) {
        const parts = key.split('-');
        if (parts.length >= 3) {
          const dayStr = parts[1];
          const sStr = parts[2];
          dayIdx = DAYS.indexOf(dayStr);
          slotIdx = parseInt(sStr, 10);
        }
      }

      if (dayIdx === undefined || dayIdx === -1 || slotIdx === undefined || isNaN(slotIdx)) continue;

      const slot = data.timeSlots[slotIdx];
      if (!slot) continue;

      if (!allocationsByTeacher[teacherName]) {
        allocationsByTeacher[teacherName] = [];
      }

      const className = data.classes.find(c => c.id === entry.classId)?.name || entry.classId;

      allocationsByTeacher[teacherName].push({
        key,
        entry,
        className,
        subjectId: entry.subjectId,
        dayIdx,
        slotIdx,
        startStr: slot.start,
        endStr: slot.end,
        startMin: getMinutes(slot.start),
        endMin: getMinutes(slot.end)
      });
    }

    // 2. Verificar sobreposições dentro da lista de cada professor
    for (const [tName, entries] of Object.entries(allocationsByTeacher)) {
      // Comparar todos contra todos dentro do mesmo dia
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const A = entries[i];
          const B = entries[j];

          // Se já foi marcado para remover, ignora
          if (nameConflictsToRemove.includes(A.key) || nameConflictsToRemove.includes(B.key)) continue;

          // Se dias diferentes, ok
          if (A.dayIdx !== B.dayIdx) continue;

          // Se mesma turma, ok (não pode ser conflito com ele mesmo, e se tiver duplicado na mesma turma o script de limpeza básica já pegaria, mas ok)
          if (A.entry.classId === B.entry.classId) continue;

          // Checar OVERLAP: (StartA < EndB) && (EndA > StartB)
          if (A.startMin < B.endMin && A.endMin > B.startMin) {
            // CONFLITO DETECTADO! 
            // Remove o B (arbitrário: remove o segundo encontrado). 
            // Poderíamos melhorar removendo o que tem menos constraints, mas por hora: remove B.

            nameConflictsToRemove.push(B.key);

            const subjNameA = data.subjects.find(s => s.id === A.subjectId)?.name || 'Matéria';
            const subjNameB = data.subjects.find(s => s.id === B.subjectId)?.name || 'Matéria';
            const dayLabel = DAYS[A.dayIdx];

            log.push(`🔥 CONFLITO DE HORÁRIO DETECTADO: Prof. ${tName} em ${dayLabel}`);
            log.push(`   • Mantido: ${A.className} (${subjNameA} | ${A.startStr}-${A.endStr})`);
            log.push(`   • Removido: ${B.className} (${subjNameB} | ${B.startStr}-${B.endStr})`);
            log.push(`     -> Motivo: O professor não pode estar em duas turmas ao mesmo tempo.`);
          }
        }
      }
    }

    if (nameConflictsToRemove.length > 0) {
      for (const key of nameConflictsToRemove) {
        delete data.schedule[key];
      }
      setData(prev => ({ ...prev, schedule: { ...data.schedule } }));
      log.push(`✅ ${nameConflictsToRemove.length} conflito(s) reais de horário corrigidos.`);
    }

    const manager = new ScheduleManager(data, LIMITS);
    manager.importExistingSchedule(data.schedule);

    const timeSlots = data.timeSlots || [];
    const slotById = new Map(timeSlots.map((slot, idx) => [String(slot.id ?? idx), slot]));
    const isLessonSlot = (slotId) => {
      const slot = slotById.get(String(slotId)) || timeSlots[Number(slotId)];
      return !!(slot && slot.type === 'aula');
    };

    // HELPER: Função para contar aulas alocadas validamente
    const countValidAllocations = (scheduleObj) => {
      let count = 0;
      for (const [key, entry] of Object.entries(scheduleObj || {})) {
        let dayIdx = entry.dayIdx;
        let slotIdx = entry.slotIdx;

        const parts = String(key).split('-');
        if (parts.length >= 3) {
          const sStr = parts[parts.length - 1];
          const dStr = parts[parts.length - 2];
          const maybeSlot = parseInt(sStr, 10);
          const maybeDay = DAYS.indexOf(dStr);
          if (!isNaN(maybeSlot) && maybeDay >= 0) {
            slotIdx = maybeSlot;
            dayIdx = maybeDay;
          }
        }

        if ((dayIdx === undefined || slotIdx === undefined) && entry.timeKey) {
          const tParts = entry.timeKey.split('-');
          const dIdx = DAYS.indexOf(tParts[0]);
          if (dIdx >= 0) dayIdx = dIdx;
          const sIdx = parseInt(tParts[1], 10);
          if (!isNaN(sIdx)) slotIdx = sIdx;
        }

        if (dayIdx === undefined || dayIdx < 0 || slotIdx === undefined) continue;

        const cls = data.classes?.find(c => c.id === entry.classId);
        const slotId = timeSlots[slotIdx]?.id ?? String(slotIdx);
        if (!cls) continue;
        if (!isLessonSlot(slotId)) continue;
        if (!isSlotActive(cls, dayIdx, slotId)) continue;

        count += 1;
      }
      return count;
    };

    let totalCapacity = 0;
    for (const classData of (data.classes || [])) {
      const hasActiveSlotsByDay = classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0;
      const hasActiveSlots = classData.activeSlots && Array.isArray(classData.activeSlots) && classData.activeSlots.length > 0;

      if (hasActiveSlotsByDay) {
        Object.values(classData.activeSlotsByDay).forEach(slotIds => {
          if (!Array.isArray(slotIds)) return;
          slotIds.forEach(slotId => {
            if (isLessonSlot(slotId)) totalCapacity += 1;
          });
        });
      } else if (hasActiveSlots) {
        const perDay = classData.activeSlots.filter(isLessonSlot).length;
        totalCapacity += perDay * DAYS.length;
      }
    }

    let totalAllocated = countValidAllocations(data.schedule);

    let totalAssigned = 0;
    for (const act of data.activities || []) {
      totalAssigned += Number(act.quantity) || 0;
    }

    const freeSlots = Math.max(0, totalCapacity - totalAllocated);
    const pendingEstimated = Math.max(0, totalAssigned - totalAllocated);

    log.push(`📦 Slots ativos (aula): ${totalCapacity}`);
    log.push(`📌 Aulas atribuídas: ${totalAssigned}`);
    log.push(`✅ Aulas alocadas: ${totalAllocated}`);
    log.push(`🪑 Slots livres: ${freeSlots}`);
    if (totalAssigned > totalCapacity) {
      log.push(`⚠️ Total de aulas atribuídas (${totalAssigned}) ultrapassa slots disponíveis (${totalCapacity}) em ${totalAssigned - totalCapacity} aula(s). Ajuste necessário.`);
    }
    if (pendingEstimated > freeSlots) {
      log.push(`⚠️ Pendências (${pendingEstimated}) maiores que slots livres (${freeSlots}). Ajuste necessário nas turmas/atividades.`);
    }

    const pendingList = buildPendingActivitiesForRepair(data, manager);
    if (pendingList.length === 0) {
      log.push('✅ Nenhuma pendência encontrada para ajuste.');
      setData(prev => ({ ...prev, schedule: manager.schedule }));
      setGenerationLog(log);
      setRepairing(false);
      return;
    }

    const totalNeeded = pendingList.reduce((sum, act) => sum + (Number(act.quantity) || 0), 0);
    log.push(`⏳ ${totalNeeded} aula(s) pendente(s) identificada(s) para ajuste.`);

    log.push('💡 Para reorganizar aulas síncronas, use "Gerar Novamente"');

    const syncValidator = new SynchronousClassValidator(data);

    log.push('🔍 Verificando posições de aulas síncronas...');
    const synchronizedCorrupted = validateAndFixSynchronizedClasses(manager, data, log);
    if (synchronizedCorrupted > 0) {
      log.push(`   ✅ ${synchronizedCorrupted} aula(s) síncrona(s) corrigida(s).`);
    }

    const overInfo = computeOverAllocations(data, manager.bookedEntries);
    if (overInfo.totalExcess > 0) {
      log.push(`⚠️ Excessos detectados: ${overInfo.totalExcess} aula(s) acima do planejado.`);
    }

    let recovered = 0;
    const MAX_ATTEMPTS_PER_ACTIVITY = totalNeeded > 20 ? 5 : 3;
    const baseBatchSize = Math.min(15, Math.max(1, Math.ceil(totalNeeded * 0.25)));
    const batchSizes = [15, 10, 5, 1].filter(size => size <= baseBatchSize || size === 1);

    const runRepairPass = (pendingBatch, passLabel, batchSize) => {
      let recoveredInPass = 0;
      log.push(`🎯 ${passLabel} Resolver até ${batchSize} pendências (iterativo).`);

      for (const pending of pendingBatch) {
        if (recoveredInPass >= batchSize) {
          log.push(`⏸️ Pausando reparo após resolver ${recoveredInPass} pendências (Lote concluído).`);
          break;
        }

        let remaining = Number(pending.quantity) || 0;
        const label = describeActivity(pending, data);
        log.push(`➡️ Ajustando ${label} (${remaining} pendente(s))`);

        let attempts = 0;
        while (remaining > 0 && attempts < MAX_ATTEMPTS_PER_ACTIVITY && recoveredInPass < batchSize) {
          attempts++;
          let fixed = 0;

          if (fixed === 0 && pending.doubleLesson && remaining >= 2) {
            fixed = tryRepairDouble(pending, manager, data, log, syncValidator);
          }

          if (fixed === 0 && pending.doubleLesson && remaining >= 2) {
            const first = tryRepairSingle(pending, manager, data, log, true, syncValidator);
            const second = first ? tryRepairSingle(pending, manager, data, log, true, syncValidator) : 0;
            fixed = (first || 0) + (second || 0);
            if (fixed > 0) {
              log.push(`🔨 Aula dupla quebrada em ${fixed} aula(s) simples para ${label}.`);
            }
          }

          if (fixed === 0) {
            fixed = tryRepairSingleDeep(pending, manager, data, log, syncValidator, 3); // Deep swap depth 3
            if (fixed === 0) {
              fixed = tryRepairSingle(pending, manager, data, log, false, syncValidator);
            }
          }

          if (fixed === 0) {
            break;
          }

          recoveredInPass += fixed;
          remaining -= fixed;
          if (remaining < 0) remaining = 0;
        }

        if (remaining > 0) {
          log.push(`⚠️ Ainda faltam ${remaining} aula(s) para ${label}.`);
        }
      }

      return recoveredInPass;
    };

    let recoveredInFirstPass = 0;
    for (const size of batchSizes) {
      recoveredInFirstPass = runRepairPass(pendingList, `1a rodada (lote ${size})`, size);
      if (recoveredInFirstPass > 0) break;
    }
    recovered += recoveredInFirstPass;

    if (recovered === 0 && overInfo.totalExcess > 0) {
      log.push(`🧹 Tentando liberar espaço removendo ${overInfo.totalExcess} excesso(s) não-síncrono(s)...`);
      const removedCount = aggressiveExcessRemoval(manager, data, overInfo, syncValidator, log);
      if (removedCount > 0) {
        const refreshedPending = buildPendingActivitiesForRepair(data, manager);
        if (refreshedPending.length > 0) {
          let recoveredInSecondPass = 0;
          for (const size of batchSizes) {
            recoveredInSecondPass = runRepairPass(refreshedPending, `2a rodada (após remover ${removedCount} excedente(s), lote ${size})`, size);
            if (recoveredInSecondPass > 0) break;
          }
          recovered += recoveredInSecondPass;
        }
      }
    }

    const remainingPending = buildPendingActivitiesForRepair(data, manager);
    const remainingAfter = remainingPending.reduce((sum, act) => sum + (Number(act.quantity) || 0), 0);

    // RECALCULAR totalAllocated final (para refletir mudanças do Smart Repair)
    const totalAllocatedFinal = countValidAllocations(manager.schedule);

    log.push('');
    log.push(`✅ Smart Repair finalizado: ${recovered} aula(s) realocada(s).`);

    if (remainingAfter <= 0) {
      log.push('✅ Parabéns pelo trabalho sua grade foi construida com sucesso.');
    } else {
      log.push(`⏳ Pendências remanescentes: ${remainingAfter}`);
      const currentFreeSlots = Math.max(0, totalCapacity - totalAllocatedFinal);
      const overageTotalAssigned = Math.max(0, totalAssigned - totalCapacity);
      log.push(`   🪑 ${currentFreeSlots} slots livres.`);
      if (overageTotalAssigned > 0) {
        log.push(`   ⚠️ ${overageTotalAssigned} aula(s) ultrapassando o limite do total de slots que é de ${totalCapacity}.`);
      }

      // === DIAGNÓSTICO DETALHADO DAS PENDÊNCIAS ===
      log.push('');
      log.push('📋 Análise das pendências não resolvidas:');
      
      const diagnosticByReason = {
        'Turma cheia': [],
        'Aula síncrona (grupo bloqueado)': [],
        'Aula dupla (sem 2 slots livres)': [],
        'Professor com conflitos': [],
        'Outro motivo': []
      };

      for (const pending of remainingPending) {
        const classData = data.classes?.find(c => c.id === pending.classId);
        const subject = data.subjects?.find(s => s.id === pending.subjectId);
        const teacher = data.teachers?.find(t => t.id === pending.teacherId);
        
        if (!classData || !subject) continue;

        // Contar slots ativos para esta turma
        let activeSlotsCount = 0;
        if (classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
          for (const slotIds of Object.values(classData.activeSlotsByDay)) {
            if (Array.isArray(slotIds)) {
              const lessonSlots = slotIds.filter(slotId => {
                const slot = data.timeSlots?.[slotId];
                return slot?.type === 'aula';
              });
              activeSlotsCount += lessonSlots.length;
            }
          }
        } else if (classData.activeSlots && Array.isArray(classData.activeSlots)) {
          const lessonSlots = classData.activeSlots.filter(slotId => {
            const slot = data.timeSlots?.[slotId];
            return slot?.type === 'aula';
          });
          activeSlotsCount += lessonSlots.length * DAYS.length;
        }

        // Contar quantas aulas desta turma já estão alocadas
        let allocatedForClass = 0;
        for (const entry of manager.bookedEntries) {
          if (entry.classId === pending.classId) allocatedForClass += 1;
        }

        // Determinar motivo da pendência
        let reason = 'Outro motivo';

        if (pending.isSynchronous || pending.isGranularSync || pending.syncronizeGroup) {
          reason = 'Aula síncrona (grupo bloqueado)';
        } else if (pending.doubleLesson && currentFreeSlots < 2) {
          reason = 'Aula dupla (sem 2 slots livres)';
        } else if (allocatedForClass >= activeSlotsCount && activeSlotsCount > 0) {
          reason = 'Turma cheia';
        } else if (teacher) {
          // Verificar conflitos de professor
          const teacherEntries = manager.bookedEntries.filter(e => e.teacherId === pending.teacherId);
          if (teacherEntries.length > 0) {
            reason = 'Professor com conflitos';
          }
        }

        diagnosticByReason[reason].push({
          quantity: pending.quantity,
          className: classData.name,
          subjectName: subject.name,
          teacherName: teacher?.name || 'Professor',
          pending: pending
        });
      }

      // Exibir resumo agrupado
      for (const [reason, items] of Object.entries(diagnosticByReason)) {
        if (items.length === 0) continue;

        const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
        log.push(`   🔹 ${reason}: ${totalQty} aula(s)`);

        // Agrupar por turma para visibilidade
        const byClass = {};
        items.forEach(item => {
          if (!byClass[item.className]) byClass[item.className] = [];
          byClass[item.className].push(item);
        });

        for (const [className, classItems] of Object.entries(byClass)) {
          const qty = classItems.reduce((sum, item) => sum + item.quantity, 0);
          log.push(`      • ${className}: ${qty} aula(s)`);
          classItems.forEach(item => {
            log.push(`        - ${item.subjectName} (Prof. ${item.teacherName})`);
          });
        }
      }

      const suggestedBatch = batchSizes.find(size => size > 1) || 1;
      log.push(`💡 Clique em "Ajustar" novamente para resolver mais um lote de ${suggestedBatch}.`);
    }

    // === RESUMO FINAL DA OPERAÇÃO ===
    log.push('');
    log.push('📊 RESUMO FINAL DA OPERAÇÃO:');
    log.push(`   ✅ Smart Repair finalizado: ${recovered} aula(s) realocada(s).`);
    log.push(`   ⏳ Pendências remanescentes: ${remainingAfter}`);
    log.push(`   🪑 ${Math.max(0, totalCapacity - totalAllocatedFinal)} slots livres.`);
    const finalOverage = Math.max(0, totalAssigned - totalCapacity);
    if (finalOverage > 0) {
      log.push(`   ⚠️ ${finalOverage} aula(s) ultrapassando o limite do total de slots que é de ${totalCapacity}.`);
    }

    setData(prev => ({ ...prev, schedule: manager.schedule }));
    setGenerationLog(log);
    setRepairing(false);
  } catch (error) {
    console.error("Erro no Smart Repair:", error);
    log.push(`❌ Erro no Smart Repair: ${error.message}`);
    setGenerationLog(log);
    setRepairing(false);
  }
}
