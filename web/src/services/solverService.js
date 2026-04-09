import { DAYS } from '../utils';

function getSolverEndpointCandidates() {
  const configuredBase = import.meta.env.VITE_SOLVER_API_BASE;
  if (configuredBase && typeof configuredBase === 'string') {
    return [`${configuredBase.replace(/\/$/, '')}/api/solver`];
  }

  if (import.meta.env.DEV) {
    // Em DEV, tenta primeiro servidor Python local; fallback para rota relativa com proxy.
    return ['http://localhost:8000/api/solver', '/api/solver'];
  }

  return ['/api/solver'];
}

function buildSubjectByPair(activities = []) {
  const map = new Map();

  for (const activity of activities) {
    if (!activity || !activity.classId || !activity.teacherId || !activity.subjectId) {
      continue;
    }

    const key = `${activity.classId}::${activity.teacherId}`;
    if (!map.has(key)) {
      map.set(key, activity.subjectId);
    }
  }

  return map;
}

function normalizeSchedule(schedule, fallbackActivities = []) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new Error('Resposta do solver em formato inválido.');
  }

  const subjectByPair = buildSubjectByPair(fallbackActivities);
  const normalized = {};

  for (const [key, entry] of Object.entries(schedule)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const parts = key.split('-');
    if (parts.length < 3) {
      continue;
    }

    const slotFromKey = Number.parseInt(parts[parts.length - 1], 10);
    const dayFromKey = parts[parts.length - 2];
    const classIdFromKey = parts.slice(0, parts.length - 2).join('-');

    const classId = entry.classId || classIdFromKey;
    const teacherId = entry.teacherId;
    if (!classId || !teacherId || Number.isNaN(slotFromKey)) {
      continue;
    }

    const dayIdx = Number.isInteger(entry.dayIdx)
      ? entry.dayIdx
      : DAYS.indexOf(dayFromKey);

    const normalizedEntry = {
      ...entry,
      classId,
      teacherId,
      slotIdx: Number.isInteger(entry.slotIdx) ? entry.slotIdx : slotFromKey,
      dayIdx: dayIdx >= 0 ? dayIdx : 0,
      timeKey: entry.timeKey || `${dayFromKey}-${slotFromKey}`
    };

    if (!normalizedEntry.subjectId) {
      normalizedEntry.subjectId = subjectByPair.get(`${classId}::${teacherId}`) || null;
    }

    normalized[key] = normalizedEntry;
  }

  return normalized;
}

function hasSlotInList(slots, slotId, slotIdx) {
  if (!Array.isArray(slots)) return false;
  const slotIdStr = String(slotId);
  const slotIdxStr = String(slotIdx);
  return slots.some((item) => {
    if (item === slotId) return true;
    const asStr = String(item);
    return asStr === slotIdStr || asStr === slotIdxStr;
  });
}

