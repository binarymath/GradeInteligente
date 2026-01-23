/**
 * Serviço de análise de grade
 * Responsabilidade: Análise, diagnóstico e geração de relatórios de agendamento
 */

import { formatSlotLabel, isSlotActive } from './scheduleHelpers';
import { DAYS } from '../utils';

/**
 * Analisa uma grade existente/restaurada
 * Retorna estatísticas, pendências e conflitos
 */
export function analyzeExistingSchedule(data) {
  const log = [];
  const issues = [];

  log.push('');
  log.push('📊 Análise da Grade Restaurada');
  log.push('='.repeat(60));
  log.push('');

  const allocatedCount = new Map();
  const allocatedByTeacher = new Map();
  const invalidEntries = []; // NOVO: Entradas em horários inválidos (Ghost Allocations)
  const schedule = data.schedule || {};

  for (const [key, entry] of Object.entries(schedule)) {
    // 1. Validar se a turma existe
    const classData = data.classes.find(c => c.id === entry.classId);
    if (!classData) continue;

    // 2. Validar se o slot ainda é válido para a turma (Evitar contagem de GHOSTS)
    const slotObj = data.timeSlots[entry.slotIdx];
    const slotId = slotObj ? slotObj.id : String(entry.slotIdx);

    // Extrair dia da key (ex: "turmaId-Segunda-0")
    // A key padrão é `${classId}-${day}-${slotIdx}`? 
    // Vamos olhar como era feito antes. O código original não parseava a key, mas para validar precisamos do dia.
    // A key no ScheduleManager é `${classId}-${DAYS[dayIdx]}-${slotIdx}`
    // entry tem { dayIdx, slotIdx } ? 
    // Em `analyzeExistingSchedule` (linha 26 original), usamos `entry` direto.
    // O `entry` salvo no JSON costuma ter { classId, subjectId, teacherId, timeKey, ... }
    // As vezes não tem dayIdx salvo explicitamente se for grade antiga, mas geralmente tem.
    // Se não tiver, pegamos da timeKey.

    let dayIdx = entry.dayIdx;
    if (dayIdx === undefined && entry.timeKey) {
      const parts = entry.timeKey.split('-'); // "Segunda-0"
      dayIdx = DAYS.indexOf(parts[0]);
    }

    // Se ainda assim indefinido, tenta parsear da key principal do objeto schedule
    if (dayIdx === undefined) {
      // Key format: classId-Day-Slot
      // Mas classId pode ter hifens? Sim.
      // Melhor confiar no entry.dayIdx ou entry.timeKey se possível.
      // Se falhar, consideramos válido para não deletar dados validos por erro de parse.
      // Mas aqui queremos ser RIGOROSOS para corrigir o bug de contagem extra.
    }

    // Se conseguimos identificar o dia, validamos
    if (dayIdx !== undefined && dayIdx >= 0) {
      if (!isSlotActive(classData, dayIdx, slotId)) {
        // É UM GHOST!
        invalidEntries.push({
          ...entry,
          reason: 'Horário inativo para a turma',
          scheduleKey: key
        });
        continue; // NÃO CONTA COMO ALOCADO
      }
    }

    const activityKey = `${entry.classId}-${entry.subjectId}`;
    const count = allocatedCount.get(activityKey) || 0;
    allocatedCount.set(activityKey, count + 1);

    const teacherKey = `${entry.classId}-${entry.subjectId}-${entry.teacherId || 'none'}`;
    const tCount = allocatedByTeacher.get(teacherKey) || 0;
    allocatedByTeacher.set(teacherKey, tCount + 1);
  }

  const expectedByKey = new Map();
  const expectedByTeacher = new Map();
  const teachersByKey = new Map();

  for (const act of (data.activities || [])) {
    const key = `${act.classId}-${act.subjectId}`;
    const qty = parseInt(act.quantity) || 0;
    expectedByKey.set(key, (expectedByKey.get(key) || 0) + qty);
    if (!teachersByKey.has(key)) teachersByKey.set(key, new Set());
    if (act.teacherId) teachersByKey.get(key).add(act.teacherId);

    const teacherKey = `${act.classId}-${act.subjectId}-${act.teacherId || 'none'}`;
    expectedByTeacher.set(teacherKey, (expectedByTeacher.get(teacherKey) || 0) + qty);
  }

  let totalExpected = 0;
  let totalAllocated = 0;
  const pendingActivities = [];
  const overAllocatedTeachers = [];

  for (const [key, expected] of expectedByKey.entries()) {
    const allocated = allocatedCount.get(key) || 0;
    totalExpected += expected;
    totalAllocated += allocated;

    if (allocated < expected) {
      const [classId, subjectId] = key.split('-');
      const subject = data.subjects.find(s => s.id === subjectId);
      const classData = data.classes.find(c => c.id === classId);
      const tSet = teachersByKey.get(key) || new Set();

      let teacherName = 'Sem professor';
      if (tSet.size === 1) {
        const tid = Array.from(tSet)[0];
        teacherName = data.teachers.find(t => t.id === tid)?.name || 'Professor';
      } else if (tSet.size > 1) {
        teacherName = 'Vários professores';
      }

      pendingActivities.push({
        subjectName: subject?.name || 'Desconhecido',
        className: classData?.name || 'Desconhecido',
        teacherName,
        expected,
        allocated,
        missing: expected - allocated
      });
    } else if (allocated > expected) {
      const [classId, subjectId] = key.split('-');
      const subject = data.subjects.find(s => s.id === subjectId);
      const classData = data.classes.find(c => c.id === classId);

      log.push(`   • ${subject?.name || subjectId} - ${classData?.name || classId}`);
      log.push(`     Excesso: ${allocated} alocada(s) para ${expected} esperadas (classe/matéria).`);
      log.push('');

      issues.push({
        type: 'overallocated_subject',
        classId,
        subjectId,
        allocated,
        expected,
        description: `Excesso de aulas em ${classData?.name || classId}: ${allocated}/${expected}`
      });
    }
  }

  for (const [key, allocated] of allocatedByTeacher.entries()) {
    const expected = expectedByTeacher.get(key) || 0;
    if (allocated <= expected) continue;

    if (!key || typeof key !== 'string') continue;
    const parts = key.split('-');
    if (parts.length < 3) continue;
    const [classId, subjectId, teacherId] = parts;
    const subject = data.subjects.find(s => s.id === subjectId);
    const classData = data.classes.find(c => c.id === classId);
    const teacher = data.teachers.find(t => t.id === teacherId);
    const excess = allocated - expected;

    overAllocatedTeachers.push({ classId, subjectId, teacherId, allocated, expected, excess });

    log.push(`   • ${subject?.name || subjectId} - ${classData?.name || classId}`);
    log.push(`     Professor: ${teacher?.name || teacherId}`);
    log.push(`     Excesso: ${allocated} alocada(s) para ${expected} esperadas (professor/turma).`);
    log.push('');

    issues.push({
      type: 'overallocated_teacher',
      classId,
      subjectId,
      teacherId,
      allocated,
      expected,
      description: `Professor ${teacher?.name || teacherId} com excesso de aulas (${allocated}/${expected}) em ${classData?.name || classId}`
    });
  }

  const pendingCount = Math.max(0, totalExpected - totalAllocated);

  log.push(`📈 Total esperado: ${totalExpected} aula(s)`);
  log.push(`✅ Total alocado: ${totalAllocated} aula(s)`);
  log.push(`⏳ Pendências: ${pendingCount} aula(s)`);
  log.push('');

  if (pendingActivities.length > 0) {
    log.push(`⚠️  ${pendingActivities.length} matéria(s) incompleta(s):`);
    log.push('');

    for (const pending of pendingActivities) {
      log.push(`   • ${pending.subjectName} - ${pending.className}`);
      log.push(`     Professor: ${pending.teacherName}`);
      log.push(`     Status: ${pending.allocated} de ${pending.expected} alocada(s) - faltam ${pending.missing}`);
      log.push('');
    }
  }

  if (invalidEntries.length > 0) {
    log.push(`🚫 ${invalidEntries.length} alocação(ões) inválida(s) ignorada(s):`);
    log.push(`   (Estas aulas estão em horários que a turma não atende mais. Elas não contam para o total.)`);
    log.push('');

    // Group by class
    const byClass = {};
    invalidEntries.forEach(e => {
      const clsName = data.classes.find(c => c.id === e.classId)?.name || e.classId;
      if (!byClass[clsName]) byClass[clsName] = [];
      byClass[clsName].push(e);
    });

    for (const [clsName, entries] of Object.entries(byClass)) {
      log.push(`   • Turma ${clsName}:`);
      entries.forEach(e => {
        const subjName = data.subjects.find(s => s.id === e.subjectId)?.name || e.subjectId;
        const label = formatSlotLabel(data.timeSlots, e.dayIdx, e.slotIdx); // e.dayIdx might be valid even if slot is not
        log.push(`     - ${subjName} em ${label} (${e.reason})`);
      });
      log.push('');
    }

    issues.push({
      type: 'invalid_allocations',
      count: invalidEntries.length,
      details: invalidEntries
    });
  }

  // ... (previous code)

  // NOVO: Detecção de horários vagos (buracos na grade)
  const emptySlots = [];

  for (const classData of data.classes) {
    const slots = [];

    // Identifica slots ativos (mesma lógica do smartRepair)
    if (classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
      Object.entries(classData.activeSlotsByDay).forEach(([dayIdxStr, slotIds]) => {
        const dayIdx = parseInt(dayIdxStr);
        if (isNaN(dayIdx)) return;

        slotIds.forEach(slotId => {
          // Encontrar o slot object para pegar o index correto
          const slotObjIdx = data.timeSlots.findIndex(s => s.id === slotId);
          if (slotObjIdx >= 0) {
            slots.push({ dayIdx, slotIdx: slotObjIdx });
          }
        });
      });
    } else if (classData.activeSlots && Array.isArray(classData.activeSlots)) {
      classData.activeSlots.forEach(slotId => {
        const slotObjIdx = data.timeSlots.findIndex(s => s.id === slotId);
        if (slotObjIdx >= 0) {
          // Assumindo que activeSlots global se aplica a todos os dias (legado)? 
          // Ou precisamos iterar pelos dias? Normalmente activeSlots legado era global.
          // Vamos assumir dias úteis padrão (0-4) para compatibilidade se necessário,
          // mas geralmente o sistema novo usa activeSlotsByDay.
          // Se só existir activeSlots, vamos verificar todos os 5 dias padrão.
          for (let d = 0; d < 5; d++) {
            slots.push({ dayIdx: d, slotIdx: slotObjIdx });
          }
        }
      });
    }

    // Verificar cada slot ativo
    for (const slot of slots) {
      const scheduleKey = `${classData.id}-${DAYS[slot.dayIdx]}-${slot.slotIdx}`;
      const hasClass = schedule[scheduleKey];

      if (!hasClass) {
        // Double check: talvez seja uma aula dupla que começou no slot anterior?
        // Mas a chave seria diferente. Se a chave exata não existe, está vazio.
        // CUIDADO: Se for o SEGUNDO horário de uma aula dupla, a chave scheduleKey existe?
        // O ScheduleManager grava AMBOS os slots?
        // Verificando SynchronousScheduler.js: this.schedule[key] = { ... }
        // Verificando smartRepair: ele parece gravar por slot.
        // Vamos assumir que se está alocado, tem entrada no schedule.

        emptySlots.push({
          classId: classData.id,
          className: classData.name,
          dayIdx: slot.dayIdx,
          slotIdx: slot.slotIdx,
          label: formatSlotLabel(data.timeSlots, slot.dayIdx, slot.slotIdx)
        });
      }
    }
  }

  if (emptySlots.length > 0) {
    log.push(`⚠️  ${emptySlots.length} horário(s) vago(s) detectado(s):`);
    log.push('');

    // Agrupar por turma para melhor visualização
    const byClass = {};
    emptySlots.forEach(e => {
      if (!byClass[e.className]) byClass[e.className] = [];
      byClass[e.className].push(e);
    });

    for (const [className, splots] of Object.entries(byClass)) {
      log.push(`   • Turma ${className}:`);
      // Ordenar cronologicamente
      splots.sort((a, b) => {
        if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
        return a.slotIdx - b.slotIdx;
      });

      splots.forEach(s => {
        log.push(`     - ${s.label}`);
      });
      log.push('');
    }

    issues.push({
      type: 'empty_slots',
      count: emptySlots.length,
      details: emptySlots
    });
  }

  const conflicts = detectConflictSummary(data, schedule);

  return {
    log,
    issues,
    pendingCount,
    pendingActivities,
    overAllocatedTeachers,
    conflicts,
    emptySlots // Retornar para uso externo se necessário
  };
}

