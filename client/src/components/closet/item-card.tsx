import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { View } from 'react-native';

import { GOLD } from '@/components/closet/category-filter';
import { DEFAULT_ITEM_ASPECT_RATIO, type ClosetItem } from '@/services/items';

export function ItemCard({ item }: { item: ClosetItem }) {
  return (
    <View
      accessibilityLabel={item.isFavorite ? `${item.name}, favorite` : item.name}
      style={{ aspectRatio: item.aspectRatio ?? DEFAULT_ITEM_ASPECT_RATIO }}
      className="w-full overflow-hidden rounded-2xl bg-cream-50">
      <Image source={{ uri: item.imageUrl }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
      {item.isFavorite ? (
        <View className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-cream-50/90">
          <Ionicons name="star" size={16} color={GOLD} />
        </View>
      ) : null}
    </View>
  );
}
