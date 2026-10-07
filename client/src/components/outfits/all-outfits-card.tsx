import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { OutfitCover } from '@/components/outfits/outfit-cover';
import { formatOutfitCount, type OutfitPreview } from '@/services/outfits';

type AllOutfitsCardProps = {
  count: number;
  cover: OutfitPreview | null;
  coverColor: string; // the cover outfit's background, as on its tile
  onPress: () => void;
};

// Dark card at the top of the Outfits tab: a small flat-lay on the left, title and count on the right.
export function AllOutfitsCard({ count, cover, coverColor, onPress }: AllOutfitsCardProps) {
  const countLabel = `${formatOutfitCount(count)} saved`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`All saved outfits, ${countLabel}`}
      className="flex-row items-center gap-4 rounded-2xl bg-sage-800 p-3 active:opacity-90">
      {/* The background is set one way only: a bg- class would override the inline colour. */}
      <View
        style={cover ? { backgroundColor: coverColor } : undefined}
        className={`h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-xl p-2 ${
          cover ? '' : 'bg-cream-50'
        }`}>
        {cover ? (
          <OutfitCover items={cover} />
        ) : (
          <Ionicons name="shirt-outline" size={28} color="#93aa7d" />
        )}
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-heading text-lg text-cream-50">All saved outfits</Text>
        <Text className="font-body text-sm text-sage-200">{countLabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#d3ddc5" />
    </Pressable>
  );
}
