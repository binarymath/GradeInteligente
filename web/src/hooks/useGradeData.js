/**
 * useGradeData.js
 *
 * Custom hook centralizado para gestão de estado e persistência do Grade Inteligente.
 * Utiliza TanStack Query v5 para fetch, cache e sincronização com localStorage.
 *
 * Arquitectura:
 *  - useQuery(['gradeData'])      → "busca" os dados do localStorage (síncrono)
 *  - useMutation updateData       → atualiza qualquer campo de `data`
 *  - useMutation updateCalendar   → atualiza `calendarSettings`
 *
 * API pública exposta (compatível com a API anterior — zero mudanças nos componentes filhos):
 *   { data, setData, calendarSettings, setCalendarSettings, isLoading }
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { migrateData } from '../services/DataMigration';
import { cleanSchedule } from '../services/scheduleHelpers';

// ─── Constantes ─────────────────────────────────────────────────────────────

export const GRADE_DATA_QUERY_KEY = ['gradeData'];
export const CALENDAR_DATA_QUERY_KEY = ['calendarData'];

/** Estado inicial limpo da grade */
const INITIAL_STATE = {
  timeSlots: [],
  teachers: [],
  subjects: [],
  classes: [],
  activities: [],
  schedule: {},
  scheduleConflicts: [],
};

/** Configurações padrão de calendário */
const getInitialCalendar = () => {
  const curYear = new Date().getFullYear();
  return {
    schoolYearStart: `${curYear}-02-01`,
    schoolYearEnd: `${curYear}-12-15`,
    events: [],
  };
};

// ─── Chaves do localStorage legado ──────────────────────────────────────────
const LS_DATA_KEY = 'grade_data';
const LS_CALENDAR_KEY = 'grade_calendar';

// ─── Funções de I/O do localStorage ─────────────────────────────────────────

/**
 * Carrega e migra os dados da grade do localStorage.
 * Suporta:
 *  1. Cache do TanStack Query (CACHE_KEY) — lido automaticamente pelo persister
 *  2. Fallback para chaves legadas ('grade_data', 'grade_calendar')
 *
 * Esta função é o `queryFn` do useQuery. O TanStack a chama na montagem
 * inicial quando o cache do persister está vazio.
 */
function loadGradeDataFromStorage() {
  // ── Carregar dados da grade ──────────────────────────────────────────────
  let gradeData = { ...INITIAL_STATE };

  try {
    const raw = localStorage.getItem(LS_DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Migrar formato legado para o formato atual
        const migrated = migrateData(parsed);
        if (migrated) {
          // Limpar alocações órfãs ao carregar
          if (migrated.schedule) {
            migrated.schedule = cleanSchedule(migrated);
          }
          gradeData = { ...INITIAL_STATE, ...migrated };
        }
      }
    }
  } catch (e) {
    console.warn('[useGradeData] Erro ao carregar grade_data do localStorage:', e);
  }

  // ── Carregar configurações de calendário ─────────────────────────────────
  let calendarData = getInitialCalendar();

  try {
    const raw = localStorage.getItem(LS_CALENDAR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        calendarData = { ...calendarData, ...parsed };
      }
    }
  } catch (e) {
    console.warn('[useGradeData] Erro ao carregar grade_calendar do localStorage:', e);
  }

  return { gradeData, calendarData };
}

/**
 * Persiste os dados da grade no localStorage legado.
 * Isso garante que backups exportados e a migração inversa continuem a funcionar.
 * O TanStack pesister escreve o cache completo na chave 'grade-inteligente-v1'.
 */
function saveToLegacyStorage(gradeData, calendarData) {
  try {
    if (gradeData !== undefined) {
      localStorage.setItem(LS_DATA_KEY, JSON.stringify(gradeData));
    }
    if (calendarData !== undefined) {
      localStorage.setItem(LS_CALENDAR_KEY, JSON.stringify(calendarData));
    }
  } catch (e) {
    console.warn('[useGradeData] Erro ao salvar no localStorage legado:', e);
  }
}

// ─── Custom Hook ─────────────────────────────────────────────────────────────

export function useGradeData() {
  const queryClient = useQueryClient();

  // ── Query: carregar estado completo ────────────────────────────────────────
  const { data: queryResult, isLoading } = useQuery({
    queryKey: GRADE_DATA_QUERY_KEY,
    queryFn: loadGradeDataFromStorage,
    // placeholderData garante que nunca retornamos undefined enquanto carrega
    placeholderData: {
      gradeData: INITIAL_STATE,
      calendarData: getInitialCalendar(),
    },
  });

  // Extrair os dois domínios do resultado único da query
  const data = queryResult?.gradeData ?? INITIAL_STATE;
  const calendarSettings = queryResult?.calendarData ?? getInitialCalendar();

  // ── Mutation: atualizar dados da grade ─────────────────────────────────────
  const { mutate: updateData } = useMutation({
    mutationFn: async (updater) => {
      // Suporte para atualizações funcionais: setData(prev => ...) ou setData({...})
      const currentResult = queryClient.getQueryData(GRADE_DATA_QUERY_KEY);
      const currentData = currentResult?.gradeData ?? INITIAL_STATE;

      const nextData =
        typeof updater === 'function' ? updater(currentData) : updater;

      const nextResult = {
        ...currentResult,
        gradeData: nextData,
      };

      // 1. Atualizar cache do TanStack imediatamente (optimistic update)
      queryClient.setQueryData(GRADE_DATA_QUERY_KEY, nextResult);

      // 2. Persistir no localStorage legado (para compatibilidade de backup)
      saveToLegacyStorage(nextData, undefined);

      return nextResult;
    },
  });

  // ── Mutation: atualizar configurações de calendário ───────────────────────
  const { mutate: updateCalendar } = useMutation({
    mutationFn: async (updater) => {
      const currentResult = queryClient.getQueryData(GRADE_DATA_QUERY_KEY);
      const currentCalendar = currentResult?.calendarData ?? getInitialCalendar();

      const nextCalendar =
        typeof updater === 'function' ? updater(currentCalendar) : updater;

      const nextResult = {
        ...currentResult,
        calendarData: nextCalendar,
      };

      // 1. Atualizar cache imediatamente
      queryClient.setQueryData(GRADE_DATA_QUERY_KEY, nextResult);

      // 2. Persistir no localStorage legado
      saveToLegacyStorage(undefined, nextCalendar);

      return nextResult;
    },
  });

  // ── API pública compatível com a API anterior ─────────────────────────────
  /**
   * setData — compatível com useState setter.
   * Aceita valor direto ou função updater: setData(prev => ({ ...prev, teachers: [...] }))
   */
  const setData = (updater) => updateData(updater);

  /**
   * setCalendarSettings — compatível com useState setter.
   * Aceita valor direto ou função updater.
   */
  const setCalendarSettings = (updater) => updateCalendar(updater);

  return {
    data,
    setData,
    calendarSettings,
    setCalendarSettings,
    isLoading,
  };
}
