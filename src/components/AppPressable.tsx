import { useState } from 'react';
import type { PressableProps } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function AppPressable({ style, disabled, onBlur, onFocus, ...props }: PressableProps) {
  const [focused, setFocused] = useState(false);
  const isDisabled = Boolean(disabled);

  return (
    <Pressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      accessibilityState={{ ...props.accessibilityState, disabled: isDisabled }}
      disabled={isDisabled}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        focused && styles.focused,
        state.pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  focused: {
    outlineColor: colors.primary,
    outlineStyle: 'solid',
    outlineWidth: 3,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.42,
  },
});
