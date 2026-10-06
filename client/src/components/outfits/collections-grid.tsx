import { View } from 'react-native';

import { CollectionCard } from '@/components/outfits/collection-card';
import { NewCollectionCard } from '@/components/outfits/new-collection-card';
import type { OutfitCollection } from '@/services/outfits';

type CollectionsGridProps = {
  collections: OutfitCollection[];
  isEditing: boolean;
  onNewPress: () => void;
  onCollectionPress: (collection: OutfitCollection) => void;
  onCollectionDelete: (collection: OutfitCollection) => void;
};

// Two-column grid of square cards, with the New collection card always first.
export function CollectionsGrid({
  collections,
  isEditing,
  onNewPress,
  onCollectionPress,
  onCollectionDelete,
}: CollectionsGridProps) {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      <View className="w-[48%]">
        <NewCollectionCard onPress={onNewPress} />
      </View>
      {collections.map((collection) => (
        <View key={collection.id} className="w-[48%]">
          <CollectionCard
            collection={collection}
            isEditing={isEditing}
            onPress={() => onCollectionPress(collection)}
            onDelete={() => onCollectionDelete(collection)}
          />
        </View>
      ))}
    </View>
  );
}
