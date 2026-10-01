import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

type OutfitChipsProps = {
  // Undefined until the server sends them (see PLAN.md), which shows the same as none.
  outfits?: { id: string; name: string }[];
};

// "Saved in outfits": a chip for each outfit that uses this item. Tapping one opens it.
export function OutfitChips({ outfits = [] }: OutfitChipsProps) {
  return (
    <View className="gap-2">
      <Text className="font-label text-base text-sage-700">Saved in outfits</Text>
      {outfits.length === 0 ? (
        <Text className="font-body text-sm text-sage-500">Not in any outfits yet.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {outfits.map((outfit) => (
            <Pressable
              key={outfit.id}
              onPress={() => router.push({ pathname: '/outfit/[id]', params: { id: outfit.id } })}
              accessibilityRole="button"
              className="rounded-full border border-sage-200 bg-cream-50 px-4 py-2">
              <Text className="font-body text-sm text-sage-700">{outfit.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
