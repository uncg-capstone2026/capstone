import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text } from 'react-native';

import { CLOSET_FILTERS, type ClosetFilter } from '@/services/items';

export const GOLD = '#d4a72c';

type CategoryFilterProps = {
  selected: ClosetFilter;
  onSelect: (filter: ClosetFilter) => void;
};

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-6">
      {CLOSET_FILTERS.map(({ key, label }) => {
        const isSelected = key === selected;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={`flex-row items-center gap-1.5 rounded-full border px-4 py-2 ${
              isSelected ? 'border-sage-500 bg-sage-500' : 'border-sage-200 bg-cream-50'
            }`}>
            {key === 'favorites' ? <Ionicons name="star" size={14} color={GOLD} /> : null}
            <Text className={isSelected ? 'font-label text-cream-50' : 'font-body text-sage-600'}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
