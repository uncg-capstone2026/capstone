import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryFilter } from '@/components/closet/category-filter';
import { ClosetGrid } from '@/components/closet/closet-grid';
import { ClosetTip } from '@/components/closet/closet-tip';
import { filterItems, listItems, type ClosetFilter, type ClosetItem } from '@/services/items';

const MIN_ITEMS_FOR_SUGGESTIONS = 5;

export default function ClosetScreen() {
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [filter, setFilter] = useState<ClosetFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reload whenever the closet comes back into view, e.g. after adding an item.
  useFocusEffect(
    useCallback(() => {
      setError(null);
      listItems()
        .then(setItems)
        .catch((e) => setError(e instanceof Error ? e.message : 'Something went wrong.'))
        .finally(() => setIsLoading(false));
    }, []),
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <View className="items-center gap-1 px-6 pb-4 pt-2">
        <Text className="font-heading text-lg tracking-wide text-sage-600">StyleMe</Text>
        <Text className="font-heading text-3xl text-sage-700">Your Closet</Text>
      </View>

      <View>
        <CategoryFilter selected={filter} onSelect={setFilter} />
      </View>

      <ScrollView contentContainerClassName="gap-4 px-6 pb-8 pt-4">
        {items.length < MIN_ITEMS_FOR_SUGGESTIONS && !isLoading ? <ClosetTip /> : null}
        {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator color="#7a9264" className="mt-8" />
        ) : (
          <ClosetGrid
            items={filterItems(items, filter)}
            onAddPress={() => router.push('/add-item')}
            isClosetEmpty={items.length === 0}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
