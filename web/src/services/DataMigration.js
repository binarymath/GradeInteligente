/**
 * DataMigration.js
 * Handles data migrations when loading old saved data
 * Removes legacy synchronous fields and ensures data compatibility
 */

export const migrateData = (data) => {

  if (!data || typeof data !== 'object') {
    console.warn('⚠️ [Migration] Dados vazios ou inválidos recebidos');
    return null;
  }

  // Garante que os campos essenciais existem
  const migrated = {
    timeSlots: data.timeSlots || [],
    teachers: data.teachers || [],
    subjects: data.subjects || [],
    classes: data.classes || [],
    activities: data.activities || [],
    schedule: data.schedule || {},
    scheduleConflicts: data.scheduleConflicts || [],
    ...data
  };


  // Migrate subjects: remove legacy synchronousGroup and preferredTimeSlots
  if (migrated.subjects && Array.isArray(migrated.subjects)) {
    migrated.subjects = migrated.subjects.map((subject, index) => {

      const cleaned = { ...subject };

      // ✅ PRESERVAR isSynchronous se existir
      if (subject.isSynchronous !== undefined) {
        cleaned.isSynchronous = subject.isSynchronous;
      }

      // ✅ PRESERVAR synchronousConfigs se existir
      if (subject.synchronousConfigs && Array.isArray(subject.synchronousConfigs)) {
        cleaned.synchronousConfigs = subject.synchronousConfigs;
      } else if (cleaned.isSynchronous) {
        // Se é síncrona mas não tem configs, cria array vazio
        cleaned.synchronousConfigs = [];
      } else {
      }

      // Remove legacy synchronous fields (mas preserva os novos acima)
      if (cleaned.synchronousGroup) {
        delete cleaned.synchronousGroup;
      }
      if (cleaned.preferredTimeSlots) {
        delete cleaned.preferredTimeSlots;
      }



      return cleaned;
    });
  }

  // Migrate activities: remove legacy preferredTimeSlots if present
  if (migrated.activities && Array.isArray(migrated.activities)) {
    migrated.activities = migrated.activities.map(activity => {
      const cleaned = { ...activity };
      delete cleaned.preferredTimeSlots;
      return cleaned;
    });
  }

  // 🔧 MIGRAÇÃO: Limpar activeSlots legado quando activeSlotsByDay está definido
  // Isso previne conflitos onde o sistema usava activeSlots (todos os dias)
  // mesmo quando activeSlotsByDay (por dia) deveria estar em uso
  if (migrated.classes && Array.isArray(migrated.classes)) {
    migrated.classes = migrated.classes.map(cls => {
      const cleaned = { ...cls };

      // Se tem activeSlotsByDay com dados, limpar activeSlots legado
      if (cleaned.activeSlotsByDay && Object.keys(cleaned.activeSlotsByDay).length > 0) {
        delete cleaned.activeSlots;
      }

      return cleaned;
    });
  }

  const totalSyncSubjects = migrated.subjects?.filter(s => s.isSynchronous)?.length || 0;
  const totalSyncWithConfigs = migrated.subjects?.filter(s => s.isSynchronous && s.synchronousConfigs?.length > 0)?.length || 0;


  return migrated;
};

/**
 * Clean up legacy synchronous data from a subject
 * Used when loading existing subjects to ensure only granular configs are used
 */
export const cleanLegacySync = (subject) => {
  const cleaned = { ...subject };
  delete cleaned.synchronousGroup;
  delete cleaned.preferredTimeSlots;
  return cleaned;
};
