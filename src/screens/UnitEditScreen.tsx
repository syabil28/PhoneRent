import { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addUnit, deleteUnit, getUnit, updateUnit } from '../db/units.repo';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { Unit, UnitCategory } from '../types/models';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

type Props = NativeStackScreenProps<RootStackParamList, 'UnitEdit'>;

const CATEGORIES: UnitCategory[] = ['PS', 'HP', 'PC'];

export default function UnitEditScreen({ route, navigation }: Props) {
  const { unitId } = route.params;
  const isNew = unitId == null;

  const [existing, setExisting] = useState<Unit | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<UnitCategory>('PS');
  const [rateText, setRateText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [rateTouched, setRateTouched] = useState(false);
  const nameInput = useRef<TextInput>(null);
  const rateInput = useRef<TextInput>(null);

  useEffect(() => {
    if (unitId == null) return;
    getUnit(unitId)
      .then((u) => {
        if (!u) {
          setLoadError(true);
          return;
        }
        setExisting(u);
        setName(u.name);
        setCategory(u.category);
        setRateText(String(u.hourlyRate));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [unitId]);

  async function handleSave() {
    const trimmedName = name.trim();
    const rate = parseInt(rateText, 10);
    if (!trimmedName) {
      setNameTouched(true);
      nameInput.current?.focus();
      Alert.alert('Nama perangkat wajib diisi');
      return;
    }
    if (!rate || rate <= 0) {
      setRateTouched(true);
      rateInput.current?.focus();
      Alert.alert('Tarif per jam harus lebih dari 0');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await addUnit({ name: trimmedName, category, hourlyRate: rate });
      } else {
        await updateUnit(unitId!, { name: trimmedName, category, hourlyRate: rate });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Gagal menyimpan', String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!existing) return;
    if (existing.status === 'active') {
      Alert.alert('Tidak bisa dihapus', 'Perangkat ini sedang digunakan dalam sewa aktif.');
      return;
    }
    Alert.alert('Hapus perangkat?', `${existing.name} akan dihapus permanen.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteUnit(existing.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Gagal menghapus perangkat', String((e as Error).message ?? e));
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenState title="Memuat perangkat" />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenState title="Perangkat tidak dapat dimuat" actionLabel="Kembali" onAction={navigation.goBack} />
      </SafeAreaView>
    );
  }

  const nameError = !name.trim() ? 'Masukkan nama perangkat.' : null;
  const rateError = !parseInt(rateText, 10) ? 'Masukkan tarif lebih dari Rp0.' : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isNew ? 'Perangkat baru' : 'Detail perangkat'}</Text>
        <Text style={styles.label}>Nama perangkat</Text>
        <TextInput
          ref={nameInput}
          style={[styles.input, nameTouched && nameError && styles.inputError]}
          value={name}
          onChangeText={setName}
          onBlur={() => setNameTouched(true)}
          placeholder="Contoh: PS 3"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Nama perangkat"
          editable={!saving}
          returnKeyType="next"
          onSubmitEditing={() => rateInput.current?.focus()}
        />
        {nameTouched && nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

        <Text style={styles.label}>Kategori</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => (
            <AppPressable
              key={c}
              style={[styles.categoryChip, category === c && styles.categoryChipActive]}
              onPress={() => setCategory(c)}
              accessibilityRole="radio"
              accessibilityState={{ checked: category === c }}
            >
              <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>{c}</Text>
            </AppPressable>
          ))}
        </View>

        <Text style={styles.label}>Tarif per jam</Text>
        <TextInput
          ref={rateInput}
          style={[styles.input, rateTouched && rateError && styles.inputError]}
          value={rateText}
          onChangeText={(t) => setRateText(t.replace(/[^0-9]/g, ''))}
          onBlur={() => setRateTouched(true)}
          keyboardType="number-pad"
          placeholder="Contoh: 5000"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Tarif per jam dalam rupiah"
          editable={!saving}
        />
        {rateTouched && rateError ? <Text style={styles.errorText}>{rateError}</Text> : null}

        <AppPressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Menyimpan...' : 'Simpan perangkat'}</Text>
        </AppPressable>

        {!isNew && (
          <AppPressable style={styles.deleteButton} onPress={handleDelete} disabled={saving}>
            <Text style={styles.deleteButtonText}>Hapus Perangkat</Text>
          </AppPressable>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  label: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: colors.input,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
  },
  categoryChipText: {
    fontWeight: '600',
    color: colors.textDim,
  },
  categoryChipTextActive: {
    color: colors.onPrimary,
  },
  saveButton: {
    marginTop: 32,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
  },
  saveButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
});
