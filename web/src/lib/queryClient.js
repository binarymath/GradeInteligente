/**
 * queryClient.js
 *
 * Configura o QueryClient do TanStack Query v5 com persistência
 * automática no localStorage via persistQueryClient.
 *
 * Estratégia:
 *  - staleTime: Infinity  → dados nunca ficam stale por tempo; só por mutação explícita
 *  - gcTime: Infinity     → cache nunca é coletado em memória enquanto o app estiver aberto
 *  - O persister sincroniza o cache com localStorage após cada mutação/query
 *  - Chave de cache: 'grade-inteligente-v1' (separada das chaves legadas)
 */

import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// ─── Constantes ────────────────────────────────────────────────────────────
export const CACHE_KEY = 'grade-inteligente-v1';

/**
 * O QueryClient central da aplicação.
 * Exportado para uso direto em mutações fora de componentes (ex: scheduleService).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados nunca ficam stale automaticamente — invalidação explícita via mutação
      staleTime: Infinity,
      // Cache mantido em memória enquanto o app estiver aberto
      gcTime: Infinity,
      // Não refetcha em nenhum evento de janela/foco — dados são locais
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      // Não faz retry em caso de "erro" no queryFn (ex: localStorage vazio)
      retry: false,
    },
  },
});

// ─── Persister de localStorage ─────────────────────────────────────────────
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: CACHE_KEY,
  // Throttle de 300ms para evitar escritas excessivas durante mutações rápidas
  throttleTime: 300,
});

// ─── Ativar persistência ───────────────────────────────────────────────────
persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  // Cache com mais de 7 dias é descartado (evita dados corrompidos muito antigos)
  maxAge: 1000 * 60 * 60 * 24 * 7,
  // Não serializar queries que estejam em estado de error
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status !== 'error',
  },
});
