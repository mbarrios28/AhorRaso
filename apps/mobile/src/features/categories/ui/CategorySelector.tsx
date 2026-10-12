import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import { Category } from '../domain/types';
import { categoriesRepository } from '../data/categories.repository';
import { CreateCategoryModal } from './CreateCategoryModal';

export interface CategorySelectorProps {
  selectedId: string | null;
  onSelect: (category: Category) => void;
  type?: 'income' | 'expense';
  userId?: string;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  selectedId,
  onSelect,
  type = 'expense',
  userId = DEV_USER_ID,
}) => {
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const loadCategories = () => {
    try {
      const items = categoriesRepository.getByUser(userId, type);
      setCategoriesList(items);

      // Auto-seleccionar la primera si no hay ninguna seleccionada
      if (!selectedId && items.length > 0) {
        onSelect(items[0]);
      }
    } catch (e) {
      console.error('Error al cargar categorías en selector:', e);
    }
  };

  useEffect(() => {
    loadCategories();
  }, [userId, type]);

  const handleCreated = (newCategory: Category) => {
    loadCategories();
    onSelect(newCategory);
  };

  return (
    <View style={styles.container}>
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
      </ScrollView>

      {/* Modal de Creación In-Flow */}
      <CreateCategoryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreated={handleCreated}
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
