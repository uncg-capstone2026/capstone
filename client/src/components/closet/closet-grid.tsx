import { View } from 'react-native';

import { AddItemTile } from '@/components/closet/add-item-tile';
import { ItemCard } from '@/components/closet/item-card';
import { DEFAULT_ITEM_ASPECT_RATIO, type ClosetItem } from '@/services/items';

type ClosetGridProps = {
  items: ClosetItem[];
  onAddPress: () => void;
  isClosetEmpty: boolean;
};

// Two-column masonry: each tile goes into whichever column is currently shorter.
// Heights are compared in "column widths" (1 / aspectRatio), so no measuring is needed.
export function ClosetGrid({ items, onAddPress, isClosetEmpty }: ClosetGridProps) {
  const columns: ClosetItem[][] = [[], []];
  const heights = [1 / DEFAULT_ITEM_ASPECT_RATIO, 0]; // the Add tile starts the left column

  for (const item of items) {
    const column = heights[0] <= heights[1] ? 0 : 1;
    columns[column].push(item);
    heights[column] += 1 / (item.aspectRatio ?? DEFAULT_ITEM_ASPECT_RATIO);
  }

  return (
    <View className="flex-row gap-3">
      {columns.map((columnItems, index) => (
        <View key={index} className="flex-1 gap-3">
          {index === 0 ? <AddItemTile onPress={onAddPress} isClosetEmpty={isClosetEmpty} /> : null}
          {columnItems.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </View>
      ))}
    </View>
  );
}
