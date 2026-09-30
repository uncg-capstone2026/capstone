import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTemperatureUnit } from '@/hooks/use-temperature-unit';
import { signOut } from '@/services/auth';
import type { TemperatureUnit } from '@/services/preferences';

const TEMPERATURE_OPTIONS: { unit: TemperatureUnit; label: string }[] = [
  { unit: 'F', label: '°F' },
  { unit: 'C', label: '°C' },
];

export default function SettingsScreen() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { unit, setUnit } = useTemperatureUnit();

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
        <View className="gap-6">
          <View className="flex-row items-center justify-between">
            <Text className="font-label text-base text-sage-700">Temperature</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Temperature unit"
              className="flex-row rounded-xl border border-sage-200 bg-cream-50 p-1">
              {TEMPERATURE_OPTIONS.map((option) => {
                const selected = option.unit === unit;
                return (
                  <Pressable
                    key={option.unit}
                    onPress={() => setUnit(option.unit)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className={`rounded-lg px-4 py-1.5 ${selected ? 'bg-sage-600' : ''}`}>
                    <Text className={`font-label text-base ${selected ? 'text-cream-50' : 'text-sage-700'}`}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text className="text-center font-body text-base text-sage-500">More settings coming soon.</Text>
        </View>

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
