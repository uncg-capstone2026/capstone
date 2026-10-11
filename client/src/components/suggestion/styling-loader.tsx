import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listItems, type ClosetItem } from '@/services/items';

const MIN_DURATION_MS = 1000; // so an instant result doesn't flash the loader
const STATUS_INTERVAL_MS = 3500;
const GARMENT_INTERVAL_MS = 1800;
const CIRCLE_SIZE = 150;
const DEFAULT_TITLE = 'Putting your outfit together';
const DEFAULT_STATUSES = [
  'Checking the weather',
  'Looking through your closet',
  'Trying combinations',
  'Adding the finishing touches',
];

type StylingLoaderProps = {
  ready: boolean; // the suggestion has loaded
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onFinish: () => void; // called once it's ready and has shown for at least MIN_DURATION_MS
  title?: string;
  statuses?: string[]; // shown in turn every few seconds, stopping on the last one
  errorAction?: { label: string; onPress: () => void }; // replaces "Try again"
};

// Shown while StyleMe builds the outfit, or if it couldn't.
export function StylingLoader({
  ready,
  error,
  onRetry,
  onBack,
  onFinish,
  title = DEFAULT_TITLE,
  statuses = DEFAULT_STATUSES,
  errorAction,
}: StylingLoaderProps) {
  useFinishWhenReady(ready, onFinish);

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <View className="px-2">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-11 w-11 items-center justify-center">
          <Ionicons name="arrow-back" size={24} color="#4d5d3f" />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center gap-5 px-[30px]">
        <GarmentCircle />

        {error ? (
          <View className="items-center gap-4">
            <Text accessibilityLiveRegion="polite" className="text-center font-body text-base text-sage-700">
              {error}
            </Text>
            <View className="items-center gap-2">
              <Pressable
                onPress={errorAction?.onPress ?? onRetry}
                accessibilityRole="button"
                className="rounded-full bg-sage-500 px-6 py-3">
                <Text className="font-label text-base text-cream-50">{errorAction?.label ?? 'Try again'}</Text>
              </Pressable>
              <Pressable onPress={onBack} accessibilityRole="button" className="px-4 py-2">
                <Text className="font-label text-base text-sage-600">Back</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <StatusLine statuses={statuses} />
            <Title text={title} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// Calls onFinish once the result is ready, but not before MIN_DURATION_MS.
function useFinishWhenReady(ready: boolean, onFinish: () => void) {
  const [startedAt] = useState(() => Date.now());
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(
      () => onFinishRef.current(),
      Math.max(0, MIN_DURATION_MS - (Date.now() - startedAt)),
    );
    return () => clearTimeout(timer);
  }, [ready, startedAt]);
}

// A stone circle that fades through the pieces in the user's closet.
function GarmentCircle() {
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listItems()
      .then((closet) => {
        if (cancelled) return;
        setItems(closet);
        if (closet.length) Image.prefetch(closet.map((item) => item.imageUrl)).catch(() => {});
      })
      .catch(() => {
        // Falls back to the mascot.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const interval = setInterval(() => setIndex((i) => (i + 1) % items.length), GARMENT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [items.length]);

  const piece = items[index % Math.max(items.length, 1)];

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full bg-stone-200"
      style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}>
      {piece ? (
        <Animated.View key={piece.id} entering={FadeIn.duration(400)} exiting={FadeOut.duration(400)} className="absolute">
          <Image
            source={{ uri: piece.imageUrl }}
            contentFit="contain"
            accessibilityLabel={piece.name}
            accessibilityIgnoresInvertColors
            style={{ width: 110, height: 110 }}
          />
        </Animated.View>
      ) : (
        <Image
          source={require('@/assets/images/styleme-mascot-thinking.png')}
          contentFit="contain"
          accessibilityIgnoresInvertColors
          style={{ width: 96, height: 96 }}
        />
      )}
    </View>
  );
}

function StatusLine({ statuses }: { statuses: string[] }) {
  const [index, setIndex] = useState(0);
  const last = statuses.length - 1;

  useEffect(() => {
    if (index >= last) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), STATUS_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [index, last]);

  return (
    <Text accessibilityLiveRegion="polite" className="font-body text-sm text-sage-500">
      {statuses[Math.min(index, last)]}
    </Text>
  );
}

function Title({ text }: { text: string }) {
  return (
    <View className="-mt-2 flex-row items-end justify-center">
      <Text accessibilityRole="header" className="shrink text-center font-heading text-lg leading-[26px] text-sage-800" numberOfLines={1} adjustsFontSizeToFit>
        {text}
      </Text>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 200} />
      ))}
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300 }),
          withTiming(1, { duration: 900 - delay }),
          withTiming(0, { duration: 300 }),
          withTiming(0, { duration: delay }),
        ),
        -1,
      ),
    );
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      className="font-heading text-[22px] leading-[30px] text-sage-800"
      style={style}>
      .
    </Animated.Text>
  );
}
