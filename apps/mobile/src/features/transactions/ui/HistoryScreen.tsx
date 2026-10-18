import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { Category, Merchant, Transaction } from '@/core/db';
import { categoriesRepository } from '@/features/categories';
import {
  HistoryFilters,
  HistoryItem,
  countActiveHistoryFilters,
} from '../domain/history';
import { transactionsRepository } from '../data/transactions.repository';
import { EditTransactionCategoryModal } from './EditTransactionCategoryModal';
import { HistoryFiltersModal } from './HistoryFiltersModal';
import { useHistoryPagination } from './useHistoryPagination';

type TypeFilter = 'all' | 'income' | 'expense';

const TYPE_TABS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'income', label: 'Ingresos' },
  { id: 'expense', label: 'Gastos' },
];

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'set',
  'oct',
  'nov',
  'dic',
];

function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

/**
 * Formatea "YYYY-MM-DD" como "DD mmm YYYY" sin depender de Intl (Hermes puede
 * no incluir los datos regionales completos en todas las configuraciones).
 */
function formatDateLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;

  const [, year, month, day] = match;
  const monthLabel = MONTHS_ES[Number(month) - 1] ?? month;
  return `${day} ${monthLabel} ${year}`;
}

export interface HistoryScreenProps {
  userId?: string;
}

/**
 * Historial de movimientos (RF-009 / HU-05).
 *
 * Lista los ingresos y gastos de forma cronológica con filtros combinables
 * (texto libre, tipo, rango de fechas, categoría, establecimiento y montos) y
 * paginación incremental (scroll infinito) sobre el repositorio local.
 */
