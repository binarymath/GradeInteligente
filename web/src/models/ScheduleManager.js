import { DAYS } from '../utils';
import { computeSlotShift } from '../utils/time';

class ScheduleManager {
  constructor(data) {
    this.data = data;
    this.schedule = {};
    this.log = [];
  }

  logMessage(msg) {
    this.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  generate() {
    this.logMessage("Iniciando geração de grade...");
    this.schedule = {};

    // Ordenar atividades por prioridade: aulas duplas primeiro, depois por restrições do professor
    const activities = [...this.data.activities].sort((a, b) => {
      // Priorizar aulas duplas
      if (a.doubleLesson && !b.doubleLesson) return -1;
      if (!a.doubleLesson && b.doubleLesson) return 1;

      // Priorizar professores com mais restrições
      const teacherA = this.data.teachers.find(t => t.id === a.teacherId);
      const teacherB = this.data.teachers.find(t => t.id === b.teacherId);
      const constraintsA = teacherA?.unavailable?.length || 0;
      const constraintsB = teacherB?.unavailable?.length || 0;
      return constraintsB - constraintsA;
    });

    this.logMessage(`Ordenadas ${activities.length} atividades por prioridade (aulas duplas e restrições).`);

    // Initialize schedule grid
    const teacherSchedule = {}; // { teacherId: { timeKey: true } }
    const classSchedule = {};   // { classId: { timeKey: true } }

    const timeSlots = this.data.timeSlots;
    const lessonIndices = timeSlots.map((_, i) => i).filter(i => timeSlots[i].type === 'aula');

    const bookedEntries = []; // rastreia para validação de conflitos por intervalo real

    // Helper to check availability
    const isAvailable = (teacherId, classId, subjectId, dayIdx, slotIdx) => {
      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;

      // Check teacher availability (constraints)
      const teacher = this.data.teachers.find(t => t.id === teacherId);
      if (teacher && teacher.unavailable.includes(timeKey)) return false;

      // Check class availability (active slots)
      const cls = this.data.classes.find(c => c.id === classId);
      if (cls && !cls.activeSlots.includes(timeSlots[slotIdx].id)) return false;

      // Check shift compatibility (Safeguard)
      if (cls) {
        const slotShift = computeSlotShift(timeSlots[slotIdx]);
        const classShift = cls.shift;
        let isShiftCompatible = false;

        if (classShift === 'Integral (Manhã e Tarde)') {
          isShiftCompatible = (slotShift === 'Manhã' || slotShift === 'Tarde' || slotShift === 'Integral (Manhã e Tarde)');
        } else if (classShift === 'Integral (Tarde e Noite)') {
          isShiftCompatible = (slotShift === 'Tarde' || slotShift === 'Noite' || slotShift === 'Integral (Tarde e Noite)');
        } else {
          isShiftCompatible = (slotShift === classShift);
        }

        if (!isShiftCompatible) return false;
      }

      // Check subject preferences
      const subject = this.data.subjects.find(s => s.id === subjectId);
      if (subject && subject.unavailable && subject.unavailable.includes(timeKey)) return false;

      // Check if already booked
      if (teacherSchedule[teacherId]?.[timeKey]) return false;
      if (classSchedule[classId]?.[timeKey]) return false;

      // (Removido limite rígido de aulas por dia para permitir flexibilidade)

      // Limite de 2 aulas da mesma matéria por dia NA MESMA TURMA
      const sameSubjectInClassOnDay = bookedEntries.filter(e =>
        e.classId === classId &&
        e.dayIdx === dayIdx &&
        e.subjectId === subjectId
      ).length;
      if (sameSubjectInClassOnDay >= 2) return false; // Máximo 2 aulas da mesma matéria na mesma turma

      // Limite de 3 aulas TOTAIS do professor NA MESMA TURMA por dia
      const teacherLessonsInClassOnDay = bookedEntries.filter(e =>
        e.teacherId === teacherId &&
        e.classId === classId &&
        e.dayIdx === dayIdx
      ).length;
      if (teacherLessonsInClassOnDay >= 3) return false; // Máximo 3 aulas do professor na mesma turma no dia

      return true;
    };

    // Calcular quantas aulas um professor já tem em um dia
    const getTeacherLessonsOnDay = (teacherId, dayIdx) => {
      return bookedEntries.filter(e => e.teacherId === teacherId && e.dayIdx === dayIdx).length;
    };

    // Helper para verificar se dois slots são consecutivos
    const areConsecutive = (slotIdx1, slotIdx2) => {
      return Math.abs(slotIdx1 - slotIdx2) === 1 &&
        timeSlots[slotIdx1].type === 'aula' &&
        timeSlots[slotIdx2].type === 'aula';
    };

    // Calcular score de preferência para um slot
    const getPreferenceScore = (teacherId, subjectId, dayIdx, slotIdx) => {
      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      let score = 0;

      // Preferência da matéria
      const subject = this.data.subjects.find(s => s.id === subjectId);
      if (subject && subject.preferred && subject.preferred.includes(timeKey)) {
        score += 1000; // Alta preferência (prioridade máxima sobre heurísticas de carga)
      }

      // Penalizar dias com mais aulas do professor (preferência por distribuir melhor)
      const lessonsOnDay = getTeacherLessonsOnDay(teacherId, dayIdx);
      if (lessonsOnDay === 0) {
        score += 5; // Preferir dias sem aulas ainda
      } else if (lessonsOnDay === 1) {
        score += 2; // Ainda aceitável (2 aulas por dia)
      } else if (lessonsOnDay === 2) {
        score -= 5; // Desincentivar 3ª aula (só se necessário)
      }

      return score;
    };

    const book = (activity, dayIdx, slotIdx, isDoubleSecondPart = false) => {
      const timeKey = `${DAYS[dayIdx]}-${slotIdx}`;
      const scheduleKey = `${activity.classId}-${timeKey}`;

      this.schedule[scheduleKey] = {
        subjectId: activity.subjectId,
        teacherId: activity.teacherId,
        classId: activity.classId,
        timeKey,
        isDoubleLesson: isDoubleSecondPart ? false : activity.doubleLesson // marca apenas primeira parte
      };

      if (!teacherSchedule[activity.teacherId]) teacherSchedule[activity.teacherId] = {};
      teacherSchedule[activity.teacherId][timeKey] = true;

      if (!classSchedule[activity.classId]) classSchedule[activity.classId] = {};
      classSchedule[activity.classId][timeKey] = true;

      // Guardar dados detalhados para verificação de sobreposição
      bookedEntries.push({
        teacherId: activity.teacherId,
        classId: activity.classId,
        subjectId: activity.subjectId,
        dayIdx,
        slotIdx,
        start: timeSlots[slotIdx].start,
        end: timeSlots[slotIdx].end
      });
    };

    // Tentar alocar aula dupla (dois slots consecutivos)
    const tryBookDouble = (activity) => {
      const candidates = [];

      // Buscar pares de slots consecutivos disponíveis
      for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
        for (let i = 0; i < lessonIndices.length - 1; i++) {
          const slot1 = lessonIndices[i];
          const slot2 = lessonIndices[i + 1];

          if (areConsecutive(slot1, slot2) &&
            isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slot1) &&
            isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slot2)) {

            // (Removido verificação de limite rígido de 3 aulas)

            const score = getPreferenceScore(activity.teacherId, activity.subjectId, dayIdx, slot1) +
              getPreferenceScore(activity.teacherId, activity.subjectId, dayIdx, slot2);
            candidates.push({ dayIdx, slot1, slot2, score });
          }
        }
      }

