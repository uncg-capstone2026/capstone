import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComingSoon } from '@/components/coming-soon';

const TITLES: Record<string, string> = {
  all: 'All saved outfits',
  favorites: 'Favorites',
};

// Placeholder so the Outfits tab's cards have somewhere to go. `id` is "all", "favorites" or a
// collection id.
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View className="flex-1 bg-cream-100">
      <ComingSoon title={TITLES[id] ?? 'Collection'} message="This collection's outfits are coming soon." />
      <SafeAreaView edges={['top']} className="absolute left-0 top-0 px-4 pt-1">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/outfits'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center">
          <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
