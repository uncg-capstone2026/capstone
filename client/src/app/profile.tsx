import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComingSoon } from '@/components/coming-soon';

// Placeholder so the Settings profile card has somewhere to go.
export default function ProfileScreen() {
  return (
    <View className="flex-1 bg-cream-100">
      <ComingSoon title="Profile" message="Editing your profile is coming soon." />
      <SafeAreaView edges={['top']} className="absolute left-0 top-0 px-4 pt-1">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center">
          <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
