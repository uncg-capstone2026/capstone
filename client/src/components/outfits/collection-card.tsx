import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { OutfitCover } from '@/components/outfits/outfit-cover';
import { formatOutfitCount, type OutfitCollection } from '@/services/outfits';

type CollectionCardProps = {
  collection: OutfitCollection;
  coverColor: string; // the cover outfit's background, as on its tile
  isEditing: boolean;
  onPress: () => void; // opens the collection, or renames it in edit mode
  onDelete: () => void;
};

// Square card with the collection's latest outfit as a flat-lay, then its name and count.
export function CollectionCard({ collection, coverColor, isEditing, onPress, onDelete }: CollectionCardProps) {
  const isEmpty = collection.cover === null;
  const countLabel = isEmpty ? 'Add outfits' : formatOutfitCount(collection.outfitCount);

  return (
    <View style={{ aspectRatio: 1 }} className="w-full">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${collection.name}, ${countLabel}`}
        accessibilityHint={isEditing ? 'Renames the collection' : undefined}
        className="flex-1 gap-2 overflow-hidden rounded-2xl border border-sage-300 bg-cream-50 p-3 active:opacity-80">
        {collection.cover ? (
          <View style={{ backgroundColor: coverColor }} className="flex-1 overflow-hidden rounded-xl p-2">
            <OutfitCover items={collection.cover} />
          </View>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="albums-outline" size={30} color="#b3c49f" />
          </View>
        )}
        <View>
          <View className="flex-row items-center gap-1">
            <Text className={`shrink font-label text-sage-800 ${cardNameSize(collection.name)}`}>
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

// Long names get a smaller size so all 40 characters fit on a card on the smallest iPhones
// (about 17 characters a line at text-sm). Sized by length rather than adjustsFontSizeToFit,
// which leaves a gap under shrunk text on iOS.
function cardNameSize(name: string): string {
  return name.length > 30 ? 'text-xs' : 'text-sm';
}
