import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extendSession, getSession } from '../db/sessions.repo';
import { getUnit } from '../db/units.repo';
import { scheduleSessionAlarm } from '../notifications/notifications';
import { getAlarmSettings } from '../settings/alarmSettings';
import DualInputToggle from '../components/DualInputToggle';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RentalSession, Unit } from '../types/models';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

type Props = NativeStackScreenProps<RootStackParamList, 'ExtendSession'>;

export default function ExtendSessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<RentalSession | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getSession(sessionId)
      .then(async (s) => {
        setSession(s);
        if (!s) {
          setLoadError(true);
          return;
        }
        const u = await getUnit(s.unitId);
        setUnit(u);
        setLoadError(!u);
      })
      .catch(() => setLoadError(true));
  }, [sessionId]);

  async function handleAdd() {
    if (!session || !unit) return;
    if (minutes <= 0 || amount <= 0) {
      setSubmitted(true);
      Alert.alert('Durasi/nominal belum diisi', 'Masukkan tambahan durasi atau nominal terlebih dahulu.');
      return;
    }
    setSaving(true);
    try {
      await extendSession(session.id, minutes, amount);
      const refreshed = await getSession(session.id);
      if (refreshed && refreshed.status === 'active') {
        const settings = await getAlarmSettings();
        await scheduleSessionAlarm(refreshed, unit.name, settings);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Gagal menambah durasi', String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenState title="Sesi tidak dapat dimuat" actionLabel="Kembali" onAction={navigation.goBack} />
      </SafeAreaView>
    );
  }

  if (!session || !unit) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenState title="Memuat sesi sewa" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Tambah durasi</Text>
          <View style={styles.sessionSummary}>
            <Text style={styles.summaryLabel}>Sesi aktif</Text>
            <Text style={styles.subtitle}>{unit.name}</Text>
            <Text style={styles.customer}>{session.customerName}</Text>
          </View>

          <View style={styles.toggleWrap}>
            <DualInputToggle
              hourlyRate={unit.hourlyRate}
              onChange={(_m, mins, amt) => {
                setMinutes(mins);
                setAmount(amt);
              }}
            />
            {submitted && (minutes <= 0 || amount <= 0) ? (
              <Text style={styles.errorText}>Isi tambahan durasi atau nominal.</Text>
            ) : null}
          </View>

          <AppPressable style={styles.addButton} onPress={handleAdd} disabled={saving}>
            <Text style={styles.addButtonText}>{saving ? 'Menyimpan...' : 'Tambahkan durasi'}</Text>
          </AppPressable>
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
  sessionSummary: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  summaryLabel: {
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
  customer: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 2,
  },
  toggleWrap: {
    marginBottom: 28,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
