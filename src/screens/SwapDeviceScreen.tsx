import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSession, swapDevice } from '../db/sessions.repo';
import { getUnit, listUnits } from '../db/units.repo';
import { scheduleSessionAlarm } from '../notifications/notifications';
import { getAlarmSettings } from '../settings/alarmSettings';
import { remainingMinutes, sessionElapsedMinutes, swapDeviceMinutes } from '../utils/billing';
import { formatDuration, formatRupiah } from '../utils/format';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RentalSession, Unit } from '../types/models';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

type Props = NativeStackScreenProps<RootStackParamList, 'SwapDevice'>;

export default function SwapDeviceScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<RentalSession | null>(null);
  const [currentUnit, setCurrentUnit] = useState<Unit | null>(null);
  const [candidates, setCandidates] = useState<Unit[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getSession(sessionId);
      setSession(s);
      if (!s) {
        setLoadError(true);
        return;
      }
      const [u, allUnits] = await Promise.all([getUnit(s.unitId), listUnits()]);
      setCurrentUnit(u);
      setCandidates(allUnits.filter((unit) => unit.id !== s.unitId && unit.status === 'idle'));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleSelect(target: Unit) {
    if (!session || !currentUnit) return;
    const now = Date.now();
    const planned = session.plannedMinutes ?? 0;
    const elapsed = Math.min(sessionElapsedMinutes(session, now), planned);
    const oldRemaining = Math.max(0, remainingMinutes(session, now));
    const newPlannedMinutes = swapDeviceMinutes(session, target.hourlyRate, now);
    const newRemaining = Math.max(0, newPlannedMinutes - elapsed);
    Alert.alert(
      `Ganti ke ${target.name}?`,
      `Nominal sewa (${formatRupiah(session.plannedAmount ?? 0)}) tidak berubah. Sisa waktu berubah dari ${formatDuration(oldRemaining)} menjadi ${formatDuration(newRemaining)}.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ganti',
          onPress: async () => {
            setBusy(true);
            try {
              await swapDevice(session.id, target.id);
              if (session.status === 'active') {
                const settings = await getAlarmSettings();
                const refreshed = await getSession(session.id);
                if (refreshed) await scheduleSessionAlarm(refreshed, target.name, settings);
              }
              navigation.goBack();
            } catch (e) {
              Alert.alert('Gagal mengganti perangkat', String((e as Error).message ?? e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={loading || loadError ? [] : candidates}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          currentUnit && !loading && !loadError ? (
            <View style={styles.currentCard}>
              <Text style={styles.currentLabel}>Perangkat saat ini</Text>
              <Text style={styles.current}>{currentUnit.name} ({currentUnit.category})</Text>
              <Text style={styles.instruction}>Pilih perangkat kosong sebagai pengganti.</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <ScreenState title="Memuat perangkat" />
          ) : loadError ? (
            <ScreenState title="Perangkat tidak dapat dimuat" actionLabel="Coba lagi" onAction={load} />
          ) : (
            <ScreenState title="Tidak ada perangkat pengganti" message="Semua perangkat lain sedang digunakan." />
          )
        }
        renderItem={({ item }) => (
          <AppPressable
            style={styles.row}
            onPress={() => handleSelect(item)}
            disabled={busy}
            accessibilityLabel={`Ganti ke ${item.name}, ${item.category}, ${formatRupiah(item.hourlyRate)} per jam`}
          >
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.category} · {formatRupiah(item.hourlyRate)}/jam</Text>
            </View>
          </AppPressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    padding: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
  },
  currentCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  currentLabel: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  current: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  instruction: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 4,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    color: colors.textDim,
    marginTop: 2,
  },
});
