import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OVERLAY_BG } from '@/components/suggestion/outfit-stage';
import { StylingLoader } from '@/components/suggestion/styling-loader';
import { TryOnSpinner } from '@/components/try-on/try-on-spinner';
import { SessionExpiredError } from '@/services/api';
import { getBodyPhoto } from '@/services/photos';
import { tryOn, TryOnError, type TryOnResult } from '@/services/stylist';

const LOADER_STATUSES = [
  'Looking at your photo',
  'Laying out the pieces',
  'Dressing you up',
  'Turning you around',
  'Adding the finishing touches',
];

// How often to check whether the server has made the user's other angles.
const ANGLES_POLL_MS = 5000;

// A 360° spin of the user wearing the outfit, opened from "See it on your photo" on a suggestion
// or "Try on" on a saved outfit. `itemIds` are the pieces on that screen, comma-separated.
// The server saves the frames, so the first visit for an outfit is slow and later ones are quick.
// Just after a new photo upload the server is still making the other angles: the front shows
// on its own until they're ready, then the spin is fetched and swapped in.
export default function TryOnScreen() {
  const params = useLocalSearchParams<{ itemIds?: string; name?: string }>();
  const itemIdsParam = params.itemIds ?? '';
  const name = params.name;
  const itemIds = useMemo(() => itemIdsParam.split(',').filter(Boolean), [itemIdsParam]);

  const [result, setResult] = useState<TryOnResult | null>(null);
  const [isMakingSpin, setIsMakingSpin] = useState(false); // the front is showing, the angles aren't ready yet
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
      // Checked first so a missing or old photo doesn't cost an AI request.
      const bodyPhoto = await getBodyPhoto();
      if (!bodyPhoto) throw new TryOnError('Add try-on photos to see outfits on you.', 'no-photo');
      if (bodyPhoto.needsRetake) {
        throw new TryOnError(
          'Try-on now shows outfits from every angle. Retake your try-on photos, front and back, to use it.',
          'needs-retake',
        );
      }
      const next = await tryOn(itemIds);
      await preloadFrames(next);
      if (!mounted.current) return;
      setResult(next);
      setIsMakingSpin(!bodyPhoto.anglesReady);
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
      if (!result) generate();
    }, [result, generate]),
  );

  // Once the angles are ready, fetches the spin (generating the other frames) and swaps it in.
  // Any failure leaves the front showing.
  useEffect(() => {
    if (!isMakingSpin) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const bodyPhoto = await getBodyPhoto();
        if (cancelled) return;
        if (!bodyPhoto?.anglesReady) {
          timer = setTimeout(check, ANGLES_POLL_MS);
          return;
        }
        const next = await tryOn(itemIds);
        await preloadFrames(next);
        if (!cancelled) setResult(next);
      } catch {
        // Keeps the front.
      }
      if (!cancelled) setIsMakingSpin(false);
    }
    timer = setTimeout(check, ANGLES_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isMakingSpin, itemIds]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/stylist');
  }

  function openBodyPhoto() {
    router.push({ pathname: '/body-photo', params: { from: 'try-on' } });
  }

  if (!result || !isLoaderDone) {
    const errorAction =
      error?.reason === 'no-photo'
        ? { label: 'Add try-on photos', onPress: openBodyPhoto }
        : error?.reason === 'needs-retake' || error?.reason === 'photo-unusable'
          ? { label: 'Retake your photos', onPress: openBodyPhoto }
          : undefined;
    return (
      <StylingLoader
        key={attempt}
        ready={!!result}
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

  const hasSpin = result.frames.filter((frame) => frame.imageUrl).length > 1;

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
        <TryOnSpinner
          frames={result.frames}
          accessibilityLabel={name ? `You wearing ${name}` : 'You wearing this outfit'}
        />
        <View
          pointerEvents="none"
          style={{ backgroundColor: OVERLAY_BG }}
          className="absolute right-3 top-3 flex-row items-center gap-1.5 rounded-full px-3 py-1.5">
          {isMakingSpin ? <ActivityIndicator size="small" color="#7a9264" /> : null}
          <Text className="font-label text-[11px] uppercase tracking-widest text-sage-500">
            {isMakingSpin ? 'Making your 360° view' : hasSpin ? 'Drag to turn' : 'On your photo'}
          </Text>
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

// Loads every frame's image before the spin shows, so it doesn't flicker as each one loads.
// If any fail, the spin shows anyway and those frames load as they're reached.
async function preloadFrames(result: TryOnResult): Promise<void> {
  const urls = result.frames.flatMap((frame) => (frame.imageUrl ? [frame.imageUrl] : []));
  await Image.prefetch(urls, 'memory-disk').catch(() => false);
}