function validateScheduleConsistency(schedule, data = {}) {
  const activities = data?.activities || [];
  const classes = data?.classes || [];
  const teachers = data?.teachers || [];
  const timeSlots = data?.timeSlots || [];

  const classById = new Map(classes.map((c) => [c.id, c]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  const demand = new Map();
  for (const activity of activities) {
    if (!activity?.classId || !activity?.subjectId || !activity?.teacherId) {
      continue;
    }
    const key = `${activity.classId}::${activity.subjectId}::${activity.teacherId}`;
    demand.set(key, (demand.get(key) || 0) + (Number(activity.quantity) || 0));
  }

  const allocated = new Map();
  for (const entry of Object.values(schedule || {})) {
    if (!entry?.classId || !entry?.subjectId || !entry?.teacherId) {
      continue;
    }
    const key = `${entry.classId}::${entry.subjectId}::${entry.teacherId}`;
    allocated.set(key, (allocated.get(key) || 0) + 1);
  }

  const mismatches = [];
  const allDemandKeys = new Set([...demand.keys(), ...allocated.keys()]);
  for (const key of allDemandKeys) {
    const needed = demand.get(key) || 0;
    const got = allocated.get(key) || 0;
    if (got !== needed) mismatches.push({ key, needed, got });
  }

  const teacherByNameAndTime = new Map();
  const invalidSlotEntries = [];

  for (const [key, entry] of Object.entries(schedule || {})) {
    if (!entry?.classId || !entry?.teacherId) continue;

    const classObj = classById.get(entry.classId);
    const slotIdx = Number.isInteger(entry.slotIdx) ? entry.slotIdx : Number.parseInt(key.split('-').at(-1), 10);
    const dayIdx = Number.isInteger(entry.dayIdx)
      ? entry.dayIdx
      : DAYS.indexOf((entry.timeKey || '').split('-')[0]);
    const slotObj = Number.isInteger(slotIdx) && slotIdx >= 0 ? timeSlots[slotIdx] : null;
    const slotId = slotObj?.id ?? String(slotIdx);

    if (!classObj || !Number.isInteger(dayIdx) || !Number.isInteger(slotIdx)) {
      invalidSlotEntries.push(`entrada inválida ${key}`);
      continue;
    }

    let isActive = false;
    if (classObj.activeSlotsByDay && typeof classObj.activeSlotsByDay === 'object' && Object.keys(classObj.activeSlotsByDay).length > 0) {
      const daySlots = classObj.activeSlotsByDay[dayIdx] ?? classObj.activeSlotsByDay[String(dayIdx)];
      isActive = hasSlotInList(daySlots, slotId, slotIdx);
    } else if (Array.isArray(classObj.activeSlots) && classObj.activeSlots.length > 0) {
      isActive = hasSlotInList(classObj.activeSlots, slotId, slotIdx);
    }

    if (!isActive) {
      invalidSlotEntries.push(key);
    }

    const teacherName = String(teacherById.get(entry.teacherId)?.name || entry.teacherId).trim().toLowerCase();
    const timeKey = `${dayIdx}-${slotIdx}`;
    const conflictKey = `${teacherName}::${timeKey}`;
    if (!teacherByNameAndTime.has(conflictKey)) {
      teacherByNameAndTime.set(conflictKey, []);
    }
    teacherByNameAndTime.get(conflictKey).push(key);
  }

  const teacherNameConflicts = [];
  for (const [conflictKey, keys] of teacherByNameAndTime.entries()) {
    if (keys.length > 1) {
      teacherNameConflicts.push({ key: conflictKey, keys });
    }
  }

  return {
    mismatches,
    teacherNameConflicts,
    invalidSlotEntries
  };
}

export async function generateScheduleWithSolver(data, onLog) {
  const log = typeof onLog === 'function' ? onLog : () => {};
  const endpoints = getSolverEndpointCandidates();

  log('🧠 Preparando dados para o Motor CSP (OR-Tools)...');
  log(`🌐 Endpoints do solver: ${endpoints.join(' | ')}`);

  const payload = {
    classes: data?.classes || [],
    teachers: data?.teachers || [],
    subjects: data?.subjects || [],
    activities: data?.activities || [],
    timeSlots: data?.timeSlots || [],
    days: DAYS
  };

  let response = null;
  let rawText = '';
  let parsed = null;
  let lastError = null;

  for (const endpoint of endpoints) {
    log(`🔎 Tentando endpoint: ${endpoint}`);

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      lastError = `Falha de rede em ${endpoint}`;
      continue;
    }

    rawText = await response.text();
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
      break;
    } catch {
      const snippet = rawText ? rawText.slice(0, 90).replace(/\s+/g, ' ') : 'resposta vazia';
      lastError = `Resposta não-JSON em ${endpoint} (HTTP ${response.status}): ${snippet}`;
      response = null;
      parsed = null;
      continue;
    }
  }

  if (!response || parsed === null) {
    throw new Error(
      `Falha ao contactar o solver. Último erro: ${lastError || 'indisponível'}. ` +
      'Em desenvolvimento, execute `npm run dev:solver` e mantenha `npm run dev` em outro terminal.'
    );
  }

  if (!response.ok) {
    const baseError = parsed?.error || `Falha ao gerar grade (HTTP ${response.status}).`;
    const details = parsed?.details ? ` Detalhes: ${parsed.details}` : '';
    const trace = parsed?.trace ? ` (${parsed.trace})` : '';
    const errorMessage = `${baseError}${details}${trace}`;
    throw new Error(errorMessage);
  }

  const rawSchedule = parsed?.schedule && typeof parsed.schedule === 'object'
    ? parsed.schedule
    : parsed;

  const schedule = normalizeSchedule(rawSchedule, data?.activities || []);

  if (Object.keys(schedule).length === 0) {
    throw new Error('O solver não retornou aulas alocadas.');
  }

  const validation = validateScheduleConsistency(schedule, data || {});
  if (validation.mismatches.length > 0 || validation.teacherNameConflicts.length > 0 || validation.invalidSlotEntries.length > 0) {
    const parts = [];

    if (validation.mismatches.length > 0) {
      const sample = validation.mismatches
        .slice(0, 3)
        .map(item => `${item.key} (${item.got}/${item.needed})`)
        .join('; ');
      parts.push(`matriz curricular: ${sample}`);
    }

    if (validation.teacherNameConflicts.length > 0) {
      const sample = validation.teacherNameConflicts
        .slice(0, 2)
        .map(item => `${item.key} -> ${item.keys.length} aulas`)
        .join('; ');
      parts.push(`conflito professor (nome): ${sample}`);
    }

    if (validation.invalidSlotEntries.length > 0) {
      const sample = validation.invalidSlotEntries.slice(0, 3).join(', ');
      parts.push(`slot inválido: ${sample}`);
    }

    throw new Error(`Solver retornou grade inconsistente (${parts.join(' | ')})`);
  }

  log(`✅ Motor CSP finalizado com ${Object.keys(schedule).length} alocação(ões).`);
  return schedule;
}
