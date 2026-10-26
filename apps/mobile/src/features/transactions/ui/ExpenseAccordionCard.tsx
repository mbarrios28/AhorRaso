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
  entryMethod: 'manual' | 'voice';
}

interface ExpenseAccordionCardProps {
  card: ExpenseItemState;
  index: number;
  isOpen: boolean;
  canDelete: boolean;
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

  const categoryName = card.selectedCategory?.name || 'Sin categoría';
  const categoryIcon = card.selectedCategory?.icon || 'Tag';
  const cardTitle = card.place.trim() || (card.selectedCategory?.name ?? `Gasto ${index + 1}`);
  const paymentLabel = card.paymentMethod === 'digital' ? 'Digital' : 'Efectivo';
  const subtitle = card.note.trim()
    ? `${paymentLabel} · ${card.note}`
    : `${paymentLabel} · Toca para editar`;

  return (
    <View style={styles.cardContainer}>
      {/* 1. Header de la Card (Clic para plegar/desplegar) */}
      <Pressable
        onPress={onToggle}
        style={styles.cardHeader}
        accessibilityRole="button"
        accessibilityLabel={`Gasto ${index + 1}: ${cardTitle}, S/ ${parsedAmount.toFixed(2)}`}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <Icon name={categoryIcon} size={20} color={colors.primary} />
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {cardTitle}
              </Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText} numberOfLines={1}>
                  {categoryName}
                </Text>
              </View>
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.amountDisplay}>
            S/ {parsedAmount.toFixed(2)}
          </Text>
          {canDelete && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onDelete();
              }}
              style={styles.deleteBtn}
              accessibilityLabel={`Eliminar gasto ${index + 1}`}
            >
              <Icon name="Trash2" size={17} color={colors.ink3} />
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
          <View style={styles.amountHeroContainer}>
            <Text style={styles.fieldLabel}>MONTO</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencyPrefix}>S/</Text>
              <TextInput
                value={card.amountStr}
                onChangeText={(val) => {
                  const sanitized = val.replace(/[^0-9.]/g, '');
                  onUpdate({ amountStr: sanitized });
                }}
                placeholder="0.00"
                placeholderTextColor="#71717A"
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

          {/* Categoría Selector (incluye + Nueva categoría y botón Gestionar de main) */}
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>CATEGORÍA</Text>
            <CategorySelector
              selectedId={card.selectedCategory?.id || null}
              onSelect={(cat) => onUpdate({ selectedCategory: cat })}
              type="expense"
              showManageLink={true}
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
                >
                  Digital (Yape / Plin)
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Nota */}
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>NOTA O DETALLE</Text>
            <View style={styles.inputContainer}>
              <Icon name="FileText" size={17} color={colors.ink3} />
              <TextInput
                value={card.note}
                onChangeText={(val) => onUpdate({ note: val })}
                placeholder="Almuerzo facultad, recarga..."
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
    borderRadius: 20,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#2A2A2F',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181B',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42, 42, 47, 0.4)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#26262B',
    borderWidth: 1,
    borderColor: '#323238',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.titleSmall,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '65%',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  categoryBadgeText: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10,
    color: colors.primary,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 11.5,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  amountDisplay: {
    fontFamily: fontFamilies.monoBold,
    fontSize: 16,
    color: colors.ink,
    marginRight: 4,
  },
  deleteBtn: {
    width: 28,
    height: 28,
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
    backgroundColor: '#141417',
  },
  amountHeroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
    borderRadius: 14,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(42, 42, 47, 0.5)',
  },
  fieldLabel: {
    fontFamily: fontFamilies.monoMedium,
    fontSize: 10,
    color: colors.ink3,
    letterSpacing: 1.2,
    marginBottom: spacing.xxs,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: spacing.xs,
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
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: '#2A2A2F',
  },
  quickChipText: {
    fontFamily: fontFamilies.mono,
    fontSize: 11,
    color: colors.ink2,
  },
  formSection: {
    gap: spacing.xxs,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#18181B',
    borderColor: 'rgba(42, 42, 47, 0.5)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.base,
    height: 44,
  },
  textInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 13,
    padding: 0,
  },
  placesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  placeChip: {
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2F',
  },
  placeChipSelected: {
    backgroundColor: '#26262B',
    borderColor: colors.primary,
  },
  placeChipText: {
    ...typography.bodySmall,
    fontSize: 10.5,
    color: colors.ink3,
  },
  placeChipTextSelected: {
    color: colors.ink,
    fontWeight: '600',
  },
  paymentControl: {
    flexDirection: 'row',
    backgroundColor: '#18181B',
    borderRadius: 10,
    padding: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(42, 42, 47, 0.4)',
  },
  paymentTab: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  paymentTabActive: {
    backgroundColor: '#26262B',
  },
  paymentText: {
    ...typography.bodySmall,
    color: colors.ink3,
    fontSize: 12,
  },
  paymentTextActive: {
    color: colors.ink,
    fontWeight: '600',
  },
  foldCardBtn: {
    width: '100%',
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: '#1F1F23',
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
