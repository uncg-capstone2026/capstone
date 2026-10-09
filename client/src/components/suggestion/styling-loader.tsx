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

const MIN_DURATION_MS = 15000; // progress takes at least this long, then holds at 99% until the outfit is ready
const TICK_MS = 100;
const FINISH_DELAY_MS = 400; // lets the bar visibly reach 100% before moving on
const GARMENT_INTERVAL_MS = 1800;
const CIRCLE_SIZE = 150;
const BAR_WIDTH = 200;
const MASCOT_SIZE = 28;

type StylingLoaderProps = {
  ready: boolean; // the suggestion has loaded
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onFinish: () => void;
};

// Shown while StyleMe builds the outfit, or if it couldn't.
export function StylingLoader({ ready, error, onRetry, onBack, onFinish }: StylingLoaderProps) {
  const percent = useProgress(ready, !!error, onFinish);

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
              <Pressable onPress={onRetry} accessibilityRole="button" className="rounded-full bg-sage-500 px-6 py-3">
                <Text className="font-label text-base text-cream-50">Try again</Text>
              </Pressable>
              <Pressable onPress={onBack} accessibilityRole="button" className="px-4 py-2">
                <Text className="font-label text-base text-sage-600">Back</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <StatusLine percent={percent} />
            <ProgressBar percent={percent} />
            <Title />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// Eases up to 99% over MIN_DURATION_MS, then goes to 100% once the outfit is ready and calls onFinish.
function useProgress(ready: boolean, paused: boolean, onFinish: () => void) {
  const [percent, setPercent] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const finished = useRef(false);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    if (paused) return;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      if (ready && elapsed >= MIN_DURATION_MS) {
        setPercent(100);
        if (!finished.current) {
          finished.current = true;
          finishTimer = setTimeout(() => onFinishRef.current(), FINISH_DELAY_MS);
        }
        return true;
      }
      const t = Math.min(1, elapsed / MIN_DURATION_MS);
      const eased = 1 - (1 - t) * (1 - t) * 0.5 - (1 - t) * 0.5; // gentle ease-out
      setPercent(Math.min(99, Math.floor(eased * 99)));
      return false;
    };

    if (tick()) return () => clearTimeout(finishTimer);
    const interval = setInterval(() => {
      if (tick()) clearInterval(interval);
    }, TICK_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(finishTimer);
    };
  }, [ready, paused, startedAt]);

  return percent;
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

function StatusLine({ percent }: { percent: number }) {
  if (percent >= 95) {
    return (
      <Text accessibilityLiveRegion="polite" className="font-label text-sm text-sage-600">
        Almost done
      </Text>
    );
  }
  const status =
    percent < 25
      ? 'Checking the weather'
      : percent < 50
        ? 'Looking through your closet'
        : percent < 75
          ? 'Trying combinations'
          : 'Adding the finishing touches';
  return (
    <Text accessibilityLiveRegion="polite" className="font-body text-sm text-sage-500">
      {status}
    </Text>
  );
}

// A thin sage bar with the mascot riding the end of the fill.
function ProgressBar({ percent }: { percent: number }) {
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming((percent / 100) * BAR_WIDTH, { duration: 250 });
  }, [percent, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: fill.value }));
  const mascotStyle = useAnimatedStyle(() => ({ transform: [{ translateX: fill.value - MASCOT_SIZE / 2 }] }));

  return (
    <View
      className="flex-row items-center gap-6"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <View className="justify-center" style={{ width: BAR_WIDTH, height: MASCOT_SIZE }}>
        <View className="h-1.5 overflow-hidden rounded-full bg-sage-100">
          <Animated.View className="h-full rounded-full bg-sage-500" style={fillStyle} />
        </View>
        <Animated.View className="absolute left-0 top-0" style={mascotStyle}>
          <Image
            source={require('@/assets/images/styleme-mascot-thinking.png')}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            style={{ width: MASCOT_SIZE, height: MASCOT_SIZE, transform: [{ translateY: -6 }] }}
          />
        </Animated.View>
      </View>
      <Text className="w-9 font-label text-xs text-sage-600">{percent}%</Text>
    </View>
  );
}

function Title() {
  return (
    <View className="flex-row items-end justify-center">
      <Text accessibilityRole="header" className="shrink text-center font-heading text-lg leading-[26px] text-sage-800" numberOfLines={1} adjustsFontSizeToFit>
        Putting your outfit together
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