export const HistoryScreen: React.FC<HistoryScreenProps> = ({ userId = DEV_USER_ID }) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [advancedFilters, setAdvancedFilters] = useState<HistoryFilters>({});
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [merchantsList, setMerchantsList] = useState<Merchant[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Debounce del buscador: una consulta por pausa de tecleo, no por tecla.
  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const queryFilters = useMemo<HistoryFilters>(
    () => ({
      ...advancedFilters,
      type: typeFilter === 'all' ? undefined : typeFilter,
      search: searchTerm.trim() ? searchTerm.trim() : undefined,
    }),
    [advancedFilters, typeFilter, searchTerm]
  );

  const { items, totals, total, hasMore, loading, loadingMore, error, reload, loadMore } =
    useHistoryPagination(userId, queryFilters);

  // Catálogos que alimentan los chips de categoría y establecimiento.
  const loadFilterOptions = useCallback(() => {
    try {
      setCategoriesList(categoriesRepository.getByUser(userId));
      setMerchantsList(transactionsRepository.getMerchantOptions(userId));
    } catch (e) {
      console.error('Error al cargar los catálogos del historial:', e);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) loadFilterOptions();
    });
    return () => {
      cancelled = true;
    };
  }, [loadFilterOptions]);

  // Al recuperar el foco (nuevo gasto, cambio de categoría) se refresca la
  // primera página y los catálogos; el primer foco no duplica la carga inicial.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      loadFilterOptions();
      reload();
    }, [loadFilterOptions, reload])
  );

  const clearAllFilters = useCallback(() => {
    setTypeFilter('all');
    setSearchInput('');
    setSearchTerm('');
    setAdvancedFilters({});
  }, []);

  const activeFilterCount = useMemo(
    () => countActiveHistoryFilters(queryFilters),
    [queryFilters]
  );

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];

    if (typeFilter !== 'all') {
      chips.push({
        key: 'type',
        label: typeFilter === 'income' ? 'Ingresos' : 'Gastos',
        onClear: () => setTypeFilter('all'),
      });
    }

    if (searchTerm.trim()) {
      chips.push({
        key: 'search',
        label: `«${searchTerm.trim()}»`,
        onClear: () => {
          setSearchInput('');
          setSearchTerm('');
        },
      });
    }

    if (advancedFilters.from || advancedFilters.to) {
      chips.push({
        key: 'range',
        label: `${advancedFilters.from ?? 'inicio'} → ${advancedFilters.to ?? 'hoy'}`,
        onClear: () => setAdvancedFilters((prev) => ({ ...prev, from: undefined, to: undefined })),
      });
    }

    if (advancedFilters.categoryId) {
      const category = categoriesList.find((item) => item.id === advancedFilters.categoryId);
      chips.push({
        key: 'category',
        label: category?.name ?? 'Categoría',
        onClear: () => setAdvancedFilters((prev) => ({ ...prev, categoryId: undefined })),
      });
    }

    if (advancedFilters.merchantId) {
      const merchant = merchantsList.find((item) => item.id === advancedFilters.merchantId);
      chips.push({
        key: 'merchant',
        label: merchant?.name ?? 'Establecimiento',
        onClear: () => setAdvancedFilters((prev) => ({ ...prev, merchantId: undefined })),
      });
    }

    if (
      advancedFilters.minAmountCents !== undefined ||
      advancedFilters.maxAmountCents !== undefined
    ) {
      chips.push({
        key: 'amount',
        label: `${formatSoles(advancedFilters.minAmountCents ?? 0)} - ${
          advancedFilters.maxAmountCents !== undefined
            ? formatSoles(advancedFilters.maxAmountCents)
            : 'sin tope'
        }`,
        onClear: () =>
          setAdvancedFilters((prev) => ({
            ...prev,
            minAmountCents: undefined,
            maxAmountCents: undefined,
          })),
      });
    }

    if (advancedFilters.order === 'date_asc') {
      chips.push({
        key: 'order',
        label: 'Más antiguos primero',
        onClear: () => setAdvancedFilters((prev) => ({ ...prev, order: 'date_desc' })),
      });
    }

    return chips;
  }, [advancedFilters, categoriesList, merchantsList, searchTerm, typeFilter]);

  const renderItem = useCallback(
    ({ item }: { item: HistoryItem }) => {
      const isIncome = item.type === 'income';
      const category = item.category;
      const paymentLabel =
        item.paymentMethod === 'cash'
          ? 'Efectivo'
          : item.paymentMethod === 'digital'
            ? 'Yape / Plin'
            : null;

      const detailParts = [item.merchant?.name, item.note || item.source, paymentLabel].filter(
        Boolean
      );

      return (
        <Pressable
          onPress={() => setSelectedTx(item)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Movimiento de ${formatSoles(item.amountCents)} del ${item.occurredOn}. Toca para cambiar su categoría.`}
        >
          <View style={styles.iconBox}>
            <Icon
              name={category?.icon || (isIncome ? 'Coins' : 'Tag')}
              size={18}
              color={category?.color || (isIncome ? colors.secondary : colors.primary)}
            />
          </View>

          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {category?.name || (isIncome ? 'Ingreso' : 'Transacción')}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {formatDateLabel(item.occurredOn)}
              {detailParts.length > 0 ? ` · ${detailParts.join(' · ')}` : ''}
            </Text>
          </View>

          <View style={styles.rowRight}>
            <Text style={[styles.rowAmount, isIncome && styles.rowAmountIncome]}>
              {isIncome ? '+ ' : '- '}
              {formatSoles(item.amountCents)}
            </Text>
            <Text style={styles.rowType}>{isIncome ? 'Ingreso' : 'Gasto'}</Text>
          </View>

          <Icon name="Pencil" size={13} color={colors.ink3} />
        </Pressable>
      );
    },
    []
  );

  const listHeader = (
    <View style={styles.listHeader}>
      {/* Totales del conjunto filtrado */}
      <View style={styles.totalsCard}>
        <View style={styles.totalColumn}>
          <Text style={styles.totalLabel}>INGRESOS</Text>
          <Text style={[styles.totalValue, { color: colors.secondary }]}>
            {formatSoles(totals.incomeCents)}
          </Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalColumn}>
          <Text style={styles.totalLabel}>EGRESOS</Text>
          <Text style={[styles.totalValue, { color: colors.tertiary }]}>
            {formatSoles(totals.expenseCents)}
          </Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalColumn}>
          <Text style={styles.totalLabel}>NETO</Text>
          <Text style={styles.totalValue}>{formatSoles(totals.netCents)}</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {activeFilterCount > 0 ? 'RESULTADOS FILTRADOS' : 'TODAS LAS TRANSACCIONES'}
        </Text>
        <Text style={styles.countText}>
          {items.length} de {total} registros
        </Text>
      </View>

      {/* Chips de filtros activos */}
      {activeChips.length > 0 && (
        <View style={styles.chipsRow}>
          {activeChips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={chip.onClear}
              style={styles.activeChip}
              accessibilityRole="button"
              accessibilityLabel={`Quitar filtro ${chip.label}`}
            >
              <Text style={styles.activeChipText} numberOfLines={1}>
                {chip.label}
              </Text>
              <Icon name="X" size={12} color={colors.ink2} />
            </Pressable>
          ))}
          <Pressable
            onPress={clearAllFilters}
            style={styles.clearChip}
            accessibilityRole="button"
            accessibilityLabel="Limpiar todos los filtros"
          >
            <Text style={styles.clearChipText}>Limpiar todo</Text>
          </Pressable>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Icon name="AlertCircle" size={16} color={colors.danger} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}
    </View>
  );

  const listEmpty = loading ? (
    <View style={styles.centerContent}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.emptySubtitle}>Cargando movimientos…</Text>
    </View>
  ) : (
    <View style={styles.emptyContainer}>
      <View style={styles.iconCircle}>
        <Icon name="ReceiptText" size={28} color={colors.ink3} />
      </View>
      <Text style={styles.emptyTitle}>
        {activeFilterCount > 0 ? 'Sin resultados con estos filtros' : 'Sin movimientos aún'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeFilterCount > 0
          ? 'Prueba con otro rango de fechas, categoría o establecimiento.'
          : 'Los gastos e ingresos que registres aparecerán aquí para auditar tus saldos.'}
      </Text>
      {activeFilterCount > 0 && (
        <Pressable onPress={clearAllFilters} style={styles.emptyBtn} accessibilityRole="button">
          <Icon name="RotateCcw" size={14} color={colors.ink} />
          <Text style={styles.emptyBtnText}>Limpiar filtros</Text>
        </Pressable>
      )}
    </View>
  );

  const listFooter = (
    <View style={styles.footer}>
      {loadingMore && <ActivityIndicator size="small" color={colors.primary} />}
      {!loadingMore && hasMore && (
        <Pressable
          onPress={loadMore}
          style={styles.loadMoreBtn}
          accessibilityRole="button"
          accessibilityLabel="Cargar más movimientos"
        >
          <Icon name="ChevronDown" size={16} color={colors.ink2} />
          <Text style={styles.loadMoreText}>Cargar más</Text>
        </Pressable>
      )}
      {!loading && !hasMore && items.length > 0 && (
        <Text style={styles.endText}>Fin del historial · {total} movimientos</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header fijo */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Historial</Text>
        <Pressable
          onPress={() => setFiltersVisible(true)}
          style={styles.filterBtn}
          accessibilityRole="button"
          accessibilityLabel="Abrir filtros del historial"
        >
          <Icon name="SlidersHorizontal" size={18} color={colors.ink} />
          <Text style={styles.filterBtnText}>Filtros</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Buscador + tipo */}
      <View style={styles.controls}>
        <View style={styles.searchContainer}>
          <Icon name="Search" size={18} color={colors.ink3} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Buscar por comercio, nota o fuente"
            placeholderTextColor={colors.ink3}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Buscar en el historial"
          />
          {searchInput.length > 0 && (
            <Pressable
              onPress={() => setSearchInput('')}
              accessibilityRole="button"
              accessibilityLabel="Limpiar búsqueda"
            >
              <Icon name="X" size={16} color={colors.ink3} />
            </Pressable>
          )}
        </View>

        <View style={styles.segmentedControl}>
          {TYPE_TABS.map((tab) => {
            const isSelected = typeFilter === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setTypeFilter(tab.id)}
                style={[styles.segmentTab, isSelected && styles.segmentTabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Filtrar por ${tab.label}`}
              >
                <Text style={[styles.segmentText, isSelected && styles.segmentTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Lista con scroll infinito */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Filtros avanzados */}
      <HistoryFiltersModal
        visible={filtersVisible}
        filters={advancedFilters}
        categories={categoriesList}
        merchants={merchantsList}
        onApply={(next) => setAdvancedFilters(next)}
        onReset={() => setAdvancedFilters({})}
        onClose={() => setFiltersVisible(false)}
      />

      {/* Cambio de categoría (RF-004) */}
      <EditTransactionCategoryModal
        visible={selectedTx !== null}
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onSaved={() => {
          loadFilterOptions();
          reload();
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    ...typography.titleLarge,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterBtnText: {
    ...typography.labelMedium,
    color: colors.ink,
    fontSize: 12,
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 10,
    color: '#0D0D0F',
  },
  controls: {
    paddingHorizontal: spacing.gutter,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 14,
    padding: 0,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 3,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    ...typography.bodyMedium,
    color: colors.ink3,
    fontSize: 13,
  },
  segmentTextActive: {
    color: colors.ink,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  listHeader: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  totalsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  totalColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  totalDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.line,
  },
  totalLabel: {
    ...typography.labelSmall,
    fontSize: 9,
    color: colors.ink3,
  },
  totalValue: {
    ...typography.monoMedium,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  countText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 220,
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.lineFocus,
  },
  activeChipText: {
    ...typography.bodySmall,
    color: colors.ink,
    fontSize: 11,
    flexShrink: 1,
  },
  clearChip: {
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearChipText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: colors.danger,
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.danger,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.surface2,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
  },
  rowSub: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowAmount: {
    ...typography.monoMedium,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  rowAmountIncome: {
    color: colors.secondary,
  },
  rowType: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 10,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  emptyTitle: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyBtn: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyBtnText: {
    ...typography.labelMedium,
    color: colors.ink,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.base,
    gap: spacing.sm,
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  loadMoreText: {
    ...typography.labelMedium,
    color: colors.ink2,
  },
  endText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.ink3,
  },
});
