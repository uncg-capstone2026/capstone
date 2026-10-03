import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayPicker } from '@/components/stylist/day-picker';
import { WeatherCard } from '@/components/stylist/weather-card';
import { startOfToday, toDateKey } from '@/utils/dates';

const MAX_OCCASION_LENGTH = 200;

export default function StylistScreen() {
  const [date, setDate] = useState(startOfToday);
  const [occasion, setOccasion] = useState('');

  // If the app stayed open past midnight, yesterday is no longer a valid choice.
  useFocusEffect(
    useCallback(() => {
      setDate((current) => (current < startOfToday() ? startOfToday() : current));
    }, []),
  );

  const canSubmit = occasion.trim().length > 0;

  // The suggestion screen asks StyleMe for the outfit and shows its own loading state.
  function handleStyle() {
    if (!canSubmit) return;
    router.push({ pathname: '/suggestion', params: { date: toDateKey(date), occasion: occasion.trim() } });
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-6 px-6 pb-10 pt-6" keyboardShouldPersistTaps="handled">
          <View className="items-center gap-3">
            <View className="h-24 w-24 items-center justify-center rounded-full bg-cream-200">
              <Image
                source={require('@/assets/images/styleme-mascot-chat-transparent.png')}
                contentFit="contain"
                accessibilityIgnoresInvertColors
                style={{ width: 60, height: 60, transform: [{ translateY: -2 }] }}
              />
            </View>
            <Text accessibilityRole="header" className="font-heading text-3xl text-sage-700">
              Plan an outfit
            </Text>
            <Text className="text-center font-body text-base text-sage-600">
              Pick a day and tell StyleMe where you&apos;re headed or what you&apos;re going for.
            </Text>
          </View>

          <View className="gap-2">
            <FieldLabel>Day</FieldLabel>
            <DayPicker value={date} onChange={setDate} />
            <WeatherCard date={date} />
          </View>

          <View className="gap-2">
            <FieldLabel>Where are you headed?</FieldLabel>
            <TextInput
              value={occasion}
              onChangeText={setOccasion}
              placeholder="e.g Dinner downtown, relaxed but polished"
              placeholderTextColor="#7a9264"
              accessibilityLabel="Where are you headed?"
              multiline
              maxLength={MAX_OCCASION_LENGTH}
              textAlignVertical="top"
              className="min-h-[88px] rounded-xl border border-sage-200 bg-cream-50 px-4 py-3 font-body text-base text-sage-800"
            />
          </View>

          <View className="gap-3">
            <Pressable
              onPress={handleStyle}
              disabled={!canSubmit}
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-2 rounded-xl bg-sage-600 py-3.5 disabled:opacity-60">
              <Text className="font-label text-base text-cream-50">Style my outfit</Text>
              <Ionicons name="arrow-forward" size={18} color="#fffdf9" />
            </Pressable>
            <Text className="text-center font-body text-xs text-sage-500">
              StyleMe builds one outfit from your closet. This chat isn&apos;t saved.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-label text-xs uppercase tracking-wider text-sage-500">{children}</Text>
  );
}
