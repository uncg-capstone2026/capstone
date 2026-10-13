import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { OutfitCover } from '@/components/outfits/outfit-cover';
import { useOutfitColors } from '@/hooks/use-outfit-colors';
import type { CalendarEntry } from '@/services/calendar';
import { toDateKey } from '@/utils/dates';

type DayEventsProps = {
  entries: CalendarEntry[];
  updatingId: string | null; // the entry whose "Didn't wear it" is being saved
  onSetNotWorn: (entry: CalendarEntry, notWorn: boolean) => void;
};

// The selected day's planned outfits. Each row opens that outfit. On days that have passed,
// each row also has "Didn't wear it" (or Undo once marked).
export function DayEvents({ entries, updatingId, onSetNotWorn }: DayEventsProps) {
  const colorFor = useOutfitColors();
  const today = toDateKey(new Date());

  if (entries.length === 0) {
    return <Text className="font-body text-sm text-sage-500">Nothing planned for this day.</Text>;
  }

  return (
    <View className="gap-2">
      {entries.map((entry) => {
        const title = entry.eventName ?? entry.outfit.name;
        const subtitle = entry.eventName ? entry.outfit.name : null;
        const isPast = entry.date < today;
        const updating = updatingId === entry.id;
        return (
          <View key={entry.id} className="overflow-hidden rounded-2xl bg-cream-50">
            <Pressable
              onPress={() => router.push(`/outfit/${entry.outfit.id}`)}
              accessibilityRole="button"
              accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
              accessibilityHint="Opens the outfit"
              className="flex-row items-center gap-3 p-3 active:opacity-80">
              <View
                style={{ backgroundColor: colorFor(entry.outfit.id) }}
                className={`h-16 w-16 overflow-hidden rounded-xl p-1.5 ${entry.notWorn ? 'opacity-50' : ''}`}>
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

            {isPast ? (
              <View className="flex-row items-center justify-between border-t border-cream-200 px-3 py-2.5">
                <View
                  className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${
                    entry.notWorn ? 'bg-cream-300' : 'bg-sage-100'
                  }`}>
                  <Ionicons name={entry.notWorn ? 'close' : 'checkmark'} size={13} color="#4d5d3f" />
                  <Text className="font-label text-[11px] text-sage-700">
                    {entry.notWorn ? "Didn't wear" : 'Worn'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onSetNotWorn(entry, !entry.notWorn)}
                  disabled={updatingId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={entry.notWorn ? `Undo didn't wear ${title}` : `Didn't wear ${title}`}
                  accessibilityState={{ busy: updating }}
                  hitSlop={6}
                  className="h-9 min-w-[124px] flex-row items-center justify-center gap-1.5 rounded-full border border-sage-300 bg-cream-50 px-3.5 active:bg-sage-100 disabled:opacity-60">
                  {updating ? (
                    <ActivityIndicator size="small" color="#7a9264" />
                  ) : (
                    <>
                      <Ionicons
                        name={entry.notWorn ? 'arrow-undo-outline' : 'close-circle-outline'}
                        size={15}
                        color="#4d5d3f"
                      />
                      <Text className="font-label text-sm text-sage-700">
                        {entry.notWorn ? 'Undo' : "Didn't wear it"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
