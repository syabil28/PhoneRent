import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getExtensionTotalsBySession, listExtensions, listIncomeSessions } from '../db/sessions.repo';
import { listUnits } from '../db/units.repo';
import { formatDateTime, formatDuration, formatRupiah } from '../utils/format';
import { colors } from '../theme/colors';
import type { Extension, RentalSession, Unit } from '../types/models';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

type Period = 'harian' | 'mingguan' | 'bulanan';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'harian', label: 'Harian' },
  { key: 'mingguan', label: 'Mingguan' },
  { key: 'bulanan', label: 'Bulanan' },
];

function periodStart(period: Period): number {
  const now = new Date();
  if (period === 'harian') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (period === 'mingguan') {
    const d = new Date(now);
    const diffToMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

const STATUS_LABEL: Record<string, string> = {
  booked: 'Dipesan',
  active: 'Berjalan',
  paused: 'Dijeda',
  completed: 'Selesai',
};

type Entry =
  | { type: 'session'; key: string; at: number; amount: number; session: RentalSession }
  | { type: 'extension'; key: string; at: number; amount: number; extension: Extension };

export default function FinanceScreen() {
  const [period, setPeriod] = useState<Period>('harian');
  const [sessions, setSessions] = useState<RentalSession[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [extensionTotals, setExtensionTotals] = useState<Record<number, number>>({});
  const [unitsById, setUnitsById] = useState<Record<number, Unit>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const since = periodStart(p);
      const [income, exts, totals, units] = await Promise.all([
        listIncomeSessions(since),
        listExtensions(since),
        getExtensionTotalsBySession(),
        listUnits(),
      ]);
      setSessions(income);
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
      load(period);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, load])
  );

  // Nominal sesi sudah termasuk semua tambahan durasi, jadi tambahan dikurangi di sini
  // dan dihitung terpisah sesuai tanggal tambahannya sendiri.
  const entries: Entry[] = [
    ...sessions.map((s): Entry => ({
      type: 'session',
      key: `s-${s.id}`,
      at: s.startTime,
      amount: (s.plannedAmount ?? 0) - (extensionTotals[s.id] ?? 0),
      session: s,
    })),
    ...extensions.map((e): Entry => ({
      type: 'extension',
      key: `e-${e.id}`,
      at: e.createdAt,
      amount: e.addedAmount,
      extension: e,
    })),
  ].sort((a, b) => b.at - a.at);

  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.tabRow}>
        {PERIODS.map((p) => (
          <AppPressable
            key={p.key}
            style={[styles.tab, period === p.key && styles.tabActive]}
            onPress={() => setPeriod(p.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p.key }}
          >
            <Text style={[styles.tabText, period === p.key && styles.tabTextActive]}>{p.label}</Text>
          </AppPressable>
        ))}
      </View>

      {!loadError ? (
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Uang masuk</Text>
          <Text style={styles.totalValue}>{loading ? '...' : formatRupiah(total)}</Text>
          <Text style={styles.totalCount}>{loading ? 'Menghitung transaksi' : `${entries.length} transaksi`}</Text>
        </View>
      ) : null}

      <FlatList
        data={loading || loadError ? [] : entries}
        keyExtractor={(entry) => entry.key}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <ScreenState title="Memuat transaksi" />
          ) : loadError ? (
            <ScreenState title="Transaksi tidak dapat dimuat" actionLabel="Coba lagi" onAction={() => load(period)} />
          ) : (
            <ScreenState title="Belum ada uang masuk" message="Transaksi untuk periode ini akan muncul di sini." />
          )
        }
        renderItem={({ item: entry }) => {
          if (entry.type === 'extension') {
            const ext = entry.extension;
            const unit = unitsById[ext.unitId];
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.customerName}>{ext.customerName}</Text>
                  <Text style={styles.cost}>{formatRupiah(entry.amount)}</Text>
                </View>
                <Text style={styles.detail}>
                  {unit ? unit.name : `Unit #${ext.unitId}`} · Tambah durasi {formatDuration(ext.addedMinutes)}
                </Text>
                <Text style={styles.detail}>{formatDateTime(ext.createdAt)}</Text>
              </View>
            );
          }

          const item = entry.session;
          const unit = unitsById[item.unitId];
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.customerName}>{item.customerName}</Text>
                <Text style={styles.cost}>{formatRupiah(entry.amount)}</Text>
              </View>
              <Text style={styles.detail}>
                {unit ? unit.name : `Unit #${item.unitId}`} · {STATUS_LABEL[item.status] ?? item.status}
              </Text>
              <Text style={styles.detail}>{formatDateTime(item.startTime)}</Text>
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 12,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textDim,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.onPrimary,
  },
  totalBox: {
    marginBottom: 16,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 688,
    alignSelf: 'center',
  },
  totalLabel: {
    color: colors.textDim,
    fontSize: 14,
  },
  totalValue: {
    color: colors.primary,
    fontSize: 34,
    fontWeight: '800',
    marginTop: 4,
  },
  totalCount: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 4,
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
  detail: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 4,
  },
});
