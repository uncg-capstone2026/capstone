import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayEvents } from '@/components/calendar/day-events';
import { MonthGrid, type DayMark } from '@/components/calendar/month-grid';
import { WeatherCard } from '@/components/stylist/weather-card';
import { SessionExpiredError } from '@/services/api';
import { getCalendarEntries, type CalendarEntry } from '@/services/calendar';
import { formatDayLabel, startOfToday, toDateKey } from '@/utils/dates';

// A month of planned outfits. Opens on today; tapping a day shows its weather (within the
// 7-day forecast) and the outfits planned for it.
export default function CalendarScreen() {
  const [selected, setSelected] = useState(startOfToday);
  const [month, setMonth] = useState(() => firstOfMonth(startOfToday()));
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The visible month's entries. Returns a cleanup that ignores a reply that comes in late.
  const load = useCallback(() => {
    let cancelled = false;
    const from = toDateKey(month);
    const to = toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    setLoading(true);
    setError(null);
    getCalendarEntries(from, to)
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch((e) => {
        if (cancelled || e instanceof SessionExpiredError) return;
        setEntries([]);
        setError(e instanceof Error ? e.message : 'Could not load your calendar. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  // Reload on focus too, so changes made on the outfit screen show on the way back.
  useFocusEffect(load);

  const marks = useMemo(() => {
    const todayKey = toDateKey(new Date());
    const result = new Map<string, DayMark>();
    for (const entry of entries) {
      const existing = result.get(entry.date);
      result.set(entry.date, {
        when: entry.date < todayKey ? 'past' : 'upcoming',
        count: (existing?.count ?? 0) + 1,
      });
    }
    return result;
  }, [entries]);

  const selectedKey = toDateKey(selected);
  const dayEntries = entries.filter((entry) => entry.date === selectedKey);

  function selectDay(date: Date) {
    setSelected(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(firstOfMonth(date));
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <ScrollView contentContainerClassName="gap-5 px-6 pb-10 pt-6">
        <Text accessibilityRole="header" className="font-heading text-3xl text-sage-700">
          Calendar
        </Text>

        <MonthGrid
          month={month}
          selected={selected}
          marks={marks}
          onSelectDay={selectDay}
          onChangeMonth={setMonth}
        />

        <WeatherCard date={selected} />

        <View className="gap-2">
          <Text className="font-label text-xs uppercase tracking-wider text-sage-500">
            {formatDayLabel(selected)}
          </Text>
          {loading ? (
            <ActivityIndicator color="#7a9264" style={{ paddingVertical: 16 }} />
          ) : error ? (
            <View className="gap-2">
              <Text className="font-body text-sm text-red-700">{error}</Text>
              <Pressable onPress={() => load()} accessibilityRole="button" hitSlop={8}>
                <Text className="font-label text-sm text-sage-700 underline">Try again</Text>
              </Pressable>
            </View>
          ) : (
            <DayEvents entries={dayEntries} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
