import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { Category, CategoryType } from '../domain/types';
import { categoriesRepository } from '../data/categories.repository';
import { CategoryError } from '../domain/errors';
import { CreateCategoryModal } from './CreateCategoryModal';

type ModalState =
  | { visible: false }
  | { visible: true; mode: 'create'; type: CategoryType }
  | { visible: true; mode: 'edit'; category: Category };

/**
 * Pantalla de administración de categorías (RF-005).
 *
 * Permite consultar, crear, editar y eliminar categorías personalizadas.
 * Las categorías por defecto del sistema se muestran como protegidas
 * (no editables, no eliminables). La eliminación se restringe cuando
 * existen movimientos asociados (Alternativa A).
 */
export const CategoriesScreen: React.FC = () => {
  const [expenseCats, setExpenseCats] = useState<Category[]>([]);
  const [incomeCats, setIncomeCats] = useState<Category[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ visible: false });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCategories = useCallback(() => {
    try {
      setLoading(true);
      setExpenseCats(categoriesRepository.getByUser(DEV_USER_ID, 'expense'));
      setIncomeCats(categoriesRepository.getByUser(DEV_USER_ID, 'income'));
      setLoadError(null);
    } catch (e) {
      console.error('Error al cargar categorías (gestión):', e);
      setLoadError('No se pudieron cargar las categorías. Reintentá nuevamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  const handleDelete = (category: Category) => {
    Alert.alert(
      'Eliminar categoría',
      `¿Seguro que quieres eliminar «${category.name}»? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            try {
              categoriesRepository.delete(DEV_USER_ID, category.id);
              loadCategories();
            } catch (e) {
              if (e instanceof CategoryError && e.code === 'IN_USE') {
                // Informa al usuario por qué no puede eliminarse (RF-005.4.3)
                Alert.alert('Categoría en uso', e.message);
              } else if (e instanceof CategoryError) {
                Alert.alert('No se pudo eliminar', e.message);
              } else {
                Alert.alert('No se pudo eliminar', 'Ocurrió un error inesperado. Intenta de nuevo.');
              }
            }
          },
        },
      ]
    );
  };

  const renderCategoryRow = (category: Category) => {
    const isProtected = category.isDefault === 1;
    return (
      <View key={category.id} style={styles.row}>
        <View style={[styles.rowIconBox, { borderColor: colors.line }]}>
          <Icon name={category.icon} size={20} color={category.color} />
        </View>

        <View style={styles.rowInfo}>
          <View style={styles.rowTitleRow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {category.name}
            </Text>
            <View
              style={[
                styles.badge,
                isProtected ? styles.badgeProtected : styles.badgeCustom,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  isProtected ? styles.badgeTextProtected : styles.badgeTextCustom,
                ]}
              >
                {isProtected ? 'Por defecto' : 'Personalizada'}
              </Text>
            </View>
          </View>
          <Text style={styles.rowMeta}>
            {category.type === 'income' ? 'Ingreso' : 'Gasto'} · {category.color}
          </Text>
        </View>

        {!isProtected && (
          <View style={styles.rowActions}>
            <Pressable
              onPress={() => setModalState({ visible: true, mode: 'edit', category })}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={`Editar categoría ${category.name}`}
            >
              <Icon name="Pencil" size={16} color={colors.ink2} />
            </Pressable>
            <Pressable
              onPress={() => handleDelete(category)}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={`Eliminar categoría ${category.name}`}
            >
              <Icon name="Trash2" size={16} color={colors.danger} />
            </Pressable>
          </View>
        )}

        {isProtected && (
          <View style={styles.rowActions}>
            <Icon name="Lock" size={14} color={colors.ink3} />
          </View>
        )}
      </View>
    );
  };

  const renderSection = (title: string, subtitle: string, list: Category[], type: CategoryType) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <Pressable
          onPress={() => setModalState({ visible: true, mode: 'create', type })}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel={`Crear categoría de ${type === 'income' ? 'ingreso' : 'gasto'}`}
        >
          <Icon name="Plus" size={14} color={colors.primary} />
          <Text style={styles.addBtnText}>Nueva</Text>
        </Pressable>
      </View>

      {list.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No hay categorías de {type === 'income' ? 'ingresos' : 'gastos'} todavía.
          </Text>
        </View>
      ) : (
        <View style={styles.listCard}>{list.map(renderCategoryRow)}</View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBtn}
          accessibilityLabel="Volver"
        >
          <Icon name="ArrowLeft" size={22} color={colors.ink2} />
        </Pressable>
        <Text style={styles.headerTitle}>Categorías</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.centerContent}>
          <Icon name="AlertCircle" size={32} color={colors.danger} />
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable onPress={loadCategories} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {renderSection(
            'GASTOS',
            'Categorías disponibles al registrar gastos',
            expenseCats,
            'expense'
          )}
          {renderSection(
            'INGRESOS',
            'Categorías disponibles al registrar ingresos',
            incomeCats,
            'income'
          )}

          {/* Info Box */}
          <View style={styles.infoBox}>
            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeText}>RF-005 · GESTIÓN DE CATEGORÍAS</Text>
            </View>
            <Text style={styles.infoText}>
              Las categorías por defecto son protegidas. Solo puedes editar o eliminar categorías
              personalizadas sin movimientos asociados.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Modal Crear / Editar */}
      <CreateCategoryModal
        visible={modalState.visible}
        onClose={() => setModalState({ visible: false })}
        onSaved={() => loadCategories()}
        type={modalState.visible && modalState.mode === 'create' ? modalState.type : 'expense'}
        editingCategory={modalState.visible && modalState.mode === 'edit' ? modalState.category : null}
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
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  container: {
    padding: spacing.gutter,
    paddingBottom: spacing.xxxl,
    gap: spacing.base,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorText: {
    ...typography.bodyMedium,
    color: colors.ink2,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.base,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    ...typography.labelLarge,
    color: colors.ink,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  addBtnText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
    fontSize: 12,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowTitle: {
    ...typography.bodyMedium,
    color: colors.ink,
    fontWeight: '600',
    flexShrink: 1,
  },
  rowMeta: {
    ...typography.monoSmall,
    color: colors.ink3,
    fontSize: 11,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  badgeProtected: {
    backgroundColor: colors.surface2,
  },
  badgeCustom: {
    backgroundColor: 'rgba(14, 163, 113, 0.15)',
  },
  badgeText: {
    ...typography.monoSmall,
    fontSize: 9,
  },
  badgeTextProtected: {
    color: colors.ink3,
  },
  badgeTextCustom: {
    color: colors.primary,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.ink3,
  },
  infoBox: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.xs,
  },
  infoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  infoBadgeText: {
    ...typography.monoSmall,
    fontSize: 10,
    color: colors.primary,
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.ink2,
    lineHeight: 18,
  },
});
