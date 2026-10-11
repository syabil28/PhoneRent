import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { InputMode } from '../types/models';
import { costFromDuration, durationFromNominal } from '../utils/billing';
import { formatDuration, formatRupiah, formatThousands } from '../utils/format';
import { colors } from '../theme/colors';
import AppPressable from './AppPressable';

interface DualInputToggleProps {
  hourlyRate: number;
  onChange: (mode: InputMode, minutes: number, amount: number) => void;
}

function digits2(text: string) {
  return text.replace(/[^0-9]/g, '').slice(0, 2);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export default function DualInputToggle({ hourlyRate, onChange }: DualInputToggleProps) {
  const [mode, setMode] = useState<InputMode>('duration');
  const [h, setH] = useState('00');
  const [m, setM] = useState('00');
  const [s, setS] = useState('00');
  const [amountText, setAmountText] = useState('0');

  const minutes = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0) + (parseInt(s, 10) || 0) / 60;
  const amount = parseInt(amountText, 10) || 0;

  // Fire once on mount so the parent's state matches what's actually displayed (0/0 by default).
  useEffect(() => {
    onChange('duration', 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncTimeFromMinutes(mins: number) {
    const totalSeconds = Math.round(Math.max(0, mins) * 60);
    setH(pad2(Math.floor(totalSeconds / 3600)));
    setM(pad2(Math.floor((totalSeconds % 3600) / 60)));
    setS(pad2(totalSeconds % 60));
  }

  function selectMode(next: InputMode) {
    setMode(next);
    onChange(next, minutes, amount);
  }

  function handleTimeChange(part: 'h' | 'm' | 's', text: string) {
    const clean = digits2(text);
    const setter = part === 'h' ? setH : part === 'm' ? setM : setS;
    setter(clean);
    const hh = parseInt(part === 'h' ? clean : h, 10) || 0;
    const mm = parseInt(part === 'm' ? clean : m, 10) || 0;
    const ss = parseInt(part === 's' ? clean : s, 10) || 0;
    const mins = hh * 60 + mm + ss / 60;
    const amt = costFromDuration(hourlyRate, mins);
    setAmountText(String(amt));
    onChange('duration', mins, amt);
  }

  function handleAmountChange(text: string) {
    const digitsOnly = text.replace(/[^0-9]/g, '');
    setAmountText(digitsOnly);
    const amt = parseInt(digitsOnly, 10) || 0;
    const mins = durationFromNominal(hourlyRate, amt);
    syncTimeFromMinutes(mins);
    onChange('nominal', mins, amt);
  }

  return (
    <View>
      <View style={styles.tabRow}>
        <AppPressable
          style={[styles.tab, mode === 'duration' && styles.tabActive]}
          onPress={() => selectMode('duration')}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'duration' }}
        >
          <Text style={[styles.tabText, mode === 'duration' && styles.tabTextActive]}>Waktu</Text>
        </AppPressable>
        <AppPressable
          style={[styles.tab, mode === 'nominal' && styles.tabActive]}
          onPress={() => selectMode('nominal')}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'nominal' }}
        >
          <Text style={[styles.tabText, mode === 'nominal' && styles.tabTextActive]}>Nominal</Text>
        </AppPressable>
      </View>

      {mode === 'duration' ? (
        <View>
          <Text style={styles.label}>Durasi sewa</Text>
          <View style={styles.timeRow}>
            <TextInput
              style={styles.timeInput}
              keyboardType="number-pad"
              value={h}
              selectTextOnFocus
              onChangeText={(t) => handleTimeChange('h', t)}
              maxLength={2}
              accessibilityLabel="Jam"
            />
            <Text style={styles.timeSep}>:</Text>
            <TextInput
              style={styles.timeInput}
              keyboardType="number-pad"
              value={m}
              selectTextOnFocus
              onChangeText={(t) => handleTimeChange('m', t)}
              maxLength={2}
              accessibilityLabel="Menit"
            />
            <Text style={styles.timeSep}>:</Text>
            <TextInput
              style={styles.timeInput}
              keyboardType="number-pad"
              value={s}
              selectTextOnFocus
              onChangeText={(t) => handleTimeChange('s', t)}
              maxLength={2}
              accessibilityLabel="Detik"
            />
          </View>
          <Text style={styles.inputHint}>Jam : menit : detik</Text>
          <Text style={styles.derived}>Total {formatRupiah(amount)}</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.label}>Nominal (Rp)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={formatThousands(amount)}
            onChangeText={handleAmountChange}
            accessibilityLabel="Nominal sewa dalam rupiah"
          />
          <Text style={styles.derived}>Durasi {formatDuration(minutes)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 44,
  },
  tabText: {
    color: colors.textDim,
    fontSize: 15,
    fontWeight: '600',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabTextActive: {
    color: colors.onPrimary,
    fontWeight: '800',
  },
  label: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    fontSize: 18,
    backgroundColor: colors.input,
    color: colors.text,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    flex: 1,
    minWidth: 0,
    width: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 4,
    fontSize: 20,
    textAlign: 'center',
    backgroundColor: colors.input,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  timeSep: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textDim,
  },
  derived: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },
  inputHint: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 6,
  },
});
