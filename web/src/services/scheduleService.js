// Serviço de geração de grade.
import ScheduleManager from '../models/ScheduleManager';
import { geminiService } from './geminiService';
import { LIMITS } from '../constants/schedule';

/**
 * Gera a grade de forma assíncrona atualizando estados de progresso.
 * Agora com inteligência artificial para otimização automática.
 */
export function generateScheduleAsync(data, setData, setGenerationLog, setGenerating) {
  setGenerating(true);
  setGenerationLog([]);

  setTimeout(async () => {
    try {
      let currentLimits = { ...LIMITS };

      // Verificar se já existe uma grade gerada
      const hasExistingSchedule = data.schedule && Object.keys(data.schedule).length > 0;
      const totalExpectedBase = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);

      if (hasExistingSchedule) {
        // MODO CORREÇÃO: Já tem grade, vamos apenas corrigir pendências
        const existingCount = Object.keys(data.schedule).length;
        const pendingCount = totalExpectedBase - existingCount;

        if (pendingCount > 0) {
          setGenerationLog([`🔧 Modo Correção: Detectada grade com ${pendingCount} pendências. Tentando corrigir...`]);

          // Criar manager com grade existente
          const manager = new ScheduleManager(data, currentLimits);
          manager.importExistingSchedule(data.schedule);

          const result = manager.fillPendingOnly();

          // Finalizar
          setData(prev => ({ ...prev, schedule: result.schedule, scheduleConflicts: result.conflicts }));

          const finalPending = totalExpectedBase - manager.bookedEntries.length;
          if (finalPending === 0) {
            manager.logMessage('✨ Todas as pendências foram resolvidas!');
          } else {
            manager.logMessage(`⚠ Ainda restam ${finalPending} pendências após correção.`);
          }

          setGenerationLog(manager.log);
          setGenerating(false);
          return;
        } else {
          setGenerationLog([`✅ Grade já está completa (${existingCount} aulas alocadas). Gerando nova grade do zero...`]);
        }
      }

      // FASE 1: BUSCA ALEATÓRIA (Best-of-N) - Geração do zero
      const MAX_LOCAL_ATTEMPTS = 500;
      let manager = new ScheduleManager(data, currentLimits);
      let result = null;
      let minPending = Infinity;
      let bestManager = null;

      setGenerationLog([`🔄 Executando ${MAX_LOCAL_ATTEMPTS} iterações para encontrar a melhor grade base...`]);

      for (let i = 0; i < MAX_LOCAL_ATTEMPTS; i++) {
        // MODO SILENCIOSO para não gerar logs massivos durante iterações
        const tempManager = new ScheduleManager(data, currentLimits, [], true);
        const tempResult = tempManager.generate();

        let totalExpected = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
        let totalAllocated = tempManager.bookedEntries.length;
        let pending = totalExpected - totalAllocated;

        if (pending < minPending) {
          minPending = pending;
          result = tempResult;
          bestManager = tempManager;

          // Se achou grade perfeita, para imediatamente
          if (pending === 0) {
            // Recriar o manager final COM log para mostrar os detalhes da solução
            const finalManager = new ScheduleManager(data, currentLimits, [], false);
            result = finalManager.generate();
            bestManager = finalManager;
            bestManager.logMessage(`✨ Grade perfeita encontrada na iteração ${i + 1}!`);
            break;
          }
        }

        // Feedback visual a cada 50 iterações para não travar UI
        if (i % 50 === 0) {
          // setGenerationLog(prev => [...prev, `Iteração ${i}... Melhor até agora: ${minPending} pendentes`]);
          // (Opcional, pode poluir o log. Deixamos silencioso ou atualizamos só o manager)
        }
      }

      // Se não encontrou grade perfeita, recriar o bestManager COM log para mostrar detalhes
      if (minPending > 0) {
        manager = new ScheduleManager(data, currentLimits, [], false);
        result = manager.generate();
        manager.logMessage(`🏆 Melhor resultado selecionado: ${minPending} pendências após ${MAX_LOCAL_ATTEMPTS} iterações.`);
      } else {
        manager = bestManager;
      }

      let attempts = 0;
      const MAX_AI_ATTEMPTS = 3;

      // Calcular pendentes final da melhor tentativa
      let totalExpected = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
      let totalAllocated = manager.bookedEntries.length;
      let pendingCount = totalExpected - totalAllocated;

      // Loop de IA se tiver chave
      const apiKey = geminiService.getApiKey();

      // LOG DE DIAGNÓSTICO
      manager.logMessage(`🔍 Diagnóstico IA: Pendentes=${pendingCount} (Esperado:${totalExpected} - Alocado:${totalAllocated}), Chave=${apiKey ? 'DETECTADA' : 'AUSENTE'}`);

      if (pendingCount > 0 && !apiKey) {
        manager.logMessage(`⚠ ${pendingCount} aulas não alocadas. Configure a API Key para correções automáticas.`);
      }

      while (pendingCount > 0 && attempts < MAX_AI_ATTEMPTS && apiKey) {

        // Preparar dados para IA
        const failures = manager.failures;

        manager.logMessage(`🤖 [IA] Tentativa ${attempts + 1}: Analisando ${failures.length} bloqueios...`);
        setGenerationLog([...manager.log]); // Force update

        // Consulta Gemini
        try {
          const suggestion = await geminiService.analyzeAndFix(
            failures,
            result.conflicts,
            currentLimits
          );

          if (!suggestion) {
            manager.logMessage(`🤖 [IA] Erro: Sem resposta da API. Verifique sua chave ou cota.`);
            break;
          }

          if (!suggestion.suggestedLimits) {
            manager.logMessage(`🤖 [IA] Resposta da API não incluiu sugestões válidas.`);
            break;
          }

          // Aplica sugestões
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

          // Lógica de Priorização (Prioridade Focus - Novo recurso)
          if (suggestion.priorityFocus && Array.isArray(suggestion.priorityFocus) && suggestion.priorityFocus.length > 0) {
            manager.logMessage(`  -> 🎯 IA definiu prioridade absoluta para: ${suggestion.priorityFocus.length} itens.`);
            // A prioridade muda o comportamento, então conta como mudança
            changed = true;
          }

          if (!changed) {
            manager.logMessage(`  -> IA sugeriu limites que já estão em vigor. Parando para evitar loop.`);
            break;
          }

          // Re-gera com novos limites e prioridades
          const oldLog = manager.log;
          // Agora passamos a lista de prioridades para o construtor
          manager = new ScheduleManager(data, currentLimits, suggestion.priorityFocus || []);
          manager.log = oldLog; // Mantém histórico
          manager.logMessage(`🔄 Re-gerando grade com novos parâmetros...`);

          result = manager.generate();

          // Recalcular pendentes
          totalExpected = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
          totalAllocated = manager.bookedEntries.length;
          pendingCount = totalExpected - totalAllocated;

          attempts++;

        } catch (err) {
          manager.logMessage(`🤖 [IA] Exceção ao consultar API: ${err.message}`);
          break;
        }
      }

      // Finaliza
      setData(prev => ({ ...prev, schedule: result.schedule, scheduleConflicts: result.conflicts }));

      // Reordena log: Erros e Diagnósticos de IA primeiro. Oculta mensagens de sucesso/info.
      const important = result.log.filter(msg =>
        msg.includes('⚠') ||
        msg.includes('❌') ||
        msg.includes('🤖') ||
        msg.includes('💡') ||
        msg.includes('🔍') ||
        msg.includes('✅') || // Manter conclusões de sucesso ("Todas as pendências resolvidas")
        msg.includes('✨')
      );

      // Filtrar mensagens de alocação bem sucedida individual ("Alocada aula...") para limpar a visão
      // const others = result.log.filter(...) -> REMOVIDO para atender pedido "apenas problemas"

      const finalLog = important;

      setGenerationLog(finalLog);

    } catch (error) {
      console.error("Erro fatal na geração:", error);
      setGenerationLog(['❌ Erro crítico no sistema: ' + error.message]);
    } finally {
      setGenerating(false);
    }
  }, 100);
}
