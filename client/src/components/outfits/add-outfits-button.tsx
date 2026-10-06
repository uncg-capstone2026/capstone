import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

// Dashed button above the outfit grid in edit mode. Opens the "Add outfits" picker.
export function AddOutfitsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sage-300 py-3.5 active:opacity-70">
      <Ionicons name="add" size={20} color="#4d5d3f" />
      <Text className="font-label text-base text-sage-700">Add from all saved outfits</Text>
    </Pressable>
  );
}
