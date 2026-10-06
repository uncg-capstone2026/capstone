import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

// Always the first card in the collections grid. Opens the "New collection" sheet.
export function NewCollectionCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New collection"
      style={{ aspectRatio: 1 }}
      className="w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-sage-300 active:opacity-70">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-sage-800">
        <Ionicons name="add" size={26} color="#fffdf9" />
      </View>
      <Text className="font-label text-sm text-sage-500">New collection</Text>
    </Pressable>
  );
}
