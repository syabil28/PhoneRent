import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listUnits } from '../db/units.repo';
import { listActiveSessions, listBookedSessions, listPausedSessions } from '../db/sessions.repo';
import { formatRupiah } from '../utils/format';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { Unit } from '../types/models';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

type Props = NativeStackScreenProps<RootStackParamList, 'CategoryUnits'>;

export default function CategoryUnitsScreen({ route, navigation }: Props) {
  const { category } = route.params;
  const [units, setUnits] = useState<Unit[]>([]);
  const [pausedByUnit, setPausedByUnit] = useState<Record<number, number>>({});
  const [rentedByUnit, setRentedByUnit] = useState<Record<number, string>>({});
  const [bookedByUnit, setBookedByUnit] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [allUnits, paused, active, booked] = await Promise.all([
        listUnits(),
        listPausedSessions(),
        listActiveSessions(),
        listBookedSessions(),
      ]);
      // Semua unit ditampilkan supaya unit yang sedang disewa tetap bisa dibooking.
      setUnits(allUnits.filter((u) => u.category === category));
      const counts: Record<number, number> = {};
      for (const p of paused) counts[p.unitId] = (counts[p.unitId] ?? 0) + 1;
      setPausedByUnit(counts);
      setRentedByUnit(Object.fromEntries(active.map((s) => [s.unitId, s.customerName])));
      setBookedByUnit(Object.fromEntries(booked.map((s) => [s.unitId, s.customerName])));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={loading || loadError ? [] : units}
        keyExtractor={(u) => String(u.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={!loading && !loadError ? <Text style={styles.heading}>Pilih perangkat</Text> : null}
        ListEmptyComponent={
          loading ? (
            <ScreenState title={`Memuat unit ${category}`} />
          ) : loadError ? (
            <ScreenState title="Daftar unit tidak dapat dimuat" actionLabel="Coba lagi" onAction={load} />
          ) : (
            <ScreenState
              title={`Belum ada unit ${category}`}
              message="Kembali dan pilih kategori lain, atau tambahkan perangkat dari menu Perangkat."
            />
          )
        }
        renderItem={({ item }) => {
          const rentedBy = rentedByUnit[item.id];
          const bookedBy = bookedByUnit[item.id];
          const statusLabel = rentedBy ? 'Disewa' : bookedBy ? 'Dipesan' : 'Kosong';

          return (
            <AppPressable
              style={[styles.card, rentedBy && styles.cardRented, !rentedBy && bookedBy && styles.cardBooked]}
              onPress={() => navigation.navigate('StartRental', { unitId: item.id })}
              accessibilityLabel={`${item.name}, ${formatRupiah(item.hourlyRate)} per jam, ${statusLabel}${
                rentedBy ? ` oleh ${rentedBy}` : bookedBy ? ` oleh ${bookedBy}` : ''
              }`}
            >
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.rate}>{formatRupiah(item.hourlyRate)}/jam</Text>
              <Text
                style={[styles.status, rentedBy && styles.statusRented, !rentedBy && bookedBy && styles.statusBooked]}
              >
                {statusLabel}
                {rentedBy ? ` · ${rentedBy}` : bookedBy ? ` · ${bookedBy}` : ''}
              </Text>
              {pausedByUnit[item.id] > 0 && (
                <Text style={styles.pausedNote}>{pausedByUnit[item.id]} sesi dijeda</Text>
              )}
            </AppPressable>
          );
        }}
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
  row: {
    gap: 12,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 108,
    justifyContent: 'center',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  cardRented: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  cardBooked: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  rate: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 4,
  },
  status: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDim,
  },
  statusRented: {
    color: colors.primary,
  },
  statusBooked: {
    color: colors.warning,
  },
  pausedNote: {
    marginTop: 6,
    fontSize: 13,
    color: colors.warning,
    fontWeight: '600',
  },
});
