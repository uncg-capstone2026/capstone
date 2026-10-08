import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { GOLD } from '@/components/closet/category-filter';
import type { ClosetItem } from '@/services/items';
import { isMainlyWhite, WHITE_ITEM_BACKGROUND } from '@/utils/colors';

// Tapping opens the item details screen. The closet reloads when it comes back into view.
export function ItemCard({ item }: { item: ClosetItem }) {
  const isWhite = isMainlyWhite(item.colorHex);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={item.isFavorite ? `${item.name}, favorite` : item.name}
      // The background is set one way only: a bg- class would override the inline colour.
      style={[{ aspectRatio: 1 }, isWhite && { backgroundColor: WHITE_ITEM_BACKGROUND }]}
      className={`w-full overflow-hidden rounded-2xl p-3 active:opacity-80 ${isWhite ? '' : 'bg-cream-50'}`}>
      <Image source={{ uri: item.imageUrl }} contentFit="contain" style={{ width: '100%', height: '100%' }} />
      {item.isFavorite ? (
        <View className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-cream-50/90">
          <Ionicons name="star" size={16} color={GOLD} />
        </View>
      ) : null}
    </Pressable>
  );
}
