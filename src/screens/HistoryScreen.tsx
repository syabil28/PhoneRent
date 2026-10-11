import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deleteAllCompletedSessions,
  deleteSession,
  getExtensionTotalsBySession,
  countCompletedSessions,
  listCompletedSessions,
  listExtensions,
} from '../db/sessions.repo';
import { listUnits } from '../db/units.repo';
import { formatDateTime, formatDuration, formatRupiah } from '../utils/format';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { Extension, RentalSession, Unit } from '../types/models';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

type Entry =
  | { type: 'session'; key: string; at: number; session: RentalSession }
  | { type: 'extension'; key: string; at: number; extension: Extension };

export default function HistoryScreen({}: Props) {
  const [sessions, setSessions] = useState<RentalSession[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [extensionTotals, setExtensionTotals] = useState<Record<number, number>>({});
  const [hiddenCount, setHiddenCount] = useState(0);
  const [unitsById, setUnitsById] = useState<Record<number, Unit>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [completed, exts, totals, units, total] = await Promise.all([
        listCompletedSessions(),
        listExtensions(),
        getExtensionTotalsBySession(),
        listUnits(),
        countCompletedSessions(),
      ]);
      setSessions(completed);
      setHiddenCount(Math.max(0, total - completed.length));
      setExtensions(exts);
      setExtensionTotals(totals);
      setUnitsById(Object.fromEntries(units.map((u) => [u.id, u])));
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

  function handleDeleteOne(session: RentalSession) {
    Alert.alert('Hapus riwayat ini?', 'Transaksi ini akan dihapus permanen.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => { await deleteSession(session.id); await load(); } },
    ]);
  }

  function handleDeleteAll() {
    Alert.alert('Hapus semua riwayat?', 'Semua transaksi selesai akan dihapus permanen.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus Semua', style: 'destructive', onPress: async () => { await deleteAllCompletedSessions(); await load(); } },
    ]);
  }

  const entries: Entry[] = [
    ...sessions.map((s): Entry => ({ type: 'session', key: `s-${s.id}`, at: s.endTime ?? s.startTime, session: s })),
    ...extensions.map((e): Entry => ({ type: 'extension', key: `e-${e.id}`, at: e.createdAt, extension: e })),
  ].sort((a, b) => b.at - a.at);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Riwayat Transaksi</Text>
        {sessions.length > 0 && (
          <AppPressable style={styles.clearButton} onPress={handleDeleteAll}>
            <Text style={styles.clearButtonText}>Hapus Semua</Text>
          </AppPressable>
        )}
      </View>
      <FlatList
        data={loading || loadError ? [] : entries}
        keyExtractor={(entry) => entry.key}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <ScreenState title="Memuat riwayat" />
          ) : loadError ? (
            <ScreenState title="Riwayat tidak dapat dimuat" actionLabel="Coba lagi" onAction={load} />
          ) : (
            <ScreenState title="Belum ada riwayat" message="Sewa yang selesai akan tersimpan di sini." />
          )
        }
        ListFooterComponent={
          hiddenCount > 0 ? (
            <Text style={styles.footerNote}>
              Menampilkan transaksi terbaru. {hiddenCount} transaksi lama tidak ditampilkan agar layar tetap
              ringan.
            </Text>
          ) : null
        }
        renderItem={({ item: entry }) => {
          if (entry.type === 'extension') {
            const ext = entry.extension;
            const unit = unitsById[ext.unitId];
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.customerName}>{ext.customerName}</Text>
                  <Text style={styles.cost}>{formatRupiah(ext.addedAmount)}</Text>
                </View>
                <Text style={styles.unitInfo}>{unit ? unit.name : `Unit #${ext.unitId}`}</Text>
                <Text style={styles.extensionNote}>
                  Tambah durasi {formatDuration(ext.addedMinutes)}
                </Text>
                <Text style={styles.detail}>{formatDateTime(ext.createdAt)}</Text>
              </View>
            );
          }

          const item = entry.session;
          const unit = unitsById[item.unitId];
          const realElapsed = item.endTime ? (item.endTime - item.startTime) / 60000 : 0;
          const wasPaused = realElapsed - item.accumulatedMinutes > 1;
          // Tambahan durasi punya barisnya sendiri, jadi tidak ikut dihitung di baris sesi.
          const extTotal = extensionTotals[item.id] ?? 0;
          const baseCost = (item.totalCost ?? 0) - extTotal;

          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.customerName}>{item.customerName}</Text>
                <Text style={styles.cost}>{formatRupiah(baseCost)}</Text>
              </View>
              <Text style={styles.unitInfo}>{unit ? unit.name : `Unit #${item.unitId}`}</Text>
              {extTotal > 0 && (
                <Text style={styles.extensionNote}>
                  + {formatRupiah(extTotal)} tambahan durasi (dicatat terpisah)
                </Text>
              )}
              <Text style={styles.detail}>Mulai: {formatDateTime(item.startTime)}</Text>
              <Text style={styles.detail}>Selesai: {item.endTime ? formatDateTime(item.endTime) : '-'}</Text>
              {wasPaused && <Text style={styles.pausedNote}>Sempat dijeda</Text>}
              <AppPressable style={styles.deleteButton} onPress={() => handleDeleteOne(item)} accessibilityLabel={`Hapus riwayat ${item.customerName}`}>
                <Text style={styles.deleteButtonText}>Hapus</Text>
              </AppPressable>
            </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  clearButton: {
    paddingHorizontal: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  clearButtonText: {
    color: colors.danger,
    fontWeight: '600',
  },
  footerNote: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  customerName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cost: {
    fontWeight: '800',
    color: colors.primary,
    fontSize: 16,
    flexShrink: 0,
  },
  unitInfo: {
    color: colors.textDim,
    marginTop: 2,
  },
  detail: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 4,
  },
  pausedNote: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  extensionNote: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  deleteButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
  },
  deleteButtonText: {
    color: colors.danger,
    fontWeight: '600',
    fontSize: 13,
  },
});
