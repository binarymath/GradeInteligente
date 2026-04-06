/**
 * scheduleWorker.js
 *
 * Web Worker que executa o pipeline completo de geração de grade.
 * Corre numa thread separada, eliminando o bloqueio da Main Thread.
 *
 * Mensagens enviadas:
 *   { type: 'LOG',     payload: string }          — linha de log em tempo real
 *   { type: 'SUCCESS', payload: { schedule } }    — grade final
 *   { type: 'ERROR',   payload: string }          — mensagem de erro
 */

import ScheduleManager from '../models/ScheduleManager';
import SmartAllocationResolver from '../models/SmartAllocationResolver';
import DoubleBreakResolver from '../models/DoubleBreakResolver';
import ForceAllocationResolver from '../models/ForceAllocationResolver';
import SynchronousScheduler from '../services/SynchronousScheduler';
import SynchronousClassValidator from '../services/SynchronousClassValidator';
import { LIMITS } from '../constants/schedule';
import { DAYS } from '../utils';
import { computeOverAllocations } from '../services/scheduleHelpers';
import { aggressiveExcessRemoval } from '../services/smartRepairService';
import { generateFinalLog } from '../services/scheduleAnalyzer';

/** Envia uma linha de log para a Main Thread */
function log(msg) {
  self.postMessage({ type: 'LOG', payload: msg });
}

