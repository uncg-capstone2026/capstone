import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

type MoreDetailsProps = {
  summary: string; // what's inside, shown under the title while it's closed
  children: ReactNode;
};

// A section that starts closed, so the less-used tags don't clutter the screen.
export function MoreDetails({ summary, children }: MoreDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View className="gap-6">
      <Pressable
        onPress={() => setIsOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityHint={isOpen ? undefined : summary}
        className="flex-row items-center justify-between gap-4">
        <View className="shrink gap-0.5">
          <Text className="font-label text-base text-sage-700">More details</Text>
          {isOpen ? null : <Text className="font-body text-xs text-sage-500">{summary}</Text>}
        </View>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#61754e" />
      </Pressable>
      {isOpen ? children : null}
    </View>
  );
}
