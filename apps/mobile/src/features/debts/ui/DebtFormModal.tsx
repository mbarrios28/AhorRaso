import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZodError } from 'zod';
import { colors, radius, spacing, typography } from '@/core/theme';
import type { CreateDebtInput } from '../domain/types';

const fields = [
  { key: 'name', label: 'Nombre de la deuda', placeholder: 'Ej. Préstamo personal' },
  { key: 'outstandingBalanceCents', label: 'Saldo pendiente (S/)', placeholder: '0,00' },
  { key: 'annualInterestRateBps', label: 'Tasa anual (%)', placeholder: '0,00' },
  { key: 'minimumPaymentCents', label: 'Pago mínimo (S/)', placeholder: '0,00' },
] as const;

type FieldErrors = Partial<Record<keyof CreateDebtInput, string>>;

interface DebtFormModalProps {
  onSave: (input: CreateDebtInput) => void;
  onClose: () => void;
}

export function DebtFormModal({ onSave, onClose }: DebtFormModalProps) {
  const [values, setValues] = useState<CreateDebtInput>({
    name: '',
    outstandingBalanceCents: '',
    annualInterestRateBps: '',
    minimumPaymentCents: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState(false);
  const submitted = useRef(false);

  const submit = () => {
    if (submitted.current) return;
    submitted.current = true;
    setErrors({});
    setSaveError(false);

    try {
      onSave(values);
    } catch (error) {
      submitted.current = false;
      if (error instanceof ZodError) {
        const fieldErrors: FieldErrors = {};
        for (const { key } of fields) {
          fieldErrors[key] = error.issues.find((issue) => issue.path[0] === key)?.message;
        }
        setErrors(fieldErrors);
      } else {
        setSaveError(true);
      }
      return;
    }

    onClose();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={typography.titleLarge}>Registrar deuda</Text>
            {fields.map(({ key, label, placeholder }) => (
              <View key={key} style={styles.field}>
                <Text style={typography.labelLarge}>{label}</Text>
                <TextInput
                  accessibilityLabel={label}
                  style={[styles.input, errors[key] && styles.invalid]}
                  value={values[key]}
                  onChangeText={(value) => {
                    setValues((current) => ({ ...current, [key]: value }));
                    setErrors((current) => ({ ...current, [key]: undefined }));
                    setSaveError(false);
                  }}
                  placeholder={placeholder}
                  placeholderTextColor={colors.ink3}
                  keyboardType={key === 'name' ? 'default' : 'decimal-pad'}
                />
                {errors[key] && <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text>}
              </View>
            ))}
            {saveError && (
              <Text accessibilityRole="alert" style={styles.error}>No se pudo guardar la deuda. Inténtalo de nuevo.</Text>
            )}
            <Pressable accessibilityRole="button" onPress={submit} style={styles.save}>
              <Text style={styles.saveText}>Guardar deuda</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
              <Text style={typography.labelLarge}>Cancelar</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  form: { gap: spacing.base, padding: spacing.gutter },
  field: { gap: spacing.xs },
  input: {
    ...typography.labelLarge,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: spacing.xxxl,
  },
  invalid: { borderColor: colors.danger },
  error: { ...typography.labelMedium, color: colors.tertiary },
  save: {
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    padding: spacing.md,
  },
  saveText: { ...typography.labelLarge, color: colors.bg },
  cancel: { alignItems: 'center', padding: spacing.md },
});
