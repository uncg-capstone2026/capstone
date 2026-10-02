import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { GOLD } from '@/components/closet/category-filter';
import type { ClosetItem } from '@/services/items';

// Tapping opens the item details screen. The closet reloads when it comes back into view.
export function ItemCard({ item }: { item: ClosetItem }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={item.isFavorite ? `${item.name}, favorite` : item.name}
      style={{ aspectRatio: 1 }}
      className="w-full overflow-hidden rounded-2xl bg-cream-50 p-3 active:opacity-80">
      <Image source={{ uri: item.imageUrl }} contentFit="contain" style={{ width: '100%', height: '100%' }} />
      {item.isFavorite ? (
        <View className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-cream-50/90">
          <Ionicons name="star" size={16} color={GOLD} />
        </View>
      ) : null}
    </Pressable>
  );
}
