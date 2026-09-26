import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '@/services/auth';

export default function SettingsScreen() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      // Go to login even if clearing the token failed, so the button never looks stuck.
    }
    router.replace('/login');
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <View className="items-center gap-1 px-6 pb-4 pt-2">
        <Text className="font-heading text-lg tracking-wide text-sage-600">StyleMe</Text>
        <Text className="font-heading text-3xl text-sage-700">Settings</Text>
      </View>

      <View className="flex-1 justify-between px-6 pb-8 pt-4">
        <Text className="text-center font-body text-base text-sage-500">More settings coming soon.</Text>

        <Pressable
          onPress={handleSignOut}
          disabled={isSigningOut}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-sage-200 bg-cream-50 py-3 disabled:opacity-60">
          {isSigningOut ? (
            <ActivityIndicator color="#4d5d3f" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={18} color="#4d5d3f" />
              <Text className="font-label text-base text-sage-700">Sign Out</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
