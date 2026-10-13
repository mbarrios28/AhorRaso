import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, typography } from '@/core/theme';
import { Icon } from '@/core/ui';
import { DEV_USER_ID } from '@/core/dev/constants';
import {
  suggestCategoryIcon,
  CURATED_ICONS,
  CURATED_COLORS,
} from '../domain/icon-suggestions';
import { categoriesRepository } from '../data/categories.repository';
import { Category, CATEGORY_NAME_MAX_LENGTH } from '../domain/types';
import { CategoryError } from '../domain/errors';

interface CreateCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  /** Se invoca tras crear O actualizar exitosamente la categoría. */
  onSaved: (category: Category) => void;
  type?: 'income' | 'expense';
  userId?: string;
  /** Si se pasa una categoría, el modal entra en modo EDICIÓN (RF-005). */
  editingCategory?: Category | null;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  visible,
  onClose,
  onSaved,
  type = 'expense',
  userId = DEV_USER_ID,
  editingCategory = null,
}) => {
  // El formulario se monta solo mientras el modal está visible: cada apertura
  // lo remonta con estado inicial fresco (nombre/icono/color del modo edición
  // o vacíos en modo creación) sin necesidad de efectos de reset.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {visible ? (
        <CreateCategoryForm
          onClose={onClose}
          onSaved={onSaved}
          type={type}
          userId={userId}
          editingCategory={editingCategory}
        />
      ) : null}
    </Modal>
  );
};

interface CreateCategoryFormProps
  extends Omit<CreateCategoryModalProps, 'visible'> {
  editingCategory: Category | null;
}

const CreateCategoryForm: React.FC<CreateCategoryFormProps> = ({
  onClose,
  onSaved,
  type = 'expense',
  userId = DEV_USER_ID,
  editingCategory = null,
}) => {
  const isEditMode = !!editingCategory;

  const [name, setName] = useState(editingCategory?.name ?? '');
  const [icon, setIcon] = useState(editingCategory?.icon ?? 'Utensils');
  const [color, setColor] = useState<string>(editingCategory?.color ?? CURATED_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleNameChange = (text: string) => {
    setName(text);
    setError(null);
    if (!isEditMode) {
      const suggested = suggestCategoryIcon(text);
      if (suggested !== 'Tag') {
        setIcon(suggested);
      }
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      setError('Escribe un nombre para la categoría');
      return;
    }

    setSaving(true);
    try {
      const saved = isEditMode
        ? categoriesRepository.update(userId, editingCategory.id, {
            name: name.trim(),
            type: editingCategory.type,
            icon,
            color,
          })
        : categoriesRepository.create(userId, {
            name: name.trim(),
            type,
            icon,
            color,
          });

      // Limpiar y notificar
      setName('');
      setError(null);
      onSaved(saved);
      onClose();
    } catch (e) {
      // Los errores de dominio ya traen mensajes comprensibles; los de Zod
      // se convierten en CategoryError('VALIDATION') dentro del repositorio.
      setError(
        e instanceof CategoryError
          ? e.message
          : e instanceof Error && e.message
            ? e.message
            : 'Error al guardar la categoría'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.overlay}
    >
      <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {isEditMode ? 'Editar categoría' : 'Nueva categoría'}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="X" size={20} color={colors.ink2} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Preview Dinámico */}
            <View style={styles.previewContainer}>
              <View style={[styles.previewIconBox, { backgroundColor: colors.surface2, borderColor: color }]}>
                <Icon name={icon} size={28} color={color} />
              </View>
              <Text style={styles.previewName}>{name.trim() || 'Nombre categoría'}</Text>
            </View>

            {/* Input de Nombre */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>NOMBRE</Text>
              <TextInput
                value={name}
                onChangeText={handleNameChange}
                placeholder="Ej. Fotocopias, Combi, Tacos..."
                placeholderTextColor={colors.ink3}
                style={[styles.input, error ? styles.inputError : null]}
                autoFocus={!isEditMode}
                maxLength={CATEGORY_NAME_MAX_LENGTH}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            {/* Selector de Icono */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>ICONO</Text>
                {!isEditMode && <Text style={styles.suggestionHint}>Sugerido por palabra clave</Text>}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconScroll}>
                {CURATED_ICONS.map((iconName) => {
                  const isSelected = icon === iconName;
                  return (
                    <Pressable
                      key={iconName}
                      onPress={() => setIcon(iconName)}
                      style={[
                        styles.iconChip,
                        isSelected && { borderColor: color, backgroundColor: colors.surface3 },
                      ]}
                    >
                      <Icon name={iconName} size={20} color={isSelected ? color : colors.ink2} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Selector de Color */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>COLOR</Text>
              <View style={styles.colorPalette}>
                {CURATED_COLORS.map((hex) => {
                  const isSelected = color === hex;
                  return (
                    <Pressable
                      key={hex}
                      onPress={() => setColor(hex)}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: hex },
                        isSelected && styles.colorCircleSelected,
                      ]}
                    >
                      {isSelected && <Icon name="Check" size={14} color="#0D0D0F" strokeWidth={3} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Botón Guardar */}
          <View style={styles.footer}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveButton,
                saving && styles.saveButtonDisabled,
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={styles.saveButtonText}>
                {saving
                  ? 'Guardando...'
                  : isEditMode
                    ? 'Guardar cambios'
                    : 'Guardar categoría'}
              </Text>
            </Pressable>
          </View>
        </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderColor: colors.line,
    borderTopWidth: 1,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: {
    ...typography.titleSmall,
    color: colors.ink,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  previewContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  previewIconBox: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewName: {
    ...typography.bodyMedium,
    color: colors.ink,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    ...typography.labelSmall,
    color: colors.ink3,
  },
  suggestionHint: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 10,
  },
  input: {
    height: 48,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    fontSize: 12,
  },
  iconScroll: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.xxs,
  },
  colorCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleSelected: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  saveButton: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...typography.labelLarge,
    color: '#0D0D0F',
    fontWeight: '700',
  },
});
