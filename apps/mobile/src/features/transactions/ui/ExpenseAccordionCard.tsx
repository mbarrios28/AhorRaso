import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
} from 'react-native';
import { colors, spacing, radius, typography, fontFamilies } from '@/core/theme';
import { Icon } from '@/core/ui';
import { Category, CategorySelector } from '@/features/categories';
import { PaymentMethod } from '../domain/types';

export interface ExpenseItemState {
  id: string;
  amountStr: string;
  selectedCategory: Category | null;
  place: string;
  paymentMethod: PaymentMethod;
  note: string;
  occurredOn?: string;
  entryMethod: 'manual' | 'voice';
}

interface ExpenseAccordionCardProps {
  card: ExpenseItemState;
  index: number;
  isOpen: boolean;
  canDelete: boolean;
  sessionDate?: string;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updated: Partial<ExpenseItemState>) => void;
  categoriesList: Category[];
  placesList: string[];
}

export const ExpenseAccordionCard: React.FC<ExpenseAccordionCardProps> = ({
  card,
  index,
  isOpen,
  canDelete,
  sessionDate,
  onToggle,
  onDelete,
  onUpdate,
  categoriesList,
  placesList,
}) => {
  const parsedAmount = parseFloat(card.amountStr) || 0;

  const handleAddAmount = (extra: number) => {
    const current = parseFloat(card.amountStr) || 0;
    const next = (current + extra).toFixed(2);
    onUpdate({ amountStr: next });
  };

  const hasCategory = Boolean(card.selectedCategory);
  const categoryName = card.selectedCategory?.name || 'Sin categoría';
  const categoryIcon = card.selectedCategory?.icon ?? 'Tag';
  const categoryColor = card.selectedCategory?.color;
  const trimmedPlace = card.place.trim();
  const cardTitle = trimmedPlace || (card.selectedCategory?.name ?? `Gasto ${index + 1}`);
  const showCategoryBadge = !hasCategory || Boolean(trimmedPlace);
  const paymentLabel = card.paymentMethod === 'digital' ? 'Yape / Plin' : 'Efectivo';
  const hasCustomDate = Boolean(card.occurredOn && sessionDate && card.occurredOn !== sessionDate);
  const metaParts = [
    paymentLabel,
    hasCustomDate ? card.occurredOn : null,
    card.note.trim() || null,
  ].filter(Boolean);
  const subtitle = metaParts.join(' · ');

  return (
    <View
      style={[
        styles.cardContainer,
        !hasCategory && styles.cardContainerNeedsCategory,
      ]}
    >
      {/* 1. Header de la Card (Clic para plegar/desplegar) */}
      <Pressable
        onPress={onToggle}
        style={styles.cardHeader}
        accessibilityRole="button"
        accessibilityLabel={`Gasto ${index + 1}: ${cardTitle}, S/ ${parsedAmount.toFixed(2)}`}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconBox,
              !hasCategory && styles.iconBoxWarning,
            ]}
          >
            <Icon
              name={categoryIcon}
              size={20}
              color={hasCategory ? categoryColor || colors.tertiary : colors.warning}
            />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {cardTitle}
            </Text>
            <View style={styles.metaRow}>
              {showCategoryBadge && (
                <View
                  style={[
                    styles.categoryBadge,
                    !hasCategory && styles.categoryBadgeWarning,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryBadgeText,
                      !hasCategory && styles.categoryBadgeTextWarning,
                    ]}
                    numberOfLines={1}
                  >
                    {categoryName}
                  </Text>
                </View>
              )}
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.amountDisplay} numberOfLines={1}>
            -S/ {parsedAmount.toFixed(2)}
          </Text>
          {canDelete && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onDelete();
              }}
              style={styles.deleteBtn}
              hitSlop={6}
              accessibilityLabel={`Eliminar gasto ${index + 1}`}
            >
              <Icon name="Trash2" size={16} color={colors.ink3} />
            </Pressable>
          )}
          <View style={styles.chevronBox}>
            <Icon
              name={isOpen ? 'ChevronUp' : 'ChevronDown'}
              size={18}
              color={colors.ink2}
            />
          </View>
        </View>
      </Pressable>

      {/* 2. Cuerpo Desplegable del Acordeón */}
      {isOpen && (
        <View style={styles.cardBody}>
          {/* Monto Hero */}
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>MONTO</Text>
            <View style={styles.amountHeroContainer}>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>S/</Text>
                <TextInput
                  value={card.amountStr}
                  onChangeText={(val) => {
                    const sanitized = val.replace(/[^0-9.]/g, '');
                    onUpdate({ amountStr: sanitized });
                  }}
                  placeholder="0.00"
                  placeholderTextColor={colors.ink3}
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                  selectTextOnFocus
                />
              </View>
              {/* Atajos de incremento rápido */}
              <View style={styles.quickAddRow}>
                {[5, 10, 20].map((add) => (
                  <Pressable
                    key={add}
                    onPress={() => handleAddAmount(add)}
                    style={styles.quickChip}
                  >
                    <Text style={styles.quickChipText}>+ S/ {add}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Categoría Selector (incluye + Nueva categoría y botón Gestionar de main) */}
          <View style={styles.formSection}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.fieldLabel}>CATEGORÍA</Text>
              {!hasCategory && (
                <View style={styles.requiredBadge}>
                  <Text style={styles.requiredBadgeText}>Requerida</Text>
                </View>
              )}
            </View>
            <CategorySelector
              selectedId={card.selectedCategory?.id || null}
              onSelect={(cat) => onUpdate({ selectedCategory: cat })}
              type="expense"
              showManageLink={true}
              autoSelectFirst={false}
            />
          </View>

          {/* Establecimiento / Lugar */}
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>LUGAR / ESTABLECIMIENTO</Text>
            <View style={styles.inputContainer}>
              <Icon name="Store" size={17} color={colors.ink3} />
              <TextInput
                value={card.place}
                onChangeText={(val) => onUpdate({ place: val })}
                placeholder="¿Dónde compraste?"
                placeholderTextColor={colors.ink3}
                style={styles.textInput}
              />
            </View>

            {/* Chips rápidos de establecimientos */}
            {placesList.length > 0 && (
              <View style={styles.placesRow}>
                {placesList.slice(0, 5).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => onUpdate({ place: item })}
                    style={[
                      styles.placeChip,
                      card.place === item && styles.placeChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.placeChipText,
                        card.place === item && styles.placeChipTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Método de pago */}
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>MÉTODO DE PAGO</Text>
            <View style={styles.paymentControl}>
              <Pressable
                onPress={() => onUpdate({ paymentMethod: 'cash' })}
                style={[
                  styles.paymentTab,
                  card.paymentMethod === 'cash' && styles.paymentTabActive,
                ]}
              >
                <Icon
                  name="Banknote"
                  size={15}
                  color={card.paymentMethod === 'cash' ? colors.ink : colors.ink3}
                />
                <Text
                  style={[
                    styles.paymentText,
                    card.paymentMethod === 'cash' && styles.paymentTextActive,
                  ]}
                  numberOfLines={1}
                >
                  Efectivo
                </Text>
              </Pressable>

              <Pressable
                onPress={() => onUpdate({ paymentMethod: 'digital' })}
                style={[
                  styles.paymentTab,
                  card.paymentMethod === 'digital' && styles.paymentTabActive,
                ]}
              >
                <Icon
                  name="Smartphone"
                  size={15}
                  color={card.paymentMethod === 'digital' ? colors.ink : colors.ink3}
                />
                <Text
                  style={[
                    styles.paymentText,
                    card.paymentMethod === 'digital' && styles.paymentTextActive,
                  ]}
                  numberOfLines={1}
                >
                  Yape / Plin
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Nota */}
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>NOTA O DETALLE (OPCIONAL)</Text>
            <View style={styles.inputContainer}>
              <Icon name="FileText" size={17} color={colors.ink3} />
              <TextInput
                value={card.note}
                onChangeText={(val) => onUpdate({ note: val })}
                placeholder="Añade una nota si deseas..."
                placeholderTextColor={colors.ink3}
                style={styles.textInput}
                maxLength={160}
              />
            </View>
          </View>

          {/* Botón para plegar */}
          <Pressable onPress={onToggle} style={styles.foldCardBtn}>
            <Text style={styles.foldCardBtnText}>Listo, plegar ficha</Text>
            <Icon name="ChevronUp" size={15} color={colors.ink2} />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cardContainerNeedsCategory: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  cardHeader: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42, 42, 47, 0.45)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTitle: {
    ...typography.titleSmall,
    color: colors.ink,
    fontSize: 14.5,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(223, 108, 107, 0.14)',
    flexShrink: 1,
    maxWidth: '58%',
  },
  categoryBadgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  categoryBadgeText: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10,
    color: colors.tertiary,
  },
  categoryBadgeTextWarning: {
    color: colors.warning,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11.5,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  amountDisplay: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 15,
    color: colors.tertiary,
    marginRight: 2,
  },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: spacing.base,
    gap: spacing.base,
    backgroundColor: colors.bg,
  },
  amountHeroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  fieldLabel: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 1,
    marginBottom: 4,
  },
  requiredBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  requiredBadgeText: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10,
    color: colors.warning,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  currencyPrefix: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 22,
    color: colors.ink3,
  },
  amountInput: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 32,
    color: colors.ink,
    minWidth: 140,
    textAlign: 'center',
    padding: 0,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  quickChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickChipText: {
    fontFamily: fontFamilies.mono,
    fontSize: 11,
    color: colors.ink2,
  },
  formSection: {
    gap: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  textInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 13.5,
    padding: 0,
  },
  placesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  placeChip: {
    paddingHorizontal: spacing.sm,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  placeChipSelected: {
    backgroundColor: colors.surface3,
    borderColor: colors.primary,
  },
  placeChipText: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.ink3,
  },
  placeChipTextSelected: {
    color: colors.ink,
    fontWeight: '600',
  },
  paymentControl: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  paymentTab: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  paymentTabActive: {
    backgroundColor: colors.surface3,
  },
  paymentText: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 12.5,
  },
  paymentTextActive: {
    color: colors.ink,
    fontWeight: '600',
  },
  foldCardBtn: {
    width: '100%',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  foldCardBtnText: {
    ...typography.bodySmall,
    color: colors.ink2,
    fontSize: 12,
    fontWeight: '600',
  },
});
