import { DAYS } from '../utils';

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
    
    // Sort activities by difficulty (e.g., double lessons first, or teachers with most constraints)
    // For simplicity, we'll just process them as is, or maybe shuffle to get random results on retry.
    const activities = [...this.data.activities];
    
    // Simple greedy approach with backtracking is complex to implement in one go.
    // We will try a randomized greedy approach for now.
    
    // Initialize schedule grid
    // We need to track teacher and class usage per slot.
    const teacherSchedule = {}; // { teacherId: { timeKey: true } }
    const classSchedule = {};   // { classId: { timeKey: true } }

    const timeSlots = this.data.timeSlots;
    const lessonIndices = timeSlots.map((_, i) => i).filter(i => timeSlots[i].type === 'aula');

    // Helper to check availability
    const isAvailable = (teacherId, classId, dayIdx, slotIdx) => {
      const timeKey = `${dayIdx}-${slotIdx}`;
      
      // Check teacher availability (constraints)
      const teacher = this.data.teachers.find(t => t.id === teacherId);
      if (teacher && teacher.unavailable.includes(timeKey)) return false;

      // Check class availability (active slots)
      const cls = this.data.classes.find(c => c.id === classId);
      if (cls && !cls.activeSlots.includes(timeSlots[slotIdx].id)) return false;

      // Check if already booked
      if (teacherSchedule[teacherId]?.[timeKey]) return false;
      if (classSchedule[classId]?.[timeKey]) return false;

      return true;
    };

    const bookedEntries = []; // rastreia para validação de conflitos por intervalo real

    const book = (activity, dayIdx, slotIdx) => {
      const timeKey = `${dayIdx}-${slotIdx}`;
      const scheduleKey = `${activity.classId}-${timeKey}`;
      
      this.schedule[scheduleKey] = {
        subjectId: activity.subjectId,
        teacherId: activity.teacherId,
        classId: activity.classId,
        timeKey
      };

      if (!teacherSchedule[activity.teacherId]) teacherSchedule[activity.teacherId] = {};
      teacherSchedule[activity.teacherId][timeKey] = true;

      if (!classSchedule[activity.classId]) classSchedule[activity.classId] = {};
      classSchedule[activity.classId][timeKey] = true;

      // Guardar dados detalhados para verificação de sobreposição (considerando possíveis horários customizados)
      bookedEntries.push({
        teacherId: activity.teacherId,
        classId: activity.classId,
        dayIdx,
        slotIdx,
        start: timeSlots[slotIdx].start,
        end: timeSlots[slotIdx].end
      });
    };

    // Try to schedule each activity
    for (const activity of activities) {
      let remaining = activity.quantity;
      let attempts = 0;
      
      while (remaining > 0 && attempts < 1000) {
        attempts++;
        // Pick random day and slot
        const dayIdx = Math.floor(Math.random() * DAYS.length);
        const slotIdx = lessonIndices[Math.floor(Math.random() * lessonIndices.length)];
        
        if (isAvailable(activity.teacherId, activity.classId, dayIdx, slotIdx)) {
          book(activity, dayIdx, slotIdx);
          remaining--;
        }
      }
      
      if (remaining > 0) {
        this.logMessage(`Aviso: Não foi possível alocar ${remaining} aulas de ${activity.subjectId} para a turma ${activity.classId}.`);
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
      sessions.sort((a,b) => a.start.localeCompare(b.start));
      for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
          const A = sessions[i];
          const B = sessions[j];
          if (A.classId === B.classId) continue;
          if (A.end <= B.start) break;
          // Calcular sobreposição real
          const overlapStart = A.start > B.start ? A.start : B.start;
          const overlapEnd = A.end < B.end ? A.end : B.end;
          const toMinutes = t => parseInt(t.split(':')[0],10)*60 + parseInt(t.split(':')[1],10);
          const overlapDur = Math.max(0, toMinutes(overlapEnd) - toMinutes(overlapStart));
          const dayIdx = A.dayIdx;

          // Capturar subjects se disponíveis no schedule já montado
          const timeKeyA = `${dayIdx}-${A.slotIdx}`;
          const timeKeyB = `${dayIdx}-${B.slotIdx}`;
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
            intervals: [ { start: A.start, end: A.end }, { start: B.start, end: B.end } ],
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
