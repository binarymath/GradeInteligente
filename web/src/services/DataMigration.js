/**
 * DataMigration.js
 * Handles data migrations when loading old saved data
 * Removes legacy synchronous fields and ensures data compatibility
 */

export const migrateData = (data) => {
  if (!data || typeof data !== 'object') return null;

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
    migrated.subjects = migrated.subjects.map(subject => {
      const cleaned = { ...subject };
      
      // Remove legacy synchronous fields
      delete cleaned.synchronousGroup;
      delete cleaned.preferredTimeSlots;
      
      // Ensure synchronousConfigs exists for synchronous subjects
      if (cleaned.isSynchronous && !cleaned.synchronousConfigs) {
        cleaned.synchronousConfigs = [];
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