      if (candidates.length === 0) return false;

      // Ordenar por score de preferência (maior primeiro)
      candidates.sort((a, b) => b.score - a.score);

      // Usar o melhor candidato
      const best = candidates[0];
      book(activity, best.dayIdx, best.slot1, false);
      book(activity, best.dayIdx, best.slot2, true);
      return true;
    };

    // Tentar alocar aula simples
    const tryBookSingle = (activity) => {
      const candidates = [];

      for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
        for (const slotIdx of lessonIndices) {
          if (isAvailable(activity.teacherId, activity.classId, activity.subjectId, dayIdx, slotIdx)) {
            const score = getPreferenceScore(activity.teacherId, activity.subjectId, dayIdx, slotIdx);
            candidates.push({ dayIdx, slotIdx, score });
          }
        }
      }

      if (candidates.length === 0) return false;

      // Escolher slot com melhor score ou aleatório entre os de mesmo score
      candidates.sort((a, b) => b.score - a.score);
      const maxScore = candidates[0].score;
      const topCandidates = candidates.filter(c => c.score === maxScore);
      const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)];

      book(activity, chosen.dayIdx, chosen.slotIdx);
      return true;
    };

    // Try to schedule each activity
    for (const activity of activities) {
      let remaining = activity.quantity;
      const activityName = this.data.subjects.find(s => s.id === activity.subjectId)?.name || activity.subjectId;
      const className = this.data.classes.find(c => c.id === activity.classId)?.name || activity.classId;

      this.logMessage(`Alocando ${activity.quantity} aulas de ${activityName} para ${className}${activity.doubleLesson ? ' (duplas)' : ''}...`);

      let attempts = 0;
      const maxAttempts = 100;

      while (remaining > 0 && attempts < maxAttempts) {
        attempts++;

        // Se for aula dupla, tentar alocar 2 slots consecutivos
        if (activity.doubleLesson && remaining >= 2) {
          if (tryBookDouble(activity)) {
            remaining -= 2;
            this.logMessage(`  ✓ Alocada aula dupla (${remaining} restantes)`);
          }
        }
        // Tentar alocar aula simples
        else if (remaining > 0) {
          if (tryBookSingle(activity)) {
            remaining--;
            if (remaining > 0) {
              this.logMessage(`  ✓ Alocada aula simples (${remaining} restantes)`);
            }
          }
        }

        // Se não conseguiu alocar, sair do loop
        if (attempts > 10 && remaining === activity.quantity) {
          break; // Nenhum progresso após 10 tentativas
        }
      }

      if (remaining > 0) {
        this.logMessage(`  ⚠ Não foi possível alocar ${remaining} de ${activity.quantity} aulas de ${activityName} para ${className}.`);
      } else {
        this.logMessage(`  ✓ Todas as ${activity.quantity} aulas alocadas com sucesso!`);
      }
    }

    // Validação de conflitos: professor em duas turmas simultâneas (sobreposição real de horários no mesmo dia)
    const conflicts = [];
    const byTeacherDay = {};
    for (const entry of bookedEntries) {
      const key = `${entry.teacherId}-${entry.dayIdx}`;
      if (!byTeacherDay[key]) byTeacherDay[key] = [];
      byTeacherDay[key].push(entry);
    }
    for (const key in byTeacherDay) {
      const sessions = byTeacherDay[key];
      sessions.sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
          const A = sessions[i];
          const B = sessions[j];
          if (A.classId === B.classId) continue;
          if (A.end <= B.start) break;
          // Calcular sobreposição real
          const overlapStart = A.start > B.start ? A.start : B.start;
          const overlapEnd = A.end < B.end ? A.end : B.end;
          const toMinutes = t => parseInt(t.split(':')[0], 10) * 60 + parseInt(t.split(':')[1], 10);
          const overlapDur = Math.max(0, toMinutes(overlapEnd) - toMinutes(overlapStart));
          const dayIdx = A.dayIdx;

          // Capturar subjects se disponíveis no schedule já montado
          const timeKeyA = `${DAYS[dayIdx]}-${A.slotIdx}`;
          const timeKeyB = `${DAYS[dayIdx]}-${B.slotIdx}`;
          const scheduleKeyA = `${A.classId}-${timeKeyA}`;
          const scheduleKeyB = `${B.classId}-${timeKeyB}`;
          const subjAId = this.schedule[scheduleKeyA]?.subjectId;
          const subjBId = this.schedule[scheduleKeyB]?.subjectId;
          const subjectA = this.data.subjects.find(s => s.id === subjAId)?.name || subjAId || 'Matéria';
          const subjectB = this.data.subjects.find(s => s.id === subjBId)?.name || subjBId || 'Matéria';

          const reason = overlapDur > 0
            ? `Sobreposição de ${overlapDur} min (${overlapStart}-${overlapEnd}) entre aulas de ${subjectA} e ${subjectB}.`
            : `Intervalos encostados entre ${A.start}-${A.end} e ${B.start}-${B.end}. Verifique se há margem suficiente.`;

          conflicts.push({
            teacherId: A.teacherId,
            dayIdx,
            classes: [A.classId, B.classId],
            slots: [A.slotIdx, B.slotIdx],
            intervals: [{ start: A.start, end: A.end }, { start: B.start, end: B.end }],
            overlapMinutes: overlapDur,
            reason
          });
        }
      }
    }
    if (conflicts.length > 0) {
      conflicts.forEach(c => {
        this.logMessage(`Conflito: Professor ${c.teacherId} (${c.reason}) Turmas: ${c.classes.join(' & ')} Dia ${c.dayIdx}`);
      });
      this.logMessage(`Total de conflitos detectados: ${conflicts.length}`);
    } else {
      this.logMessage('Nenhum conflito de professor detectado.');
    }

    this.logMessage("Geração concluída.");
    return { schedule: this.schedule, log: this.log, conflicts };
  }
}

export default ScheduleManager;
