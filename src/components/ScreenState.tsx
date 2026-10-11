import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import AppPressable from './AppPressable';

interface ScreenStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function ScreenState({ title, message, actionLabel, onAction }: ScreenStateProps) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <AppPressable style={styles.action} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </AppPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 360,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: colors.textDim,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    textAlign: 'center',
  },
  action: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 20,
  },
  actionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
