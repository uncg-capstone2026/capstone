import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

type CollectionChipsProps = {
  collections: { id: string; name: string }[];
};

// "In collections": a chip for each collection the outfit is in. Tapping one opens it.
export function CollectionChips({ collections }: CollectionChipsProps) {
  return (
    <View className="gap-2">
      <Text className="font-label text-xs uppercase tracking-widest text-sage-500">In collections</Text>
      {collections.length === 0 ? (
        <Text className="font-body text-sm text-sage-500">Not in any collections yet.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {collections.map((collection) => (
            <Pressable
              key={collection.id}
              onPress={() => router.push({ pathname: '/collection/[id]', params: { id: collection.id } })}
              accessibilityRole="button"
              className="rounded-full border border-sage-200 bg-cream-50 px-4 py-2">
              <Text className="font-body text-sm text-sage-700">{collection.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
