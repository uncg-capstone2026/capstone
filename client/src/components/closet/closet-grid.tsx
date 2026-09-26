import { View } from 'react-native';

import { AddItemTile } from '@/components/closet/add-item-tile';
import { ItemCard } from '@/components/closet/item-card';
import type { ClosetItem } from '@/services/items';

type ClosetGridProps = {
  items: ClosetItem[];
  onAddPress: () => void;
  isClosetEmpty: boolean;
};

// Two-column grid of square tiles, with the Add tile always first.
export function ClosetGrid({ items, onAddPress, isClosetEmpty }: ClosetGridProps) {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      <View className="w-[48%]">
        <AddItemTile onPress={onAddPress} isClosetEmpty={isClosetEmpty} />
      </View>
      {items.map((item) => (
        <View key={item.id} className="w-[48%]">
          <ItemCard item={item} />
        </View>
      ))}
    </View>
  );
}
