import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { DEFAULT_ITEM_ASPECT_RATIO } from '@/services/items';

type AddItemTileProps = {
  onPress: () => void;
  isClosetEmpty: boolean;
};

export function AddItemTile({ onPress, isClosetEmpty }: AddItemTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add item"
      style={{ aspectRatio: DEFAULT_ITEM_ASPECT_RATIO }}
      className="w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-sage-300 bg-cream-50 px-3">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-sage-500">
        <Ionicons name="add" size={26} color="#fffdf9" />
      </View>
      <View className="items-center gap-0.5">
        <Text className="font-label text-base text-sage-700">Add item</Text>
        {isClosetEmpty ? (
          <Text className="text-center font-body text-xs text-sage-500">Add your first piece</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
