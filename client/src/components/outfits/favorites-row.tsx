import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { GOLD } from '@/components/closet/category-filter';
import { formatOutfitCount } from '@/services/outfits';

type FavoritesRowProps = {
  count: number;
  onPress: () => void;
};

// The built-in Favorites collection. It fills itself from starred outfits, so it can't be
// renamed or deleted and has no edit controls.
export function FavoritesRow({ count, onPress }: FavoritesRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Favorites, ${formatOutfitCount(count)}, updates automatically`}
      className="flex-row items-center gap-3 rounded-2xl bg-sage-800 px-4 py-3.5 active:opacity-90">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-sage-700">
        <Ionicons name="star" size={18} color={GOLD} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-label text-base text-cream-50">Favorites</Text>
        <Text className="font-body text-xs text-sage-200">
          {formatOutfitCount(count)} · updates automatically
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#d3ddc5" />
    </Pressable>
  );
}
