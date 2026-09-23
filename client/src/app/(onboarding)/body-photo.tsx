import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { choosePhotoSource, pickPhoto } from '@/components/onboarding/photo-picker';
import { uploadBodyPhoto, type PickedPhoto } from '@/services/photos';

export default function BodyPhotoScreen() {
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddPhoto() {
    setError(null);
    const source = await choosePhotoSource();
    if (!source) return;
    try {
      const picked = await pickPhoto(source);
      if (picked) setPhoto(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  async function handleSubmit() {
    if (!photo) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await uploadBodyPhoto(photo);
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <ScrollView contentContainerClassName="flex-grow items-center justify-center px-6 py-10">
        <View className="w-full max-w-sm gap-8">
          <View className="items-center gap-2">
            <Text className="font-heading text-lg tracking-wide text-sage-600">StyleMe</Text>
            <Text className="text-center font-heading text-3xl text-sage-700">Add a full-body photo</Text>
            <Text className="text-center font-body text-base text-sage-500">
              Stand back, face the camera, and keep your whole body in frame. Outfits get previewed on
              this photo.
            </Text>
          </View>

          <Pressable
            onPress={handleAddPhoto}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={photo ? 'Change photo' : 'Add photo'}
            className="aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-sage-300 bg-cream-50">
            {photo ? (
              <>
                <Image source={{ uri: photo.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                <View className="absolute bottom-3 right-3 flex-row items-center gap-1 rounded-full bg-sage-700/80 px-3 py-1.5">
                  <Ionicons name="camera-outline" size={14} color="#fffdf9" />
                  <Text className="font-label text-xs text-cream-50">Change</Text>
                </View>
              </>
            ) : (
              <View className="items-center gap-3">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-sage-500">
                  <Ionicons name="add" size={30} color="#fffdf9" />
                </View>
                <Text className="font-label text-base text-sage-700">Add Photo</Text>
              </View>
            )}
          </Pressable>

          <View className="gap-3">
            {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}

            <Pressable
              onPress={handleSubmit}
              disabled={!photo || isSubmitting}
              className="flex-row items-center justify-center rounded-xl bg-sage-500 py-3 disabled:opacity-60">
              {isSubmitting ? (
                <ActivityIndicator color="#fffdf9" />
              ) : (
                <Text className="font-label text-base text-cream-50">Submit</Text>
              )}
            </Pressable>
          </View>

          <View className="flex-row items-start justify-center gap-2 px-2">
            <Ionicons name="lock-closed-outline" size={14} color="#7a9264" style={{ marginTop: 2 }} />
            <Text className="flex-1 font-body text-xs text-sage-500">
              Your photo is kept private. It is only used to preview outfits on you, and is never shared
              or shown to anyone else.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
