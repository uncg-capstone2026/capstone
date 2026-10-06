import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { OutfitCover } from '@/components/outfits/outfit-cover';
import { formatOutfitCount, type OutfitCollection } from '@/services/outfits';

type CollectionCardProps = {
  collection: OutfitCollection;
  isEditing: boolean;
  onPress: () => void; // opens the collection, or renames it in edit mode
  onDelete: () => void;
};

// Square card with the collection's latest outfit as a flat-lay, then its name and count.
export function CollectionCard({ collection, isEditing, onPress, onDelete }: CollectionCardProps) {
  const isEmpty = collection.cover === null;
  const countLabel = isEmpty ? 'Add outfits' : formatOutfitCount(collection.outfitCount);

  return (
    <View style={{ aspectRatio: 1 }} className="w-full">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${collection.name}, ${countLabel}`}
        accessibilityHint={isEditing ? 'Renames the collection' : undefined}
        className="flex-1 gap-2 overflow-hidden rounded-2xl bg-cream-50 p-3 active:opacity-80">
        <View className="flex-1 items-center justify-center">
          {collection.cover ? (
            <OutfitCover items={collection.cover} />
          ) : (
            <Ionicons name="albums-outline" size={30} color="#b3c49f" />
          )}
        </View>
        <View>
          <View className="flex-row items-center gap-1">
            <Text numberOfLines={1} className="shrink font-label text-sm text-sage-800">
              {collection.name}
            </Text>
            {isEditing ? <Ionicons name="pencil" size={12} color="#7a9264" /> : null}
          </View>
          <Text className={`font-body text-xs ${isEmpty ? 'text-sage-400' : 'text-sage-500'}`}>{countLabel}</Text>
        </View>
      </Pressable>

      {isEditing ? (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${collection.name}`}
          hitSlop={8}
          className="absolute -right-1.5 -top-1.5 h-7 w-7 items-center justify-center rounded-full border-2 border-cream-100 bg-red-700">
          <Ionicons name="remove" size={16} color="#fffdf9" />
        </Pressable>
      ) : null}
    </View>
  );
}
