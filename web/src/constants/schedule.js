/**
 * Constantes de configuração para o algoritmo de agendamento.
 * Centraliza "magic numbers" para facilitar ajustes finos.
 */

// Pesos para cálculo de score (preferência de slot)
export const SCORING = {
    PREFERRED_SUBJECT: 1000, // Matéria preferida no horário: prioridade máxima
    EMPTY_DAY: 5,            // Dia sem aulas: bom para começar distribuir
    ONE_LESSON: 2,           // Dia com 1 aula: aceitável
    TWO_LESSONS: -5,         // Dia com 2 aulas: evitar 3ª aula para não sobrecarregar
};

// Limites do algoritmo
export const LIMITS = {
    MAX_ATTEMPTS_PER_ACTIVITY: 100, // Tentativas totais por atividade antes de desistir
    EMERGENCY_STOP_THRESHOLD: 10,   // Parar se não houver progresso após X tentativas finais
    MAX_SAME_SUBJECT_PER_DAY: 2,    // Máx aulas da mesma matéria por turma/dia
    MAX_TEACHER_LOGGED_PER_DAY: 3,  // Máx aulas do mesmo professor na mesma turma/dia
};