/**
 * Detecta conflitos de horário na grade
 */
function detectConflictSummary(data, schedule) {
  const conflicts = [];
  const teacherTimeMap = new Map();

  for (const entry of Object.values(schedule || {})) {
    const timeKey = `${entry.dayIdx}-${entry.slotIdx}`;
    if (!teacherTimeMap.has(entry.teacherId)) {
      teacherTimeMap.set(entry.teacherId, new Set());
    }

    const times = teacherTimeMap.get(entry.teacherId);
    if (times.has(timeKey)) {
      conflicts.push({
        teacherId: entry.teacherId,
        timeKey,
        description: `Professor tem múltiplas aulas no mesmo horário`
      });
    }
    times.add(timeKey);
  }

  return conflicts;
}

/**
 * Gera log intuitivo baseado no estado final da grade
 */
export function generateFinalLog(data, manager, overInfo, generationStartTime) {
  const finalLog = [];

  const totalExpectedActivities = data.activities.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
  let totalAllocatedFinal = manager.bookedEntries.length;
  let pendingActivities = Math.max(0, totalExpectedActivities - totalAllocatedFinal);

  if (pendingActivities > 0) {
    finalLog.push(`⏳ Analisando ${totalAllocatedFinal} aula(s) alocada(s) de ${totalExpectedActivities} esperadas...`);
    finalLog.push('');
  } else {
    finalLog.push(`Atividades alocadas: ${totalAllocatedFinal} de ${totalExpectedActivities} esperadas`);
  }

  const realFailures = manager.failures.filter(f => {
    const act = data.activities.find(a => a.id === f.activityId);
    if (!act) return false;
    const bookedCount = manager.bookedEntries.filter(e =>
      e.classId === act.classId && e.subjectId === act.subjectId
    ).length;
    return bookedCount < act.quantity;
  });

  const uniqueFailures = [];
  const seenActivites = new Set();
  for (const f of realFailures) {
    if (!seenActivites.has(f.activityId)) {
      seenActivites.add(f.activityId);
      uniqueFailures.push(f);
    }
  }

  if (uniqueFailures.length === 0 && pendingActivities === 0 && overInfo.totalExcess === 0) {
    finalLog.push('✅ Grade gerada com sucesso! Todas as restrições foram atendidas.');
    finalLog.push('✅ Grade gerada com sucesso! Todas as restrições foram atendidas.');
  } else if (pendingActivities > 0) {
    finalLog.push(`⚠️ Não foi possível alocar ${pendingActivities} aula(s):`);
    finalLog.push('');

    if (uniqueFailures.length === 0) {
      data.activities.forEach(act => {
        const bookedCount = manager.bookedEntries.filter(e =>
          e.classId === act.classId && e.subjectId === act.subjectId
        ).length;

        if (bookedCount < act.quantity) {
          const subj = data.subjects?.find(s => s.id === act.subjectId);
          const cls = data.classes?.find(c => c.id === act.classId);
          const teacher = data.teachers?.find(t => t.id === act.teacherId);

          const sName = subj ? subj.name : 'Matéria desconhecida';
          const cName = cls ? cls.name : 'Turma desconhecida';
          const tName = teacher ? teacher.name : 'Professor desconhecido';
          const missing = act.quantity - bookedCount;

          finalLog.push(`  • ${sName} - ${cName}`);
          finalLog.push(`    Professor: ${tName}`);
          finalLog.push(`    Situação: ${bookedCount} de ${act.quantity} aula(s) alocada(s) - faltam ${missing}`);
          finalLog.push(`    Motivo: não há horários disponíveis que atendam todas as restrições`);
          finalLog.push('');
        }
      });
    } else {
      uniqueFailures.forEach(f => {
        const act = data.activities.find(a => a.id === f.activityId);
        if (act) {
          const subj = data.subjects?.find(s => s.id === act.subjectId);
          const cls = data.classes?.find(c => c.id === act.classId);
          const teacher = data.teachers?.find(t => t.id === act.teacherId);

          const sName = subj ? subj.name : 'Matéria desconhecida';
          const cName = cls ? cls.name : 'Turma desconhecida';
          const tName = teacher ? teacher.name : 'Professor desconhecido';

          const bookedCount = manager.bookedEntries.filter(e =>
            e.classId === act.classId && e.subjectId === act.subjectId
          ).length;
          const missing = act.quantity - bookedCount;

          let reason = '';
          if (f.reason) {
            if (f.reason.includes('Turma Inativa') || f.reason.includes('Bloqueio')) {
              reason = 'turma não disponível neste turno';
            } else if (f.reason.includes('Prof. Ocupado') || f.reason.includes('teacherBusy')) {
              reason = 'professor já ocupado em outros horários';
            } else if (f.reason.includes('Turma Ocupada') || f.reason.includes('classBusy')) {
              reason = 'turma já tem outras aulas nos horários disponíveis';
            } else if (f.reason.includes('No Available Slot')) {
              reason = 'não há horários disponíveis que atendam todas as restrições';
            } else {
              reason = 'conflito de horário';
            }
          } else {
            reason = 'restrições não permitiram alocação';
          }

          finalLog.push(`  • ${sName} - ${cName}`);
          finalLog.push(`    Professor: ${tName}`);
          finalLog.push(`    Situação: ${bookedCount} de ${act.quantity} aula(s) alocada(s) - faltam ${missing}`);
          finalLog.push(`    Motivo: ${reason}`);
          finalLog.push('');
        }
      });
    }

    finalLog.push('');
    finalLog.push('💡 Sugestões para resolver:');
    finalLog.push('');
    finalLog.push('  • Clique em "Gerar Novamente" para tentar uma nova combinação');
    finalLog.push('');
    finalLog.push('  • Verifique se há horários suficientes disponíveis');
    finalLog.push('');
    finalLog.push('  • Revise as restrições dos professores e turnos das turmas');
  }

  if (overInfo.totalExcess > 0) {
    finalLog.push('');
    finalLog.push(`⚠️ Foram encontradas ${overInfo.totalExcess} aula(s) excedentes (acima da quantidade planejada):`);
    overInfo.subjectExcess.forEach(item => {
      const subj = data.subjects.find(s => s.id === item.subjectId);
      const cls = data.classes.find(c => c.id === item.classId);
      finalLog.push(`  • ${subj?.name || item.subjectId} - ${cls?.name || item.classId}: ${item.allocated} alocadas / ${item.expected} esperadas`);
    });
    overInfo.teacherExcess.forEach(item => {
      const subj = data.subjects.find(s => s.id === item.subjectId);
      const cls = data.classes.find(c => c.id === item.classId);
      const tch = data.teachers.find(t => t.id === item.teacherId);
      finalLog.push(`  • ${subj?.name || item.subjectId} - ${cls?.name || item.classId} (Prof. ${tch?.name || item.teacherId}): ${item.allocated} alocadas / ${item.expected} esperadas`);
    });
    finalLog.push('');
    finalLog.push('💡 Ajuste manual ou use "Ajustar"/"Gerar Novamente" para corrigir excessos.');
  }

  return finalLog;
}
