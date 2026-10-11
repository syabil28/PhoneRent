import { memo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { RentalSession, Unit } from '../types/models';
import { estimatedEndTime } from '../utils/billing';
import { formatTimeOfDay } from '../utils/format';
import { colors } from '../theme/colors';
import CountdownTimer from './CountdownTimer';
import AppPressable from './AppPressable';

interface RentedUnitCardProps {
  unit: Unit;
  session: RentalSession;
  onPause: () => Promise<void>;
  onFinish: () => Promise<void>;
  onExtend: () => void;
  onSwap: () => void;
}

function RentedUnitCard({ unit, session, onPause, onFinish, onExtend, onSwap }: RentedUnitCardProps) {
  const [busy, setBusy] = useState(false);
  const endTime = estimatedEndTime(session, Date.now());

  function handlePause() {
    setBusy(true);
    onPause().finally(() => setBusy(false));
  }

  function handleFinish() {
    Alert.alert('Selesaikan sewa?', `Sesi ${unit.name} akan ditutup.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Selesaikan',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          onFinish().finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.customerName}>{session.customerName}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.category}>{unit.category}</Text>
        </View>
      </View>
      <Text style={styles.unitInfo}>{unit.name}</Text>

      <View style={styles.bottomRow}>
        <Text style={styles.endLabel}>Estimasi selesai {formatTimeOfDay(endTime)}</Text>
        <CountdownTimer session={session} style={styles.countdown} overtimeStyle={styles.countdownOvertime} />
      </View>

      <View style={styles.actions}>
        <AppPressable style={styles.extendButton} onPress={onExtend} disabled={busy}>
          <Text style={[styles.actionText, styles.extendText]}>+ Durasi</Text>
        </AppPressable>
        <AppPressable style={styles.pauseButton} onPress={handlePause} disabled={busy}>
          <Text style={styles.actionText}>Jeda</Text>
        </AppPressable>
        <AppPressable style={styles.finishButton} onPress={handleFinish} disabled={busy}>
          <Text style={styles.actionText}>Selesaikan</Text>
        </AppPressable>
      </View>
      <AppPressable style={styles.swapLink} onPress={onSwap} disabled={busy}>
        <Text style={styles.swapLinkText}>Ganti Perangkat</Text>
      </AppPressable>
    </View>
  );
}

export default memo(RentedUnitCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  categoryBadge: {
    backgroundColor: colors.primaryBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  category: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  unitInfo: {
    color: colors.textDim,
    marginTop: 2,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  endLabel: {
    fontSize: 13,
    color: colors.textDim,
  },
  countdown: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  countdownOvertime: {
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  extendButton: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
  },
  extendText: {
    color: colors.text,
  },
  pauseButton: {
    flex: 1,
    backgroundColor: colors.warning,
    borderRadius: 10,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
  },
  finishButton: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
  },
  actionText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  swapLink: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  swapLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
});
