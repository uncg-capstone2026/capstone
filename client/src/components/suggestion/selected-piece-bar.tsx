import { Pressable, Text, View } from 'react-native';

import { CATEGORY_OPTIONS } from '@/services/items';
import type { SuggestedPiece } from '@/services/stylist';

type SelectedPieceBarProps = {
  piece: SuggestedPiece;
  onViewItem: () => void;
};

// Shown in single-piece view: what the piece is, and a way to open its details.
export function SelectedPieceBar({ piece, onViewItem }: SelectedPieceBarProps) {
  const category = CATEGORY_OPTIONS.find((option) => option.key === piece.category)?.label;

  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-cream-50 px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="font-label text-base text-sage-800">
          {piece.name}
        </Text>
        {category ? <Text className="font-body text-sm text-sage-500">{category}</Text> : null}
      </View>
      <Pressable
        onPress={onViewItem}
        accessibilityRole="button"
        accessibilityLabel={`View ${piece.name}`}
        className="rounded-full bg-sage-500 px-4 py-2">
        <Text className="font-label text-sm text-cream-50">View item</Text>
      </Pressable>
    </View>
  );
}
