import type { ReactElement } from 'react';
import { FlatList, View } from 'react-native';

import { AddItemTile } from '@/components/closet/add-item-tile';
import { ItemCard } from '@/components/closet/item-card';
import type { ClosetItem } from '@/services/items';

type ClosetGridProps = {
  items: ClosetItem[];
  onAddPress: () => void;
  isClosetEmpty: boolean;
  header?: ReactElement | null;
};

type Tile = { kind: 'add' } | { kind: 'item'; item: ClosetItem };

// Two-column grid of square tiles, with the Add tile always first. It's a FlatList so only
// the tiles near the screen load their images, instead of the whole closet at once.
export function ClosetGrid({ items, onAddPress, isClosetEmpty, header }: ClosetGridProps) {
  const tiles: Tile[] = [{ kind: 'add' }, ...items.map((item) => ({ kind: 'item' as const, item }))];

  return (
    <FlatList
      data={tiles}
      keyExtractor={(tile) => (tile.kind === 'add' ? 'add' : tile.item.id)}
      numColumns={2}
      ListHeaderComponent={header ?? undefined}
      contentContainerClassName="gap-3 px-6 pb-8 pt-4"
      columnWrapperClassName="justify-between"
      renderItem={({ item: tile }) => (
        <View className="w-[48%]">
          {tile.kind === 'add' ? (
            <AddItemTile onPress={onAddPress} isClosetEmpty={isClosetEmpty} />
          ) : (
            <ItemCard item={tile.item} />
          )}
        </View>
      )}
    />
  );
}
