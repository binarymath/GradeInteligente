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

    this.logMessage("Geração concluída.");
    return { schedule: this.schedule, log: this.log };
  }
}

export default ScheduleManager;
