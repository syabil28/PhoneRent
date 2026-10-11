import { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUnit } from '../db/units.repo';
import {
  bookUnit,
  getActiveSessionForUnit,
  getBookedSessionForUnit,
  getSession,
  startSession,
} from '../db/sessions.repo';
import DualInputToggle from '../components/DualInputToggle';
import { scheduleSessionAlarm } from '../notifications/notifications';
import { getAlarmSettings } from '../settings/alarmSettings';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { InputMode, Unit } from '../types/models';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

type Props = NativeStackScreenProps<RootStackParamList, 'StartRental'>;

export default function StartRentalScreen({ route, navigation }: Props) {
  const { unitId } = route.params;
  const [unit, setUnit] = useState<Unit | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [mode, setMode] = useState<InputMode>('duration');
  const [minutes, setMinutes] = useState(0);
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rentedBy, setRentedBy] = useState<string | null>(null);
  const [bookedBy, setBookedBy] = useState<string | null>(null);
  const nameInput = useRef<TextInput>(null);

  useEffect(() => {
    Promise.all([getUnit(unitId), getActiveSessionForUnit(unitId), getBookedSessionForUnit(unitId)])
      .then(([value, active, booked]) => {
        setUnit(value);
        setRentedBy(active?.customerName ?? null);
        setBookedBy(booked?.customerName ?? null);
        setLoadError(!value);
      })
      .catch(() => setLoadError(true));
  }, [unitId]);

  function validate(): string | null {
    const trimmedName = customerName.trim();
    if (!trimmedName) return 'Masukkan nama penyewa terlebih dahulu.';
    if (minutes <= 0 || amount <= 0) return 'Masukkan durasi atau nominal sewa terlebih dahulu.';
    return null;
  }

  async function handleStart() {
    if (!unit) return;
    const error = validate();
    if (error) {
      setSubmitted(true);
      setNameTouched(true);
      if (!customerName.trim()) nameInput.current?.focus();
      Alert.alert('Data belum lengkap', error);
      return;
    }
    setSaving(true);
    try {
      const sessionId = await startSession({
        unitId: unit.id,
        customerName: customerName.trim(),
        notes: null,
        inputMode: mode,
        plannedMinutes: minutes,
        plannedAmount: amount,
        rateSnapshot: unit.hourlyRate,
      });

      const session = await getSession(sessionId);
      if (session) {
        const alarmSettings = await getAlarmSettings();
        await scheduleSessionAlarm(session, unit.name, alarmSettings);
      }

      navigation.navigate('Home');
    } catch (e) {
      Alert.alert('Gagal memulai sewa', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function handleBook() {
    if (!unit) return;
    const error = validate();
    if (error) {
      setSubmitted(true);
      setNameTouched(true);
      if (!customerName.trim()) nameInput.current?.focus();
      Alert.alert('Data belum lengkap', error);
      return;
    }
    setSaving(true);
    try {
      // Booking: uang sewa dibayar sekarang, jam baru jalan saat ditekan "Mulai" di beranda.
      await bookUnit({
        unitId: unit.id,
        customerName: customerName.trim(),
        notes: null,
        inputMode: mode,
        plannedMinutes: minutes,
        plannedAmount: amount,
        rateSnapshot: unit.hourlyRate,
      });
      navigation.navigate('Home');
    } catch (e) {
      Alert.alert('Gagal membuat booking', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenState
          title="Perangkat tidak dapat dimuat"
          message="Kembali ke daftar perangkat, lalu pilih unit lagi."
          actionLabel="Kembali"
          onAction={navigation.goBack}
        />
      </SafeAreaView>
    );
  }

  if (!unit) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenState title="Memuat perangkat" />
      </SafeAreaView>
    );
  }

  const nameError = !customerName.trim() ? 'Masukkan nama pelanggan.' : null;
  const rentalError = minutes <= 0 || amount <= 0 ? 'Isi durasi atau nominal sewa.' : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Sewa baru</Text>
          <View style={styles.unitSummary}>
            <Text style={styles.unitLabel}>Perangkat</Text>
            <Text style={styles.subtitle}>{unit.name} ({unit.category})</Text>
            {rentedBy ? (
              <Text style={styles.unitBusyNote}>
                Sedang disewa {rentedBy}. Hanya bisa dibooking untuk giliran berikutnya.
              </Text>
            ) : bookedBy ? (
              <Text style={styles.unitBusyNote}>Sudah ada booking menunggu atas nama {bookedBy}.</Text>
            ) : null}
          </View>

          <Text style={styles.label}>Nama pelanggan</Text>
          <TextInput
            ref={nameInput}
            style={[styles.input, nameTouched && nameError && styles.inputError]}
            value={customerName}
            onChangeText={setCustomerName}
            onBlur={() => setNameTouched(true)}
            placeholder="Masukkan nama pelanggan"
            placeholderTextColor={colors.textDim}
            accessibilityLabel="Nama pelanggan"
            accessibilityState={{ disabled: saving }}
            editable={!saving}
            returnKeyType="done"
          />
          {nameTouched && nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

          <View style={styles.toggleWrap}>
            <DualInputToggle
              hourlyRate={unit.hourlyRate}
              onChange={(m, mins, amt) => {
                setMode(m);
                setMinutes(mins);
                setAmount(amt);
              }}
            />
            {submitted && rentalError ? <Text style={styles.errorText}>{rentalError}</Text> : null}
          </View>

          {!rentedBy && !bookedBy ? (
            <AppPressable style={styles.startButton} onPress={handleStart} disabled={saving}>
              <Text style={styles.startButtonText}>{saving ? 'Menyimpan...' : 'Mulai Sewa'}</Text>
            </AppPressable>
          ) : null}

          {!bookedBy ? (
            <>
              <AppPressable style={styles.bookButton} onPress={handleBook} disabled={saving}>
                <Text style={styles.bookButtonText}>Simpan booking</Text>
              </AppPressable>
              <Text style={styles.bookHint}>Pembayaran dicatat sekarang. Timer dimulai dari beranda.</Text>
            </>
          ) : null}
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
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  unitSummary: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  unitLabel: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 18,
    color: colors.text,
    fontWeight: '800',
    marginTop: 3,
  },
  unitBusyNote: {
    marginTop: 8,
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
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
  toggleWrap: {
    marginTop: 24,
    marginBottom: 28,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: 'center',
  },
  startButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  bookButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: 'center',
  },
  bookButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  bookHint: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
});
