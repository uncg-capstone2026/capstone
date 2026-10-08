import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { GOLD } from '@/components/closet/category-filter';
import { toDateKey } from '@/utils/dates';

const UPCOMING_DOT = '#61754e'; // sage-600
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// 'upcoming' covers today too.
export type DayMark = { when: 'upcoming' | 'past'; count: number };

type MonthGridProps = {
  month: Date; // the first of the month shown
  selected: Date;
  marks: Map<string, DayMark>; // by YYYY-MM-DD
  onSelectDay: (date: Date) => void;
  onChangeMonth: (month: Date) => void;
};

// One month, Sunday first. Days with planned outfits get a dot under the number: green for
// today and upcoming days, gold for past ones. Built by hand since the native picker can't draw dots.
export function MonthGrid({ month, selected, marks, onSelectDay, onChangeMonth }: MonthGridProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = new Date(year, monthIndex, 1).getDay();
  const todayKey = toDateKey(new Date());
  const selectedKey = toDateKey(selected);

  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const title = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View className="gap-3 rounded-2xl bg-cream-50 px-3 pb-3 pt-4">
      <View className="flex-row items-center justify-between px-1">
        <Pressable
          onPress={() => onChangeMonth(new Date(year, monthIndex - 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center">
          <Ionicons name="chevron-back" size={20} color="#61754e" />
        </Pressable>
        <Text accessibilityRole="header" className="font-heading text-lg text-sage-800">
          {title}
        </Text>
        <Pressable
          onPress={() => onChangeMonth(new Date(year, monthIndex + 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center">
          <Ionicons name="chevron-forward" size={20} color="#61754e" />
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAYS.map((day, i) => (
          <Text key={i} className="flex-1 text-center font-label text-xs text-sage-500">
            {day}
          </Text>
        ))}
      </View>

      <View>
        {weeks.map((week, w) => (
          <View key={w} className="flex-row">
            {week.map((date, d) => {
              if (!date) return <View key={d} className="h-12 flex-1" />;
              const key = toDateKey(date);
              const mark = marks.get(key);
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;
              const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const planned = mark ? `, ${mark.count} planned ${mark.count === 1 ? 'outfit' : 'outfits'}` : '';
              return (
                <Pressable
                  key={d}
                  onPress={() => onSelectDay(date)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isToday ? 'Today, ' : ''}${label}${planned}`}
                  accessibilityState={{ selected: isSelected }}
                  className="h-12 flex-1 items-center justify-center">
                  <View
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      isSelected ? 'bg-sage-600' : isToday ? 'border border-sage-500' : ''
                    }`}>
                    <Text
                      className={`font-label text-base ${isSelected ? 'text-cream-50' : 'text-sage-800'}`}>
                      {date.getDate()}
                    </Text>
                  </View>
                  <View
                    className="mt-0.5 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: mark ? (mark.when === 'past' ? GOLD : UPCOMING_DOT) : 'transparent' }}
                  />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
