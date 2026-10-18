import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MascotMessage } from '@/components/mascot-message';
import { choosePhotoSource, pickPhoto } from '@/components/photo-picker';
import { uploadBodyPhotos, type PickedPhoto } from '@/services/photos';

type Side = 'front' | 'back';

// Shown once during onboarding, and again from Settings → Try-On Photo (`?from=settings`) or
// the try-on screen (`?from=try-on`), where it has a back button instead of "Skip for now"
// and goes back to that screen after Submit.
// Takes a front and a back photo; the server makes the other angles of the 360° try-on from them.
export default function BodyPhotoScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromApp = from === 'settings' || from === 'try-on';
  const [photos, setPhotos] = useState<Record<Side, PickedPhoto | null>>({ front: null, back: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoArea, setPhotoArea] = useState<{ width: number; height: number } | null>(null);

  // Largest pair of 3:4 boxes (side by side, 12px apart, with a ~24px label under each) that fits
  // the space left over, so the screen doesn't need to scroll.
  const photoHeight = photoArea
    ? Math.min(photoArea.height - 24, ((photoArea.width - 12) / 2) * (4 / 3))
    : 0;

  async function handleAddPhoto(side: Side) {
    setError(null);
    const source = await choosePhotoSource();
    if (!source) return;
    try {
      const picked = await pickPhoto(source);
      if (picked) setPhotos((current) => ({ ...current, [side]: picked }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  async function handleSubmit() {
    if (!photos.front || !photos.back) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await uploadBodyPhotos(photos.front, photos.back);
      if (fromApp) router.back();
      else router.replace('/closet');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <ScrollView contentContainerClassName="flex-grow items-center px-6 py-4">
        <View className="w-full max-w-sm flex-1 gap-4">
          <View className="gap-1">
            {fromApp ? (
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => router.back()}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  className="-ml-2 h-10 w-10 items-center justify-center">
                  <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
                </Pressable>
                <Text className="flex-1 text-center font-label text-[11px] uppercase tracking-[0.14em] text-sage-800">
                  Try-on photo
                </Text>
                <View className="w-10" />
              </View>
            ) : null}
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit // shrinks to fit one line on narrow phones
              minimumFontScale={0.6}
              className="text-center font-heading text-4xl text-sage-800">
              Add full-body photos
            </Text>
          </View>

          <MascotMessage>
            Stand back and keep your whole body in frame. Take one facing the camera, then one facing away
            from the same spot. Outfits get previewed on you from every angle.
          </MascotMessage>

          <View
            onLayout={(e) => setPhotoArea(e.nativeEvent.layout)}
            className="min-h-[200px] flex-1 items-center justify-center">
            {photoArea ? (
              <View className="flex-row gap-3">
                {(['front', 'back'] as const).map((side) => (
                  <PhotoSlot
                    key={side}
                    label={side === 'front' ? 'Front' : 'Back'}
                    photo={photos[side]}
                    height={photoHeight}
                    disabled={isSubmitting}
                    onPress={() => handleAddPhoto(side)}
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View className="gap-1">
            {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}

            <Pressable
              onPress={handleSubmit}
              disabled={!photos.front || !photos.back || isSubmitting}
              className="flex-row items-center justify-center rounded-xl bg-sage-500 py-3 disabled:opacity-60">
              {isSubmitting ? (
                <ActivityIndicator color="#fffdf9" />
              ) : (
                <Text className="font-label text-base text-cream-50">Submit</Text>
              )}
            </Pressable>

            {fromApp ? null : (
              <Pressable
                onPress={() => router.replace('/closet')}
                disabled={isSubmitting}
                accessibilityRole="button"
                className="items-center py-1.5 disabled:opacity-60">
                <Text className="font-label text-base text-sage-600 underline">Skip for now</Text>
              </Pressable>
            )}
          </View>

          <View className="flex-row items-start justify-center gap-2 px-2">
            <Ionicons name="lock-closed-outline" size={14} color="#7a9264" style={{ marginTop: 2 }} />
            <Text className="flex-1 font-body text-xs text-sage-500">
              Your photos are kept private. They are only used to preview outfits on you, and are never
              shared or shown to anyone else.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PhotoSlot({
  label,
  photo,
  height,
  disabled,
  onPress,
}: {
  label: string;
  photo: PickedPhoto | null;
  height: number;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View className="items-center gap-1.5">
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={photo ? `Change ${label.toLowerCase()} photo` : `Add ${label.toLowerCase()} photo`}
        style={{ height, width: (height * 3) / 4 }}
        className="items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-sage-300 bg-cream-50">
        {photo ? (
          <>
            <Image source={{ uri: photo.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
            <View className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-full bg-sage-700/80 px-2.5 py-1">
              <Ionicons name="camera-outline" size={13} color="#fffdf9" />
              <Text className="font-label text-xs text-cream-50">Change</Text>
            </View>
          </>
        ) : (
          <View className="items-center gap-2">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-sage-500">
              <Ionicons name="add" size={26} color="#fffdf9" />
            </View>
            <Text className="font-label text-sm text-sage-700">Add Photo</Text>
          </View>
        )}
      </Pressable>
      <Text className="font-label text-[11px] uppercase tracking-[0.14em] text-sage-800">{label}</Text>
    </View>
  );
}
