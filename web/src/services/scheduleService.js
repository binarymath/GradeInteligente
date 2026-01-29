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
import SynchronousScheduler from './SynchronousScheduler';
import SynchronousClassValidator from './SynchronousClassValidator';

import { LIMITS } from '../constants/schedule';
import { DAYS } from '../utils';

// Imports dos novos módulos modularizados
import {
  describeActivity,
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
  relocateBlockingEntryDeep
} from './smartRepairService';
import {
  analyzeExistingSchedule,
  generateFinalLog
} from './scheduleAnalyzer';

/**
 * Gera a grade de forma assíncrona
 */
export async function generateScheduleAsync(data, setData, setGenerationLog, setGenerating) {
  setGenerating(true);
  setGenerationLog([]);

  const generationStartTime = Date.now();

  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    let currentLimits = { ...LIMITS };
    const hasExistingSchedule = data.schedule && Object.keys(data.schedule).length > 0;
    let shouldUseExisting = false;

    if (hasExistingSchedule) {
      const isFirstAnalysis = !data._analyzedOnce;
      const analysis = analyzeExistingSchedule(data);
      const analysisLog = [...analysis.log];

      if (isFirstAnalysis) {
        analysisLog.push('');
        analysisLog.push('ℹ️  Esta é uma análise da grade restaurada.');
        analysisLog.push('📝 Nenhuma alteração foi feita no arquivo.');
        analysisLog.push('');

        if (analysis.pendingCount === 0 && analysis.conflicts.length === 0) {
          analysisLog.push('✅ Grade perfeita! Sem pendências ou conflitos.');
        } else {
          analysisLog.push('⚠️  Para tentar corrigir os problemas, clique em "Gerar Novamente".');
        }

        analysisLog.push('');
        setGenerationLog(analysisLog);
        setData(prev => ({ ...prev, _analyzedOnce: true }));
        setGenerating(false);
        return;
      } else {
        if (analysis.pendingCount === 0 && analysis.conflicts.length === 0) {
          analysisLog.push('');
          analysisLog.push('✅ Grade atual está perfeita.');
          analysisLog.push('🔄 Gerando nova variação para comparação...');
          analysisLog.push('');
          setGenerationLog(analysisLog);
          // Limpar schedule para regeneração completa
          data.schedule = {};
          setData(prev => ({ ...prev, schedule: {} }));
        } else {
          analysisLog.push('');
          analysisLog.push('🔧 Tentando corrigir pendências/conflitos automaticamente...');
          analysisLog.push('');
          setGenerationLog(analysisLog);
          shouldUseExisting = true;
        }
      }
    }

    // FASE 0: Processar aulas síncronas antes de gerar o resto
    const MAX_LOCAL_ATTEMPTS = 500;
    let manager = new ScheduleManager(data, currentLimits);
    let result = null;
    let minPending = Infinity;
    let bestManager = null;

    setGenerationLog([`🔄 Analisando estado inicial...`]);

    const subjectsWithSyncConfigs = data.subjects.filter(
      s => s.isSynchronous && s.synchronousConfigs && s.synchronousConfigs.length > 0
    );

    if (subjectsWithSyncConfigs.length > 0) {
      setGenerationLog([`🔄 Processando ${subjectsWithSyncConfigs.length} matéria(s) com configurações síncronas...`]);
    } else {
      setGenerationLog([`ℹ️ Nenhuma aula síncrona com configurações granulares encontrada. Gerando grade padrão...`]);
    }

    // Criar scheduler para processar aulas síncronas
    const synchronousScheduler = new SynchronousScheduler(data, {});
    const syncResult = synchronousScheduler.processAllGroups();

    if (!syncResult.success) {
      setGenerationLog([
        `❌ Falha ao alocar aulas síncronas:\n`,
        syncResult.error,
        `\n`,
        ...syncResult.log
      ]);
      setGenerating(false);
      return;
    }

    if (syncResult.log && syncResult.log.length > 0) {
      setGenerationLog([...syncResult.log]);
    }

    const scheduleWithSync = syncResult.schedule || {};

    // IMPLEMENTAÇÃO DO ISOLAMENTO DE AULAS SÍNCRONAS
    const allocatedSyncIds = syncResult.allocatedActivityIds || [];

    if (allocatedSyncIds.length > 0) {
      setGenerationLog(prev => [...prev, `🔒 Isolando ${allocatedSyncIds.length} atividades síncronas do algoritmo principal.`]);
    }

    // Cria uma versão filtrada das atividades para o ScheduleManager padrão
    // Isso impede que o ScheduleManager tente alocar o que JÁ foi alocado síncronamente.
    // O Schedule manager ainda receberá o 'data' completo, mas vamos passar uma lista de activities explicita no construtor se necessário,
    // ou alterar o objeto data clonado.

    // Melhor abordagem: Criar um 'dataForGeneration' com activities filtradas
    const dataForGeneration = {
      ...data,
      activities: data.activities.filter(a => !allocatedSyncIds.includes(a.id))
    };

    // FASE 1: Gerar múltiplas variações
    if (!shouldUseExisting) {
      setGenerationLog(prev => [...prev, `🔄 Executando ${MAX_LOCAL_ATTEMPTS} iterações para encontrar a melhor grade base...`]);

      for (let i = 0; i < MAX_LOCAL_ATTEMPTS; i++) {
        // Usa o data filtrado
        const tempManager = new ScheduleManager(dataForGeneration, currentLimits, [], true);

        if (Object.keys(scheduleWithSync).length > 0) {
          tempManager.importExistingSchedule(scheduleWithSync);
        }

        const tempResult = tempManager.generate();

        let totalExpected = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
        let totalAllocated = tempManager.bookedEntries.length;
        let pending = totalExpected - totalAllocated;

        if (pending < minPending) {
          minPending = pending;
          result = tempResult;
          bestManager = tempManager;

          if (pending === 0) {
            const finalManager = new ScheduleManager(dataForGeneration, currentLimits, [], false);

            if (Object.keys(scheduleWithSync).length > 0) {
              finalManager.importExistingSchedule(scheduleWithSync);
            }

            result = finalManager.generate();
            bestManager = finalManager;
            bestManager.logMessage(`✨ Grade perfeita encontrada na iteração ${i + 1}!`);
            break;
          }
        }
      }

      if (minPending > 0) {
        manager = new ScheduleManager(dataForGeneration, currentLimits, [], false);
        result = manager.generate();
        manager.logMessage(`🏆 Melhor resultado selecionado: ${minPending} pendências após ${MAX_LOCAL_ATTEMPTS} iterações.`);
      } else {
        manager = bestManager;
        // Garante que result foi inicializado
        if (!result && manager) {
          result = { schedule: manager.schedule, log: manager.log, conflicts: [] };
        }
      }
    } else if (shouldUseExisting && result) {
      // shouldUseExisting: já tem resultado do modo de correção
      manager = bestManager || manager;
    } else {
      // Fallback: gerar grade básica
      manager = new ScheduleManager(data, currentLimits, [], false);
      result = manager.generate();
    }

    // Garantir que result nunca seja null
    if (!result) {
      result = { schedule: manager.schedule, log: manager.log, conflicts: [] };
    }



    // Garantir que result SEMPRE tem um valor antes de usar
    if (!result || !result.schedule) {
      console.warn('⚠️ result era inválido! Recriando...');
      manager.logMessage(`⚠️ Finalizando com resultado atual do manager...`);
      result = {
        schedule: manager ? manager.schedule : {},
        log: manager ? manager.log : [],
        conflicts: []
      };
    }

    // SECURITY CHECK: nunca deixar schedule ser undefined/null
    const safeSchedule = (result && result.schedule) ? result.schedule : (manager ? manager.schedule : {});
    console.log('Salvando schedule:', Object.keys(safeSchedule || {}).length, 'slots');

    setData(prev => ({ ...prev, schedule: safeSchedule || {} }));

    // FASE 3: Alocação inteligente para pendências
    const totalExpectedActivities = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
    let totalAllocatedFinal = manager.bookedEntries.length;
    let pendingActivities = Math.max(0, totalExpectedActivities - totalAllocatedFinal);
    const overInfo = computeOverAllocations(data, manager.bookedEntries);

    if (pendingActivities > 0) {
      const incompleteActivities = [];
      data.activities.forEach(act => {
        const bookedCount = manager.bookedEntries.filter(e =>
          e.classId === act.classId && e.subjectId === act.subjectId
        ).length;

        const missing = act.quantity - bookedCount;
        if (missing > 0) {
          for (let i = 0; i < missing; i++) {
            incompleteActivities.push(act);
          }
        }
      });

      const resolver = new SmartAllocationResolver(data, manager.schedule, currentLimits);
      const resolverResult = resolver.resolve(incompleteActivities);

      if (resolverResult.resolved) {
        manager.schedule = resolverResult.schedule;
        manager.bookedEntries = resolverResult.bookedEntries;
        totalAllocatedFinal = resolverResult.bookedEntries.length;
        pendingActivities = Math.max(0, totalExpectedActivities - totalAllocatedFinal);

        const refreshed = computeOverAllocations(data, manager.bookedEntries);
        overInfo.subjectExcess = refreshed.subjectExcess;
        overInfo.teacherExcess = refreshed.teacherExcess;
        overInfo.totalExcess = refreshed.totalExcess;
      }

      // FASE 4: Quebra de duplas
      if (pendingActivities > 0 && incompleteActivities.length > 0) {
        const doubleBreaker = new DoubleBreakResolver(data, manager.schedule, currentLimits);
        const breakResult = doubleBreaker.resolve(incompleteActivities);

        if (breakResult.brokenDoubles.length > 0) {
          manager.schedule = breakResult.schedule;
          manager.bookedEntries = breakResult.bookedEntries;
          totalAllocatedFinal = breakResult.bookedEntries.length;
          pendingActivities = Math.max(0, totalExpectedActivities - totalAllocatedFinal);

          const refreshed = computeOverAllocations(data, manager.bookedEntries);
          overInfo.subjectExcess = refreshed.subjectExcess;
          overInfo.teacherExcess = refreshed.teacherExcess;
          overInfo.totalExcess = refreshed.totalExcess;
        }
      }
    }

    // Gerar log final
    const finalLog = generateFinalLog(data, manager, overInfo, generationStartTime);

  } catch (error) {
    console.error("Erro fatal na geração:", error);
    setGenerationLog(['❌ Erro crítico no sistema: ' + error.message]);
  } finally {
    setGenerating(false);
  }
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

    for (const [key, entry] of Object.entries(data.schedule)) {
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
    for (const [key, entry] of Object.entries(data.schedule)) {
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
      log.push(`🧹 Removendo ${overInfo.totalExcess} aula(s) excedente(s) para liberar espaço...`);
      removeExcessAllocations(manager, overInfo, data, log, syncValidator);
    }

    let recovered = 0;
    const MAX_ATTEMPTS_PER_ACTIVITY = 3;

    for (const pending of pendingList) {
      let remaining = Number(pending.quantity) || 0;
      const label = describeActivity(pending, data);
      log.push(`➡️ Ajustando ${label} (${remaining} pendente(s))`);

      let attempts = 0;
      while (remaining > 0 && attempts < MAX_ATTEMPTS_PER_ACTIVITY) {
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
          fixed = tryRepairSingle(pending, manager, data, log, false, syncValidator);
        }

        if (fixed === 0) {
          break;
        }

        recovered += fixed;
        remaining -= fixed;
        if (remaining < 0) remaining = 0;
      }

      if (remaining > 0) {
        log.push(`⚠️ Ainda faltam ${remaining} aula(s) para ${label}.`);
      }
    }

    const remainingAfter = buildPendingActivitiesForRepair(data, manager)
      .reduce((sum, act) => sum + (Number(act.quantity) || 0), 0);

    log.push('');
    log.push(`✅ Smart Repair finalizado: ${recovered} aula(s) realocada(s).`);

    if (remainingAfter <= 0) {
      log.push('✅ Parabéns pelo trabalho sua grade foi construida com sucesso.');
      console.log('Smart Repair Success: 0 pendencies remaining.');
    } else {
      log.push(`⏳ Pendências remanescentes: ${remainingAfter}`);
      console.log(`Smart Repair Incomplete: ${remainingAfter} remaining.`);
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
