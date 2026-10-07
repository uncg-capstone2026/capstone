import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { ScheduledDate } from '@/services/outfits';
import { formatDayLabel, fromDateKey, toDateKey } from '@/utils/dates';

type ScheduledListProps = {
  scheduled: ScheduledDate[];
  removingId: string | null;
  onAdd: () => void;
  onRemove: (entry: ScheduledDate) => void;
};

// The outfit's planned days: upcoming first (soonest at the top), then past ones (most recent
// first). Each entry is its own row, even two on the same day.
export function ScheduledList({ scheduled, removingId, onAdd, onRemove }: ScheduledListProps) {
  const today = toDateKey(new Date());
  const upcoming = scheduled.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = scheduled.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-label text-xs uppercase tracking-widest text-sage-500">Scheduled</Text>
        <Pressable onPress={onAdd} accessibilityRole="button" hitSlop={8}>
          <Text className="font-label text-sm text-sage-700 underline">Add a date</Text>
        </Pressable>
      </View>

      {scheduled.length === 0 ? (
        <Text className="font-body text-sm text-sage-500">Not on the calendar yet.</Text>
      ) : (
        [...upcoming, ...past].map((entry) => {
          const day = formatDayLabel(fromDateKey(entry.date));
          return (
            <View
              key={entry.id}
              className={`flex-row items-center gap-3 rounded-2xl bg-cream-50 px-4 py-3 ${
                removingId === entry.id ? 'opacity-50' : ''
              }`}>
              <View className="flex-1 gap-0.5">
                <Text className="font-label text-base text-sage-800">{day}</Text>
                {entry.eventName ? <Text className="font-body text-sm text-sage-500">{entry.eventName}</Text> : null}
              </View>
              <Pressable
                onPress={() => onRemove(entry)}
                disabled={removingId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${day}${entry.eventName ? `, ${entry.eventName}` : ''}`}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center">
                <Ionicons name="close" size={18} color="#61754e" />
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
}
