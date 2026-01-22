/**
 * Tipos de domínio do sistema (JSDoc) para melhor autocompletar e clareza.
 */

/** @typedef {Object} TimeSlot
 * @property {string} id
 * @property {string} start HH:MM
 * @property {string} end HH:MM
 * @property {'aula'|'intervalo'|'almoco'|'jantar'} type
 * @property {string} [shift] Turno (Manhã, Tarde, Noite, Integral (Manhã e Tarde), Integral (Tarde e Noite))
 * @property {number[]} [days] Array de dias (0=seg, 1=ter, 2=qua, 3=qui, 4=sex, 5=sab, 6=dom). Se vazio, aplica em todos os dias.
 */

/** @typedef {Object} Teacher
 * @property {string} id
 * @property {string} name
 * @property {string[]} shifts Lista de rótulos de turno (ex: 'Manhã', 'Integral (Manhã e Tarde)')
 * @property {string[]} unavailable Lista de timeKey (ex: '1-3') indisponíveis
 */

/** @typedef {Object} Subject
 * @property {string} id
 * @property {string} name
 * @property {number} colorIndex Índice em paleta
 * @property {string[]} unavailable Lista de timeKey indisponíveis
 * @property {string[]} preferred Lista de timeKey preferenciais
 */

/** @typedef {Object} Class
 * @property {string} id
 * @property {string} name
 * @property {'Manhã'|'Tarde'|'Noite'|'Integral'} shift
 * @property {string[]} activeSlots IDs de TimeSlot ativos para a turma
 * @property {string} [classroomId]
 */

/** @typedef {Object} Classroom
 * @property {string} id
 * @property {string} name
 * @property {number} capacity
 */

/** @typedef {Object} Activity
 * @property {string} id
 * @property {string} teacherId
 * @property {string} subjectId
 * @property {string} classId
 * @property {number} quantity Quantidade de aulas semanais
 * @property {number} split Parte atual se dividido
 * @property {boolean} doubleLesson Indica preferência por bloco duplo
 */

/** @typedef {Object} ScheduleEntry
 * @property {string} classId
 * @property {string} teacherId
 * @property {string} subjectId
 * @property {string} timeKey Formato dayIndex-slotIndex
 */

/** @typedef {Object} CalendarEvent
 * @property {string} id
 * @property {'Ferias'|'Feriado'} type
 * @property {string} title
 * @property {string} start YYYY-MM-DD
 * @property {string} end YYYY-MM-DD
 */

/** @typedef {Object} CalendarSettings
 * @property {string} schoolYearStart
 * @property {string} schoolYearEnd
 * @property {CalendarEvent[]} events
 */

/** @typedef {Object} AppData
 * @property {TimeSlot[]} timeSlots
 * @property {Teacher[]} teachers
 * @property {Subject[]} subjects
 * @property {Class[]} classes
 * @property {Classroom[]} classrooms
 * @property {Activity[]} activities
 * @property {Object.<string,ScheduleEntry>} schedule Mapa chave composto => entrada
 */
