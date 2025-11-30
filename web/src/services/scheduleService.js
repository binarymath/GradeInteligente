// Serviço de geração de grade.
import ScheduleManager from '../models/ScheduleManager';

/**
 * Gera a grade de forma assíncrona atualizando estados de progresso.
 * @param {Object} data
 * @param {Function} setData
 * @param {Function} setGenerationLog
 * @param {Function} setGenerating
 */
export function generateScheduleAsync(data, setData, setGenerationLog, setGenerating) {
  setGenerating(true);
  setGenerationLog([]);
  setTimeout(() => {
    const manager = new ScheduleManager(data);
    const result = manager.generate();
    setData(prev => ({ ...prev, schedule: result.schedule, scheduleConflicts: result.conflicts }));
    setGenerationLog(result.log);
    setGenerating(false);
  }, 100);
}
