import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryFilter } from '@/components/closet/category-filter';
import { ClosetGrid } from '@/components/closet/closet-grid';
import { ClosetTip } from '@/components/closet/closet-tip';
import { useItemColors } from '@/hooks/use-item-colors';
import { SessionExpiredError } from '@/services/api';
import { loginWithPassword, signOut } from '@/services/auth';
import { canBuildOutfit, filterItems, listItems, type ClosetFilter, type ClosetItem } from '@/services/items';

// Dev builds only: long-pressing the heading signs in as this account (set in .env.local).
const DEV_LOGIN_EMAIL = process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL;
const DEV_LOGIN_PASSWORD = process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD;
const canDevLogin = __DEV__ && Boolean(DEV_LOGIN_EMAIL && DEV_LOGIN_PASSWORD);

export default function ClosetScreen() {
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [filter, setFilter] = useState<ClosetFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsWithColors = useItemColors(items);
  const showTip = !canBuildOutfit(items);

  const loadItems = useCallback(() => {
    setError(null);
    listItems()
      .then(setItems)
      .catch((e) => {
        if (e instanceof SessionExpiredError) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Reload whenever the closet comes back into view, e.g. after adding an item.
  useFocusEffect(loadItems);

  async function handleDevLogin() {
    setIsLoading(true);
    try {
      await signOut();
      await loginWithPassword({ mode: 'email', identifier: DEV_LOGIN_EMAIL!, password: DEV_LOGIN_PASSWORD! });
      loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <View className="px-6 pb-4 pt-2">
        <Pressable onLongPress={canDevLogin ? handleDevLogin : undefined} className="self-start">
          <Text accessibilityRole="header" className="font-heading text-4xl text-sage-800">
            Your Closet
          </Text>
        </Pressable>
      </View>

      <View>
        <CategoryFilter selected={filter} onSelect={setFilter} />
      </View>

      {isLoading ? (
        <ActivityIndicator color="#7a9264" className="mt-12" />
      ) : (
        <ClosetGrid
          items={filterItems(itemsWithColors, filter)}
          onAddPress={() => router.push('/add-item')}
          isClosetEmpty={items.length === 0}
          header={
            showTip || error ? (
              <View className="gap-4 pb-1">
                {showTip ? <ClosetTip /> : null}
                {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