self.onmessage = function (event) {
  const { data } = event.data;
  const generationStartTime = Date.now();

  try {
    // ─────────────────────────────────────────────
    // FASE 0: Validação de turmas sem horários
    // ─────────────────────────────────────────────
    const classesWithoutSlots = (data.classes || []).filter(cls => {
      const hasActiveSlotsByDay =
        cls.activeSlotsByDay && Object.keys(cls.activeSlotsByDay).length > 0;
      const hasActiveSlots =
        cls.activeSlots && Array.isArray(cls.activeSlots) && cls.activeSlots.length > 0;
      return !hasActiveSlotsByDay && !hasActiveSlots;
    });

    if (classesWithoutSlots.length > 0) {
      log('🚨 ERRO: As seguinte(s) turma(s) NÃO têm horários definidos:');
      classesWithoutSlots.forEach(c => log(`   • ${c.name || c.id}`));
      log('');
      log('⚠️ Por favor, edite essas turmas em "Dados" → "Turmas" e selecione os horários ativos.');
      log('');
      log('Operação cancelada.');
      self.postMessage({ type: 'ERROR', payload: 'Turmas sem horários definidos' });
      return;
    }

    // ─────────────────────────────────────────────
    // FASE 1: Aulas síncronas
    // ─────────────────────────────────────────────
    const subjectsWithSyncConfigs = (data.subjects || []).filter(
      s => s.isSynchronous && s.synchronousConfigs && s.synchronousConfigs.length > 0
    );

    if (subjectsWithSyncConfigs.length > 0) {
      log(`🔄 Processando ${subjectsWithSyncConfigs.length} matéria(s) com configurações síncronas...`);
    } else {
      log('ℹ️ Nenhuma aula síncrona encontrada. Gerando grade padrão...');
    }

    const synchronousScheduler = new SynchronousScheduler(data, {});
    const syncResult = synchronousScheduler.processAllGroups();

    if (syncResult.log && syncResult.log.length > 0) {
      syncResult.log.forEach(msg => log(msg));
    }

    if (!syncResult.success) {
      log('❌ Falha ao alocar aulas síncronas.');
      self.postMessage({ type: 'ERROR', payload: 'Falha nas aulas síncronas' });
      return;
    }

    const scheduleWithSync = syncResult.schedule || {};
    const allocatedSyncIds = syncResult.allocatedActivityIds || [];

    if (allocatedSyncIds.length > 0) {
      log(`🔒 Isolando ${allocatedSyncIds.length} atividades síncronas do algoritmo principal.`);
    }

    // Atividades restantes (excluindo as já alocadas sincronamente)
    const dataForGeneration = {
      ...data,
      activities: (data.activities || []).filter(a => !allocatedSyncIds.includes(a.id)),
    };

    // ─────────────────────────────────────────────
    // FASE 2: ScheduleManager — múltiplas iterações
    // ─────────────────────────────────────────────
    const MAX_LOCAL_ATTEMPTS = 350;
    let manager = null;
    let result = null;
    let minPending = Infinity;

    log(`🔄 Executando ${MAX_LOCAL_ATTEMPTS} iterações para encontrar a melhor grade base...`);

    for (let i = 0; i < MAX_LOCAL_ATTEMPTS; i++) {
      // Log de progresso a cada 50 iterações
      if (i > 0 && i % 50 === 0) {
        const elapsed = Math.round((Date.now() - generationStartTime) / 1000);
        log(`   ⏳ Iteração ${i}/${MAX_LOCAL_ATTEMPTS} — melhor resultado: ${minPending} pendência(s) (${elapsed}s)`);
      }

      const tempManager = new ScheduleManager(dataForGeneration, LIMITS, [], true);

      if (Object.keys(scheduleWithSync).length > 0) {
        tempManager.importExistingSchedule(scheduleWithSync);
      }

      tempManager.generate();

      const totalExpected = (data.activities || []).reduce(
        (sum, a) => sum + (Number(a.quantity) || 0), 0
      );
      const pending = totalExpected - tempManager.bookedEntries.length;

      if (pending < minPending) {
        minPending = pending;
        manager = tempManager;

        if (pending === 0) {
          // Solução perfeita — regenerar sem modo aleatório para resultado determinístico
          const finalManager = new ScheduleManager(dataForGeneration, LIMITS, [], false);
          if (Object.keys(scheduleWithSync).length > 0) {
            finalManager.importExistingSchedule(scheduleWithSync);
          }
          finalManager.generate();
          manager = finalManager;
          manager.logMessage(`✨ Grade perfeita encontrada na iteração ${i + 1}!`);
          break;
        }
      }
    }

    // Fallback: se nenhuma iteração produziu resultado
    if (!manager) {
      manager = new ScheduleManager(dataForGeneration, LIMITS, [], false);
      if (Object.keys(scheduleWithSync).length > 0) {
        manager.importExistingSchedule(scheduleWithSync);
      }
      manager.generate();
    }

    if (minPending > 0) {
      manager.logMessage(
        `🏆 Melhor resultado selecionado: ${minPending} pendência(s) após ${MAX_LOCAL_ATTEMPTS} iterações.`
      );
    }

    // Enviar logs do ScheduleManager
    if (manager.log && manager.log.length > 0) {
      manager.log.forEach(msg => log(msg));
    }

    result = { schedule: manager.schedule, log: manager.log, conflicts: [] };

    // ─────────────────────────────────────────────
    // FASE 3: SmartAllocationResolver — pendências
    // ─────────────────────────────────────────────
    const syncValidator = new SynchronousClassValidator(data);
    const totalExpectedActivities = (data.activities || []).reduce(
      (sum, a) => sum + (Number(a.quantity) || 0), 0
    );

    let totalAllocatedFinal = manager.bookedEntries.length;
    let pendingActivities = Math.max(0, totalExpectedActivities - totalAllocatedFinal);
    const overInfo = computeOverAllocations(data, manager.bookedEntries);

    let incompleteActivities = [];

    if (pendingActivities > 0) {
      (data.activities || []).forEach(act => {
        const bookedCount = manager.bookedEntries.filter(
          e => e.classId === act.classId && e.subjectId === act.subjectId
        ).length;
        const missing = act.quantity - bookedCount;
        if (missing > 0) {
          for (let i = 0; i < missing; i++) {
            incompleteActivities.push(act);
          }
        }
      });

      const resolver = new SmartAllocationResolver(data, manager.schedule, LIMITS, syncValidator);
      const resolverResult = resolver.resolve(incompleteActivities);

      if (resolverResult.log && resolverResult.log.length > 0) {
        resolverResult.log.forEach(msg => log(msg));
      }

      manager.schedule = resolverResult.schedule;
      manager.bookedEntries = resolverResult.bookedEntries;
      totalAllocatedFinal = manager.bookedEntries.length;

      if (resolverResult.resolved) {
        pendingActivities = 0;
      } else {
        // Tentativa de refinamento com remoção agressiva de excessos
        if (pendingActivities > 10) {
          const refinementLog = [];
          refinementLog.push('');
          refinementLog.push('🔄 Iniciando refinamento iterativo (remoção agressiva de excessos)...');

          const overInfoBefore = computeOverAllocations(data, manager.bookedEntries);
          const removedCount = aggressiveExcessRemoval(
            manager, data, overInfoBefore, syncValidator, refinementLog
          );

          refinementLog.forEach(msg => log(msg));

          if (removedCount > 0) {
            log(`✅ ${removedCount} aula(s) removida(s), liberando slots para pendências`);
            log('');

            // Recalcular pendências
            incompleteActivities = [];
            (data.activities || []).forEach(act => {
              const bookedCount = manager.bookedEntries.filter(
                e => e.classId === act.classId && e.subjectId === act.subjectId
              ).length;
              const missing = act.quantity - bookedCount;
              if (missing > 0) {
                for (let i = 0; i < missing; i++) incompleteActivities.push(act);
              }
            });

            log(`🔄 Tentando SmartAllocationResolver novamente com ${incompleteActivities.length} aula(s)...`);
            const resolver2 = new SmartAllocationResolver(data, manager.schedule, LIMITS, syncValidator);
            const resolverResult2 = resolver2.resolve(incompleteActivities);

            if (resolverResult2.log && resolverResult2.log.length > 0) {
              resolverResult2.log.forEach(msg => log(msg));
            }

            manager.schedule = resolverResult2.schedule;
            manager.bookedEntries = resolverResult2.bookedEntries;
            totalAllocatedFinal = manager.bookedEntries.length;
            pendingActivities = resolverResult2.resolved ? 0 : incompleteActivities.length;
          }
        }
      }
    }

    // ─────────────────────────────────────────────
    // FASE 4: Verificação de integridade das síncronas
    // ─────────────────────────────────────────────
    if (syncValidator) {
      log('');
      log('🔒 Verificando integridade das aulas síncronas...');
      const syncFixLogs = [];
      const groups = syncValidator.getAllSyncGroups();
      let fixedCount = 0;

      for (const group of groups) {
        if (group.preferredDayIdx != null && group.preferredSlotIdx != null) {
          const firstClass = group.classes[0];
          const fixed = syncValidator.fixSyncGroupPosition(
            manager, firstClass, group.subjectId, group.teacherId, syncFixLogs
          );
          if (fixed) fixedCount++;
        }
      }

      syncFixLogs.forEach(msg => log(msg));
      if (fixedCount > 0) {
        log(`✅ ${fixedCount} grupos síncronos verificados/corrigidos.`);
      }
    }

    const refreshed = computeOverAllocations(data, manager.bookedEntries);
    overInfo.subjectExcess = refreshed.subjectExcess;
    overInfo.teacherExcess = refreshed.teacherExcess;
    overInfo.totalExcess = refreshed.totalExcess;

    // ─────────────────────────────────────────────
    // FASE 5: DoubleBreakResolver
    // ─────────────────────────────────────────────
    if (pendingActivities > 0 && incompleteActivities.length > 0) {
      const doubleBreaker = new DoubleBreakResolver(data, manager.schedule, LIMITS);
      const breakResult = doubleBreaker.resolve(incompleteActivities);

      if (breakResult.brokenDoubles && breakResult.brokenDoubles.length > 0) {
        manager.schedule = breakResult.schedule;
        manager.bookedEntries = breakResult.bookedEntries;
        totalAllocatedFinal = breakResult.bookedEntries.length;
        pendingActivities = Math.max(0, totalExpectedActivities - totalAllocatedFinal);

        const refreshed2 = computeOverAllocations(data, manager.bookedEntries);
        overInfo.subjectExcess = refreshed2.subjectExcess;
        overInfo.teacherExcess = refreshed2.teacherExcess;
        overInfo.totalExcess = refreshed2.totalExcess;
      }
    }

    // ─────────────────────────────────────────────
    // FASE 6: Modo agressivo / extremo
    // ─────────────────────────────────────────────
    if (pendingActivities > 30) {
      log('');
      log('🚨 Ativando modo AGRESSIVO para resolver pendências restantes...');

      // Quebrar duplas para liberar slots
      log('🔨 Quebrando aulas duplas para liberar slots...');
      const doubleEntries = manager.bookedEntries.filter(e => {
        const nextSlot =
          e.slotIdx + 1 < (data.timeSlots || []).length
            ? data.timeSlots[e.slotIdx + 1]
            : null;
        return (
          nextSlot &&
          manager.bookedEntries.some(
            e2 =>
              e2.classId === e.classId &&
              e2.dayIdx === e.dayIdx &&
              e2.slotIdx === e.slotIdx + 1 &&
              e2.subjectId === e.subjectId
          )
        );
      });

      let freed = 0;
      const keysToRemove = [];
      doubleEntries.forEach(entry => {
        const nextKey = `${entry.classId}-${DAYS[entry.dayIdx]}-${entry.slotIdx + 1}`;
        if (manager.schedule[nextKey]) {
          keysToRemove.push(nextKey);
          freed++;
        }
      });
      keysToRemove.forEach(key => delete manager.schedule[key]);
      manager.bookedEntries = manager.bookedEntries.filter(
        e => !keysToRemove.includes(`${e.classId}-${DAYS[e.dayIdx]}-${e.slotIdx}`)
      );

      if (freed > 0) {
        log(`   Liberados ${freed} slot(s) para alocação`);
        const retryResolver = new SmartAllocationResolver(
          data, manager.schedule, LIMITS, syncValidator
        );
        const retryResult = retryResolver.resolve(incompleteActivities);
        if (retryResult.bookedEntries.length > manager.bookedEntries.length) {
          manager.schedule = retryResult.schedule;
          manager.bookedEntries = retryResult.bookedEntries;
          totalAllocatedFinal = manager.bookedEntries.length;
          pendingActivities = Math.max(0, totalExpectedActivities - totalAllocatedFinal);
        }
      }

      // Modo extremo: ForceAllocationResolver
      if (pendingActivities > 20) {
        log('💡 Ativando modo EXTREMO (força alocação ignorando conflitos menores)...');
        const forceResolver = new ForceAllocationResolver(data, manager.schedule, LIMITS);
        const forceResult = forceResolver.resolve(incompleteActivities);

        if (forceResult.allocatedCount > 0) {
          manager.schedule = forceResult.schedule;
          manager.bookedEntries = forceResult.bookedEntries;
          totalAllocatedFinal = manager.bookedEntries.length;
          pendingActivities = Math.max(0, totalExpectedActivities - totalAllocatedFinal);
          log(`✅ +${forceResult.allocatedCount} aula(s) alocada(s) em modo extremo (${pendingActivities} pendências)`);

          if (forceResult.warnings && forceResult.warnings.length > 0) {
            log('');
            log('⚠️ Avisos de alocação extrema:');
            forceResult.warnings.forEach(w => log(`   ${w}`));
          }
        }
      }

      if (pendingActivities > 20) {
        log('');
        log('💡 Sugestões para resolver as pendências restantes:');
        log('   1️⃣ Reduzir quantidade de aulas de algumas matérias');
        log('   2️⃣ Adicionar mais dias de aula (se possível para turmas)');
        log('   3️⃣ Revisar indisponibilidades de professores');
        log('   4️⃣ Dividir turmas síncronas em lotes menores');
        log('   5️⃣ Estender turno de algumas turmas (Manhã → Integral, etc)');
      }
    }

    // ─────────────────────────────────────────────
    // LOG FINAL
    // ─────────────────────────────────────────────
    const finalLog = generateFinalLog(data, manager, overInfo, generationStartTime);
    finalLog.forEach(msg => log(msg));

    // ─────────────────────────────────────────────
    // RESULTADO
    // ─────────────────────────────────────────────
    self.postMessage({
      type: 'SUCCESS',
      payload: { schedule: manager.schedule || {} },
    });
  } catch (err) {
    console.error('[scheduleWorker] Erro fatal:', err);
    self.postMessage({ type: 'ERROR', payload: err.message + '\n' + (err.stack || '') });
  }
};
