import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { Category, CategoryType } from '../domain/types';
import { categoriesRepository } from '../data/categories.repository';
import { CreateCategoryModal } from './CreateCategoryModal';

export interface CategorySelectorProps {
  selectedId: string | null;
  onSelect: (category: Category) => void;
  type?: CategoryType;
  userId?: string;
  /** Muestra la entrada a la pantalla de administración (RF-005). */
  showManageLink?: boolean;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  selectedId,
  onSelect,
  type = 'expense',
  userId = DEV_USER_ID,
  showManageLink = true,
}) => {
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refs con los valores más recientes para que `loadCategories` sea
  // estable y `useFocusEffect` no se re-ejecute en cada render (bucle).
  // Se actualizan en un efecto (después del render), no durante él.
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    onSelectRef.current = onSelect;
  });

  const loadCategories = useCallback(() => {
    try {
      const items = categoriesRepository.getByUser(userId, type);
      setCategoriesList(items);
      setLoadError(null);

      // Auto-seleccionar la primera si no hay ninguna seleccionada, o si la
      // selección actual ya no existe (ej. fue eliminada en gestión).
      const stillValid = selectedIdRef.current && items.some((c) => c.id === selectedIdRef.current);
      if (!stillValid && items.length > 0) {
        onSelectRef.current(items[0]);
      }
    } catch (e) {
      console.error('Error al cargar categorías en selector:', e);
      setLoadError('No se pudieron cargar las categorías.');
    }
  }, [userId, type]);

  // Se recarga cada vez que la pantalla recupera el foco, para reflejar
  // categorías creadas, editadas o eliminadas en la gestión (RF-005).
  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  const handleSaved = (savedCategory: Category) => {
    loadCategories();
    onSelect(savedCategory);
  };

  return (
    <View style={styles.container}>
      {loadError && (
        <View style={styles.errorBanner}>
          <Icon name="AlertCircle" size={14} color={colors.danger} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <Pressable onPress={loadCategories} accessibilityLabel="Reintentar carga de categorías">
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categoriesList.map((cat) => {
          const isSelected = selectedId === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() => onSelect(cat)}
              style={({ pressed }) => [
                styles.categoryCard,
                isSelected && styles.categoryCardSelected,
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: isSelected ? colors.surface3 : colors.surface2 },
                ]}
              >
                <Icon
                  name={cat.icon}
                  size={24}
                  color={isSelected ? cat.color : colors.ink2}
                />
              </View>
              <Text
                style={[
                  styles.categoryName,
                  isSelected && styles.categoryNameSelected,
                ]}
                numberOfLines={1}
              >
                {cat.name}
              </Text>
            </Pressable>
          );
        })}

        {/* Botón para Añadir Nueva Categoría In-Flow */}
        <Pressable
          onPress={() => setModalVisible(true)}
          style={({ pressed }) => [
            styles.addCard,
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Crear nueva categoría"
        >
          <View style={styles.addIconBox}>
            <Icon name="Plus" size={22} color={colors.ink3} />
          </View>
          <Text style={styles.addLabel}>+ Nueva</Text>
        </Pressable>

        {/* Acceso a la administración completa de categorías (RF-005) */}
        {showManageLink && (
          <Pressable
            onPress={() => router.push('/categories')}
            style={({ pressed }) => [
              styles.addCard,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Gestionar categorías"
          >
            <View style={styles.addIconBox}>
              <Icon name="Settings2" size={20} color={colors.ink3} />
            </View>
            <Text style={styles.addLabel}>Gestionar</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Modal de Creación / Edición In-Flow */}
      <CreateCategoryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSaved={handleSaved}
        type={type}
        userId={userId}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xxs,
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
    marginBottom: spacing.xs,
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.danger,
    flex: 1,
  },
  retryText: {
    ...typography.bodySmall,
    color: colors.ink,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  scrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.gutter,
  },
  categoryCard: {
    width: 76,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  categoryCardSelected: {
    backgroundColor: colors.surface3,
    borderColor: colors.lineFocus,
    borderWidth: 1.5,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.ink3,
    textAlign: 'center',
    maxWidth: 68,
  },
  categoryNameSelected: {
    color: colors.ink,
    fontFamily: typography.bodyMedium.fontFamily,
    fontWeight: '600',
  },
  addCard: {
    width: 76,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  addIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.ink3,
  },
});
