import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OVERLAY_BG } from '@/components/suggestion/outfit-stage';
import { StylingLoader } from '@/components/suggestion/styling-loader';
import { SessionExpiredError } from '@/services/api';
import { hasBodyPhoto } from '@/services/photos';
import { tryOn, TryOnError } from '@/services/stylist';

const LOADER_STATUSES = [
  'Looking at your photo',
  'Laying out the pieces',
  'Dressing you up',
  'Adding the finishing touches',
];

// The outfit on the user's try-on photo, opened from "See it on your photo" on a suggestion
// or "Try on" on a saved outfit. `itemIds` are the pieces on that screen, comma-separated.
// The photo isn't saved anywhere, so each visit generates a new one (one AI request).
export default function TryOnScreen() {
  const params = useLocalSearchParams<{ itemIds?: string; name?: string }>();
  const itemIdsParam = params.itemIds ?? '';
  const name = params.name;
  const itemIds = useMemo(() => itemIdsParam.split(',').filter(Boolean), [itemIdsParam]);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<TryOnError | null>(null);
  const [attempt, setAttempt] = useState(0); // restarts the loader on each try
  const [isLoaderDone, setIsLoaderDone] = useState(false);
  const inFlight = useRef(false); // stops a second AI request while one is running
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const generate = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setIsLoaderDone(false);
    setAttempt((n) => n + 1);
    try {
      if (!itemIds.length) throw new TryOnError('There are no pieces to try on.', 'other');
      // Checked first so a missing photo doesn't cost an AI request.
      if (!(await hasBodyPhoto())) {
        throw new TryOnError('Add a try-on photo to see outfits on you.', 'no-photo');
      }
      const result = await tryOn(itemIds);
      await Image.prefetch(result.imageUrl).catch(() => {
        // Shows it as it loads instead.
      });
      if (mounted.current) setImageUrl(result.imageUrl);
    } catch (e) {
      if (!mounted.current || e instanceof SessionExpiredError) return;
      setError(
        e instanceof TryOnError
          ? e
          : new TryOnError(e instanceof Error ? e.message : 'Something went wrong. Please try again.', 'other'),
      );
    } finally {
      inFlight.current = false;
    }
  }, [itemIds]);

  // Generates on first view, and again on coming back after a failure, e.g. from adding a try-on photo.
  useFocusEffect(
    useCallback(() => {
      if (!imageUrl) generate();
    }, [imageUrl, generate]),
  );

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/stylist');
  }

  function openBodyPhoto() {
    router.push({ pathname: '/body-photo', params: { from: 'try-on' } });
  }

  if (!imageUrl || !isLoaderDone) {
    const errorAction =
      error?.reason === 'no-photo'
        ? { label: 'Add a try-on photo', onPress: openBodyPhoto }
        : error?.reason === 'photo-unusable'
          ? { label: 'Retake your photo', onPress: openBodyPhoto }
          : undefined;
    return (
      <StylingLoader
        key={attempt}
        ready={!!imageUrl}
        error={error?.message ?? null}
        onRetry={generate}
        onBack={goBack}
        onFinish={() => setIsLoaderDone(true)}
        title="Dressing you up"
        statuses={LOADER_STATUSES}
        errorAction={errorAction}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <View className="flex-row items-center justify-between px-2">
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-11 w-11 items-center justify-center">
          <Ionicons name="arrow-back" size={24} color="#4d5d3f" />
        </Pressable>
        <Text accessibilityRole="header" className="font-label text-[11px] uppercase tracking-[0.14em] text-sage-800">
          Try on
        </Text>
        <View className="h-11 w-11" />
      </View>

      <View className="mx-[22px] mt-2 flex-1 overflow-hidden rounded-3xl bg-cream-200">
        <Image
          source={{ uri: imageUrl }}
          contentFit="contain"
          transition={200}
          accessibilityLabel={name ? `You wearing ${name}` : 'You wearing this outfit'}
          accessibilityIgnoresInvertColors
          style={{ flex: 1 }}
        />
        <View style={{ backgroundColor: OVERLAY_BG }} className="absolute right-3 top-3 rounded-full px-3 py-1.5">
          <Text className="font-label text-[11px] uppercase tracking-widest text-sage-500">On your photo</Text>
        </View>
      </View>

      <View className="gap-4 px-[22px] pb-2 pt-5">
        <View className="gap-1">
          {name ? (
            <Text className="font-heading text-[26px] leading-[34px] text-sage-800" numberOfLines={2}>
              {name}
            </Text>
          ) : null}
          <Text className="font-body text-sm text-sage-500">Proportions are approximate.</Text>
        </View>
        <Pressable onPress={goBack} accessibilityRole="button" className="items-center rounded-full bg-sage-500 py-3.5">
          <Text className="font-label text-base text-cream-50">Back to the outfit</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
