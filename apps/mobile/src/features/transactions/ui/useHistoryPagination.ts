import { useCallback, useEffect, useRef, useState } from 'react';
import { HistoryQueryError } from '../domain/errors';
import {
  DEFAULT_HISTORY_PAGE_SIZE,
  HistoryFilters,
  HistoryItem,
  HistoryTotals,
} from '../domain/history';
import { transactionsRepository } from '../data/transactions.repository';

/** Estado completo de la consulta paginada del historial. */
export interface HistoryPagination {
  items: HistoryItem[];
  totals: HistoryTotals;
  /** Total de movimientos que cumplen los filtros (no solo los cargados). */
  total: number;
  hasMore: boolean;
  /** Carga inicial o recarga por cambio de filtros. */
  loading: boolean;
  /** Carga de la siguiente página (scroll infinito). */
  loadingMore: boolean;
  error: string | null;
  /** Re-consulta desde la primera página (pull-to-refresh / volver a la pantalla). */
  reload: () => void;
  /** Anexa la siguiente página usando el cursor keyset. */
  loadMore: () => void;
}

const EMPTY_TOTALS: HistoryTotals = { incomeCents: 0, expenseCents: 0, netCents: 0 };

function describeHistoryError(error: unknown): string {
  if (error instanceof HistoryQueryError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo cargar el historial. Reintenta en un momento.';
}

/**
 * Encapsula la lectura paginada del historial (RF-009): reinicia la consulta
 * cuando cambian los filtros y anexa páginas con el cursor keyset.
 *
 * La base de datos local es síncrona (< 50 ms por página), por lo que el
 * resultado se aplica en un microtask: nunca se hace `setState` durante el
 * render ni en el cuerpo del efecto.
 */
export function useHistoryPagination(
  userId: string,
  filters: HistoryFilters,
  pageSize: number = DEFAULT_HISTORY_PAGE_SIZE
): HistoryPagination {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [totals, setTotals] = useState<HistoryTotals>(EMPTY_TOTALS);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const loadFirstPage = useCallback(() => {
    try {
      const page = transactionsRepository.searchHistory(userId, filters, { limit: pageSize });
      nextCursorRef.current = page.nextCursor;
      setItems(page.items);
      setTotals(page.totals);
      setTotal(page.total);
      setHasMore(page.hasMore);
      setError(null);
    } catch (e) {
      nextCursorRef.current = null;
      setItems([]);
      setTotals(EMPTY_TOTALS);
      setTotal(0);
      setHasMore(false);
      setError(describeHistoryError(e));
    } finally {
      setLoading(false);
    }
  }, [userId, filters, pageSize]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      loadFirstPage();
    });
    return () => {
      cancelled = true;
    };
  }, [loadFirstPage, refreshKey]);

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = transactionsRepository.searchHistory(userId, filters, {
        limit: pageSize,
        cursor,
      });
      nextCursorRef.current = page.nextCursor;
      setItems((previous) => [...previous, ...page.items]);
      setTotals(page.totals);
      setTotal(page.total);
      setHasMore(page.hasMore);
      setError(null);
    } catch (e) {
      setError(describeHistoryError(e));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [userId, filters, pageSize]);

  const reload = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  return {
    items,
    totals,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    reload,
    loadMore,
  };
}
