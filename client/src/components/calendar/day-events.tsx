import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { OutfitCover } from '@/components/outfits/outfit-cover';
import { useOutfitColors } from '@/hooks/use-outfit-colors';
import type { CalendarEntry } from '@/services/calendar';

// The selected day's planned outfits. Each row opens that outfit.
export function DayEvents({ entries }: { entries: CalendarEntry[] }) {
  const colorFor = useOutfitColors();

  if (entries.length === 0) {
    return <Text className="font-body text-sm text-sage-500">Nothing planned for this day.</Text>;
  }

  return (
    <View className="gap-2">
      {entries.map((entry) => {
        const title = entry.eventName ?? entry.outfit.name;
        const subtitle = entry.eventName ? entry.outfit.name : null;
        return (
          <Pressable
            key={entry.id}
            onPress={() => router.push(`/outfit/${entry.outfit.id}`)}
            accessibilityRole="button"
            accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
            accessibilityHint="Opens the outfit"
            className="flex-row items-center gap-3 rounded-2xl bg-cream-50 p-3 active:opacity-80">
            <View
              style={{ backgroundColor: colorFor(entry.outfit.id) }}
              className="h-16 w-16 overflow-hidden rounded-xl p-1.5">
              <OutfitCover items={entry.outfit.items} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="font-label text-base text-sage-800" numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text className="font-body text-sm text-sage-500" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#93aa7d" />
          </Pressable>
        );
      })}
    </View>
  );
}
