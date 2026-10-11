import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listUnits } from '../db/units.repo';
import {
  activateBooking,
  cancelBooking,
  completeSession,
  listActiveSessions,
  listBookedSessions,
  listPausedSessions,
  pauseSession,
  resumeSession,
} from '../db/sessions.repo';
import RentedUnitCard from '../components/RentedUnitCard';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';
import { useAlarms } from '../context/AlarmContext';
import { cancelSessionAlarm, scheduleSessionAlarm } from '../notifications/notifications';
import { getAlarmSettings } from '../settings/alarmSettings';
import { subscribeDataVersion } from '../db/dataVersion';
import { remainingMinutes } from '../utils/billing';
import { formatDuration, formatRupiah } from '../utils/format';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RentalSession, Unit, UnitCategory } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const CATEGORIES: UnitCategory[] = ['PS', 'HP', 'PC'];

type Row =
  | { kind: 'header'; key: string; title: string }
  | { kind: 'rented'; key: string; unit: Unit; session: RentalSession }
  | { kind: 'booked'; key: string; unit: Unit | null; session: RentalSession }
  | { kind: 'paused'; key: string; unit: Unit | null; session: RentalSession }
  | { kind: 'empty'; key: string; text: string };

export default function HomeScreen({ navigation }: Props) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [activeSessions, setActiveSessions] = useState<RentalSession[]>([]);
  const [pausedSessions, setPausedSessions] = useState<RentalSession[]>([]);
  const [bookedSessions, setBookedSessions] = useState<RentalSession[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { ringingAlarms, dismissAlarm } = useAlarms();

  const load = useCallback(async () => {
    try {
      const [u, active, paused, booked] = await Promise.all([
        listUnits(),
        listActiveSessions(),
        listPausedSessions(),
        listBookedSessions(),
      ]);
      setUnits(u);
      setActiveSessions(active);
      setPausedSessions(paused);
      setBookedSessions(booked);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Dulu layar ini menembak database tiap 5 detik. Sekarang hanya memuat ulang
  // ketika ada perubahan data, jadi hasil aksi juga langsung tampil.
  useEffect(() => subscribeDataVersion(load), [load]);

  async function handlePause(session: RentalSession) {
    try {
      await pauseSession(session.id);
      await cancelSessionAlarm(session.id);
      dismissAlarm(session.id);
    } catch (e) {
      Alert.alert('Gagal menjeda sewa', String((e as Error).message ?? e));
    }
  }

  async function handleFinish(session: RentalSession) {
    try {
      await completeSession(session.id, session.unitId);
      await cancelSessionAlarm(session.id);
      dismissAlarm(session.id);
    } catch (e) {
      Alert.alert('Gagal menyelesaikan sewa', String(e));
    }
  }

  async function handleActivateBooking(session: RentalSession, unit: Unit | null) {
    setBusyId(session.id);
    try {
      await activateBooking(session.id);
      if (unit) {
        const settings = await getAlarmSettings();
        const refreshed = { ...session, status: 'active' as const, currentPeriodStart: Date.now() };
        await scheduleSessionAlarm(refreshed, unit.name, settings);
      }
    } catch (e) {
      Alert.alert('Gagal memulai booking', String((e as Error).message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  function handleCancelBooking(session: RentalSession, unit: Unit | null) {
    Alert.alert(
      'Batalkan booking?',
      `Booking ${session.customerName}${unit ? ` di ${unit.name}` : ''} akan dibatalkan dan unit kembali tersedia.`,
      [
        { text: 'Tidak', style: 'cancel' },
        {
          text: 'Batalkan',
          style: 'destructive',
          onPress: async () => {
            setBusyId(session.id);
            try {
              await cancelBooking(session.id);
            } catch (e) {
              Alert.alert('Gagal membatalkan booking', String((e as Error).message ?? e));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  async function handleResume(session: RentalSession, unit: Unit | null) {
    setBusyId(session.id);
    try {
      await resumeSession(session.id);
      if (unit) {
        const settings = await getAlarmSettings();
        const refreshed = { ...session, status: 'active' as const, currentPeriodStart: Date.now() };
        await scheduleSessionAlarm(refreshed, unit.name, settings);
      }
    } catch (e) {
      Alert.alert('Tidak bisa melanjutkan', String((e as Error).message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  // Urutan dan ringkasan hanya dihitung ulang saat datanya benar-benar berubah,
  // bukan tiap render (alarm berbunyi, tombol ditekan, dan seterusnya).
  const now = Date.now();

  const availableCountByCategory = useMemo(() => {
    const bookedUnitIds = new Set(bookedSessions.map((s) => s.unitId));
    const counts: Record<string, number> = {};
    for (const u of units) {
      if (u.status === 'idle' && !bookedUnitIds.has(u.id)) {
        counts[u.category] = (counts[u.category] ?? 0) + 1;
      }
    }
    return counts;
  }, [units, bookedSessions]);

  const idleCount = useMemo(() => units.filter((unit) => unit.status === 'idle').length, [units]);

  const rows: Row[] = useMemo(() => {
    const unitsById: Record<number, Unit> = Object.fromEntries(units.map((u) => [u.id, u]));
    const rented = [...activeSessions].sort(
      (a, b) => remainingMinutes(a, now) - remainingMinutes(b, now)
    );

    const list: Row[] = [];
    if (rented.length > 0) {
      list.push({ kind: 'header', key: 'h-rented', title: 'Berjalan' });
      for (const session of rented) {
        const unit = unitsById[session.unitId];
        if (unit) list.push({ kind: 'rented', key: `r-${session.id}`, unit, session });
      }
    }
    if (bookedSessions.length > 0) {
      list.push({ kind: 'header', key: 'h-booked', title: 'Dipesan' });
      for (const session of bookedSessions) {
        list.push({ kind: 'booked', key: `b-${session.id}`, unit: unitsById[session.unitId] ?? null, session });
      }
    }
    if (pausedSessions.length > 0) {
      list.push({ kind: 'header', key: 'h-paused', title: 'Dijeda' });
      for (const session of pausedSessions) {
        list.push({ kind: 'paused', key: `p-${session.id}`, unit: unitsById[session.unitId] ?? null, session });
      }
    }
    if (list.length === 0) {
      list.push({
        kind: 'empty',
        key: 'e-none',
        text: 'Belum ada sewa aktif. Pilih kategori di atas untuk memulai.',
      });
    }
    return list;
    // now sengaja tidak jadi dependency: urutan hanya perlu dihitung ulang saat data berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, activeSessions, bookedSessions, pausedSessions]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>Operasional rental</Text>
          <Text style={styles.title}>PhoneRent</Text>
          {!loading && !loadError ? (
            <Text style={styles.summary}>
              {activeSessions.length} berjalan, {idleCount} tersedia
            </Text>
          ) : null}
        </View>
      </View>

      {!loading && !loadError ? (
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => (
            <AppPressable
              key={c}
              style={styles.categoryButton}
              onPress={() => navigation.navigate('CategoryUnits', { category: c })}
              accessibilityLabel={`${c}, ${availableCountByCategory[c] ?? 0} perangkat tersedia`}
            >
              <Text style={styles.categoryButtonTitle}>{c}</Text>
              <Text style={styles.categoryButtonCount}>{availableCountByCategory[c] ?? 0} tersedia</Text>
            </AppPressable>
          ))}
        </View>
      ) : null}

      {ringingAlarms.length > 0 && (
        <View style={styles.alarmBanner}>
          {ringingAlarms.map((a) => (
            <View key={a.sessionId} style={styles.alarmRow}>
              <View style={styles.alarmInfo}>
                <Text style={styles.alarmTitle}>Waktu habis</Text>
                <Text style={styles.alarmText}>{a.unitName}, sewa {a.customerName}</Text>
              </View>
              <AppPressable
                style={styles.alarmDismiss}
                onPress={() => dismissAlarm(a.sessionId)}
                accessibilityLabel={`Matikan alarm ${a.unitName}`}
              >
                <Text style={styles.alarmDismissText}>Matikan</Text>
              </AppPressable>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={loading || loadError ? [] : rows}
        keyExtractor={(row) => row.key}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <ScreenState title="Memuat status rental" />
          ) : loadError ? (
            <ScreenState
              title="Status rental tidak dapat dimuat"
              message="Periksa penyimpanan aplikasi, lalu coba lagi."
              actionLabel="Coba lagi"
              onAction={load}
            />
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <Text style={styles.sectionTitle}>{item.title}</Text>;
          }
          if (item.kind === 'rented') {
            return (
              <RentedUnitCard
                unit={item.unit}
                session={item.session}
                onPause={() => handlePause(item.session)}
                onFinish={() => handleFinish(item.session)}
                onExtend={() => navigation.navigate('ExtendSession', { sessionId: item.session.id })}
                onSwap={() => navigation.navigate('SwapDevice', { sessionId: item.session.id })}
              />
            );
          }
          if (item.kind === 'paused') {
            const busy = busyId === item.session.id;
            return (
              <View style={styles.pausedCard}>
                <View style={styles.pausedRow}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.pausedCustomer}>{item.session.customerName}</Text>
                    <Text style={styles.pausedUnitName}>
                      {item.unit ? item.unit.name : 'Unit'}
                      {item.unit ? ` (${item.unit.category})` : ''}
                    </Text>
                  </View>
                  <View style={styles.pausedDurationCol}>
                    <Text style={styles.pausedDuration}>
                      {formatDuration(item.session.accumulatedMinutes)} terpakai
                    </Text>
                    <Text style={styles.pausedRemaining}>
                      Sisa {formatDuration(Math.max(0, remainingMinutes(item.session, now)))}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <AppPressable
                    style={styles.extendButtonSmall}
                    onPress={() => navigation.navigate('ExtendSession', { sessionId: item.session.id })}
                    disabled={busy}
                  >
                    <Text style={[styles.actionText, styles.extendTextSmall]}>+ Durasi</Text>
                  </AppPressable>
                  <AppPressable
                    style={styles.resumeButton}
                    onPress={() => handleResume(item.session, item.unit)}
                    disabled={busy}
                  >
                    <Text style={styles.actionText}>Lanjutkan</Text>
                  </AppPressable>
                </View>
                <AppPressable
                  style={styles.swapLink}
                  onPress={() => navigation.navigate('SwapDevice', { sessionId: item.session.id })}
                  disabled={busy}
                >
                  <Text style={styles.swapLinkText}>Ganti Perangkat</Text>
                </AppPressable>
              </View>
            );
          }
          if (item.kind === 'booked') {
            const busy = busyId === item.session.id;
            return (
              <View style={styles.bookedCard}>
                <View style={styles.pausedRow}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.pausedCustomer}>{item.session.customerName}</Text>
                    <Text style={styles.pausedUnitName}>
                      {item.unit ? item.unit.name : 'Unit'}
                      {item.unit ? ` (${item.unit.category})` : ''}
                    </Text>
                  </View>
                  <View style={styles.pausedDurationCol}>
                    <Text style={styles.bookedAmount}>{formatRupiah(item.session.plannedAmount ?? 0)}</Text>
                    <Text style={styles.pausedRemaining}>
                      {formatDuration(item.session.plannedMinutes ?? 0)} · lunas
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <AppPressable
                    style={styles.resumeButton}
                    onPress={() => handleActivateBooking(item.session, item.unit)}
                    disabled={busy}
                  >
                    <Text style={styles.actionText}>Mulai</Text>
                  </AppPressable>
                  <AppPressable
                    style={styles.finishButtonSmall}
                    onPress={() => handleCancelBooking(item.session, item.unit)}
                    disabled={busy}
                  >
                    <Text style={styles.actionText}>Batalkan</Text>
                  </AppPressable>
                </View>
              </View>
            );
          }
          return <Text style={styles.emptyText}>{item.text}</Text>;
        }}
      />

      <View style={styles.bottomNav}>
        <AppPressable style={styles.navButton} onPress={() => navigation.navigate('Finance')}>
          <Text style={styles.navButtonText}>Keuangan</Text>
        </AppPressable>
        <AppPressable style={styles.navButton} onPress={() => navigation.navigate('AlarmSettings')}>
          <Text style={styles.navButtonText}>Alarm</Text>
        </AppPressable>
        <AppPressable style={styles.navButton} onPress={() => navigation.navigate('UnitManagement')}>
          <Text style={styles.navButtonText}>Unit</Text>
        </AppPressable>
        <AppPressable style={styles.navButton} onPress={() => navigation.navigate('History')}>
          <Text style={styles.navButtonText}>Riwayat</Text>
        </AppPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
  },
  summary: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 2,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  categoryButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 76,
    paddingVertical: 12,
    alignItems: 'center',
  },
  categoryButtonTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  categoryButtonCount: {
    fontSize: 13,
    color: colors.textDim,
    marginTop: 2,
  },
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    width: '100%',
  },
  navButton: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
    marginTop: 18,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 28,
    textAlign: 'center',
  },
  pausedCard: {
    backgroundColor: colors.warningBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  bookedCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bookedAmount: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 15,
  },
  pausedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  pausedCustomer: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  pausedUnitName: {
    color: colors.textDim,
    marginTop: 2,
  },
  pausedDurationCol: {
    alignItems: 'flex-end',
  },
  pausedDuration: {
    color: colors.warning,
    fontWeight: '700',
    fontSize: 13,
  },
  pausedRemaining: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  extendButtonSmall: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
  },
  extendTextSmall: {
    color: colors.text,
  },
  resumeButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
  },
  finishButtonSmall: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
  },
  actionText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  swapLink: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  swapLinkText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
  },
  alarmBanner: {
    marginBottom: 8,
    width: '90%',
    maxWidth: 688,
    alignSelf: 'center',
  },
  alarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 6,
    paddingLeft: 12,
  },
  alarmInfo: {
    flex: 1,
    paddingVertical: 12,
  },
  alarmTitle: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  alarmText: {
    color: colors.text,
    fontSize: 13,
    marginTop: 2,
  },
  alarmDismiss: {
    paddingHorizontal: 14,
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: 48,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSubtle,
  },
  alarmDismissText: {
    color: colors.danger,
    fontWeight: '700',
  },
});
