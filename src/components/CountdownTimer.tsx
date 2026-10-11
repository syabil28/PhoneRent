import { memo } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Text, TextStyle } from 'react-native';
import { remainingMinutes } from '../utils/billing';
import { formatCountdown } from '../utils/format';
import { useNow } from '../utils/ticker';
import type { RentalSession } from '../types/models';

interface CountdownTimerProps {
  session: RentalSession;
  style?: TextStyle;
  overtimeStyle?: TextStyle;
}

function CountdownTimer({ session, style, overtimeStyle }: CountdownTimerProps) {
  const isFocused = useIsFocused();
  const now = useNow(isFocused);
  const remaining = remainingMinutes(session, now);
  const isOvertime = remaining < 0;

  return (
    <Text
      style={[style, isOvertime && overtimeStyle]}
      accessibilityLabel={`${isOvertime ? 'Melewati waktu' : 'Sisa waktu'} ${formatCountdown(Math.abs(remaining))}`}
    >
      {formatCountdown(remaining)}
    </Text>
  );
}

export default memo(CountdownTimer);
