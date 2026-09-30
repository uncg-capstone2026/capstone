import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatDayLabel } from '@/utils/dates';

// The tappable "DAY" field. Styled like the app's text inputs.
export function DayBox({
  value,
  onPress,
  children,
}: {
  value: Date;
  onPress?: () => void;
  children?: ReactNode; // the web build overlays its native <input type="date"> here
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Day: ${formatDayLabel(value)}`}
      accessibilityHint="Opens a calendar to pick a day"
      className="flex-row items-center justify-between rounded-xl border border-sage-200 bg-cream-50 px-4 py-3">
      <Text className="font-body text-base text-sage-800">{formatDayLabel(value)}</Text>
      <View className="flex-row items-center gap-1">
        <Ionicons name="calendar-outline" size={18} color="#61754e" />
        <Ionicons name="chevron-down" size={16} color="#93aa7d" />
      </View>
      {children}
    </Pressable>
  );
}
