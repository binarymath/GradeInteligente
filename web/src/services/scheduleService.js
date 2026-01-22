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
import { geminiService } from './geminiService';
import { LIMITS } from '../constants/schedule';

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

    // FASE 1: Gerar múltiplas variações
    if (!shouldUseExisting) {
      setGenerationLog([`🔄 Executando ${MAX_LOCAL_ATTEMPTS} iterações para encontrar a melhor grade base...`]);

      for (let i = 0; i < MAX_LOCAL_ATTEMPTS; i++) {
        const tempManager = new ScheduleManager(data, currentLimits, [], true);
        
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
            const finalManager = new ScheduleManager(data, currentLimits, [], false);
            
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
        manager = new ScheduleManager(data, currentLimits, [], false);
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

    // FASE 2: IA de otimização
    let attempts = 0;
    const MAX_AI_ATTEMPTS = 3;
    let totalExpected = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
    let totalAllocated = manager.bookedEntries.length;
    let pendingCount = totalExpected - totalAllocated;

    const apiKey = geminiService.getApiKey();
    manager.logMessage(`🔍 Diagnóstico IA: Pendentes=${pendingCount} (Esperado:${totalExpected} - Alocado:${totalAllocated}), Chave=${apiKey ? 'DETECTADA' : 'AUSENTE'}`);

    if (pendingCount > 0 && !apiKey) {
      manager.logMessage(`⚠ ${pendingCount} aulas não alocadas. Configure a API Key para correções automáticas.`);
    }

    while (pendingCount > 0 && attempts < MAX_AI_ATTEMPTS && apiKey) {
      const failures = manager.failures;
      manager.logMessage(`🤖 [IA] Tentativa ${attempts + 1}: Analisando ${failures.length} bloqueios...`);
      setGenerationLog([...manager.log]);

      try {
        const suggestion = await geminiService.analyzeAndFix(
          failures,
          result.conflicts,
          currentLimits
        );

        if (!suggestion || !suggestion.suggestedLimits) {
          manager.logMessage(`🤖 [IA] Sem resposta válida da API.`);
          break;
        }

        manager.logMessage(`💡 [IA] Raciocínio: ${suggestion.rationale}`);

        let changed = false;
        if (suggestion.suggestedLimits.MAX_SAME_SUBJECT_PER_DAY > currentLimits.MAX_SAME_SUBJECT_PER_DAY) {
          currentLimits.MAX_SAME_SUBJECT_PER_DAY = suggestion.suggestedLimits.MAX_SAME_SUBJECT_PER_DAY;
          manager.logMessage(`  -> 🟢 Novo limite de Aulas/Dia: ${suggestion.suggestedLimits.MAX_SAME_SUBJECT_PER_DAY}`);
          changed = true;
        }
        if (suggestion.suggestedLimits.MAX_TEACHER_LOGGED_PER_DAY > currentLimits.MAX_TEACHER_LOGGED_PER_DAY) {
          currentLimits.MAX_TEACHER_LOGGED_PER_DAY = suggestion.suggestedLimits.MAX_TEACHER_LOGGED_PER_DAY;
          manager.logMessage(`  -> 🟢 Novo limite de Prof/Dia: ${suggestion.suggestedLimits.MAX_TEACHER_LOGGED_PER_DAY}`);
          changed = true;
        }

        if (suggestion.priorityFocus && Array.isArray(suggestion.priorityFocus) && suggestion.priorityFocus.length > 0) {
          manager.logMessage(`  -> 🎯 IA definiu prioridade absoluta para: ${suggestion.priorityFocus.length} itens.`);
          changed = true;
        }

        if (!changed) {
          manager.logMessage(`  -> IA sugeriu limites que já estão em vigor. Parando para evitar loop.`);
          break;
        }

        const globalFailureIds = manager.failures.map(f => f.activityId);
        const aiPriorityIds = suggestion.priorityFocus || [];
        const combinedPriority = [...new Set([...aiPriorityIds, ...globalFailureIds])];

        const oldLog = manager.log;
        manager = new ScheduleManager(data, currentLimits, combinedPriority);
        manager.log = oldLog;

        if (result && result.schedule) {
          manager.logMessage(`🔄 Mantendo grade parcial e tentando alocar as falhas com novos parâmetros...`);
          manager.importExistingSchedule(result.schedule);

          if (combinedPriority.length > 0) {
            manager.bumpPriorityBlockers(combinedPriority);
          }

          result = manager.fillPendingOnly();
        } else {
          manager.logMessage(`🔄 Re-gerando grade do zero com novos parâmetros...`);
          result = manager.generate();
        }

        if (manager.failures.length > 0) {
          manager.logMessage(`🕵️‍♀️ Tentando otimizar ${manager.failures.length} falhas com Trocas Inteligentes...`);
          const optResult = manager.optimize();
          result = optResult;
        }

        totalExpected = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
        totalAllocated = manager.bookedEntries.length;
        pendingCount = totalExpected - totalAllocated;

        attempts++;

      } catch (err) {
        manager.logMessage(`🤖 [IA] Exceção ao consultar API: ${err.message}`);
        break;
      }
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
    log.push(`⏳ Pendências remanescentes: ${remainingAfter}`);

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
