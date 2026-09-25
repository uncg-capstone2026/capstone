import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthDivider, AuthTextInput } from '@/components/auth/auth-ui';
import { MascotMessage } from '@/components/mascot-message';
import { pickPhoto, type PhotoSource } from '@/components/photo-picker';
import { importItemFromLink, isLikelyUrl, uploadItemPhoto } from '@/services/items';
import type { PickedPhoto } from '@/services/photos';

export default function AddItemScreen() {
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [link, setLink] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoArea, setPhotoArea] = useState<{ width: number; height: number } | null>(null);

  // Largest square that fits the space left over, so the screen doesn't need to scroll.
  const photoSize = photoArea ? Math.min(photoArea.width, photoArea.height) : 0;
  const isBusy = isUploading || isImporting;

  async function handlePickPhoto(source: PhotoSource) {
    setError(null);
    try {
      const picked = await pickPhoto(source);
      if (picked) setPhoto(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  async function handleConfirm() {
    if (!photo) return;
    setError(null);
    setIsUploading(true);
    try {
      await uploadItemPhoto(photo);
      router.back(); // the closet reloads when it comes back into view
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAddLink() {
    setError(null);
    if (!isLikelyUrl(link)) {
      setError("That doesn't look like a link.");
      return;
    }
    setIsImporting(true);
    try {
      await importItemFromLink(link.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView
          contentContainerClassName="flex-grow items-center px-6 pb-4"
          keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-sm flex-1 gap-4">
            <View className="flex-row items-center">
              <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="-ml-2 h-10 w-10 items-center justify-center">
                <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
              </Pressable>
              <Text className="flex-1 text-center font-heading text-2xl text-sage-700">
                Photograph the piece
              </Text>
              <View className="w-10" />
            </View>

            <MascotMessage>
              Lay it flat on a plain surface in good, even light. I will cut it out and fill in the
              category, color and fit for you.
            </MascotMessage>

            <View
              onLayout={(e) => setPhotoArea(e.nativeEvent.layout)}
              className="min-h-[160px] flex-1 items-center justify-center">
              {photoArea ? (
                <Pressable
                  onPress={() => handlePickPhoto('library')}
                  disabled={!photo || isBusy}
                  accessibilityRole={photo ? 'button' : undefined}
                  accessibilityLabel={photo ? 'Change photo' : 'Photo placeholder'}
                  style={{ width: photoSize, height: photoSize }}
                  className="items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-sage-300 bg-cream-50">
                  {photo ? (
                    <>
                      <Image source={{ uri: photo.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                      {isUploading ? (
                        <View className="absolute inset-0 items-center justify-center gap-2 bg-sage-900/40">
                          <ActivityIndicator color="#fffdf9" />
                          <Text className="font-label text-sm text-cream-50">Sage is cutting it out…</Text>
                        </View>
                      ) : (
                        <View className="absolute bottom-3 right-3 flex-row items-center gap-1 rounded-full bg-sage-700/80 px-3 py-1.5">
                          <Ionicons name="camera-outline" size={14} color="#fffdf9" />
                          <Text className="font-label text-xs text-cream-50">Change</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <Ionicons name="shirt-outline" size={44} color="#b3c49f" />
                  )}
                </Pressable>
              ) : null}
            </View>

            {photo ? (
              <Pressable
                onPress={handleConfirm}
                disabled={isBusy}
                accessibilityRole="button"
                className="flex-row items-center justify-center rounded-xl bg-sage-500 py-3 disabled:opacity-60">
                {isUploading ? (
                  <ActivityIndicator color="#fffdf9" />
                ) : (
                  <Text className="font-label text-base text-cream-50">Confirm</Text>
                )}
              </Pressable>
            ) : null}

            <View className="flex-row gap-3">
              {/* Once a photo is picked, Confirm is the main action, so this turns secondary. */}
              <Pressable
                onPress={() => handlePickPhoto('camera')}
                disabled={isBusy}
                accessibilityRole="button"
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl px-2 py-3 disabled:opacity-60 ${
                  photo ? 'border border-sage-200 bg-cream-50' : 'bg-sage-500'
                }`}>
                <Ionicons name="camera-outline" size={18} color={photo ? '#4d5d3f' : '#fffdf9'} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  className={`font-label text-sm ${photo ? 'text-sage-700' : 'text-cream-50'}`}>
                  Take a photo
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handlePickPhoto('library')}
                disabled={isBusy}
                accessibilityRole="button"
                className="flex-1 flex-row items-center justify-center gap-1.5 px-2 rounded-xl border border-sage-200 bg-cream-50 py-3 disabled:opacity-60">
                <Ionicons name="images-outline" size={18} color="#4d5d3f" />
                <Text numberOfLines={1} adjustsFontSizeToFit className="shrink font-label text-sm text-sage-700">
                  Choose from library
                </Text>
              </Pressable>
            </View>

            <AuthDivider label="or" />

            <View className="gap-2">
              <Text className="font-label text-sm text-sage-700">Add from a link</Text>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <AuthTextInput
                    value={link}
                    onChangeText={setLink}
                    placeholder="Paste a product link"
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleAddLink}
                    editable={!isBusy}
                  />
                </View>
                <Pressable
                  onPress={handleAddLink}
                  disabled={!link.trim() || isBusy}
                  accessibilityRole="button"
                  className="items-center justify-center rounded-xl bg-sage-500 px-5 disabled:opacity-60">
                  {isImporting ? (
                    <ActivityIndicator color="#fffdf9" />
                  ) : (
                    <Text className="font-label text-base text-cream-50">Add</Text>
                  )}
                </Pressable>
              </View>
              <Text className="font-body text-xs text-sage-500">
                Sage pulls the product image and details, then you can confirm them.
              </Text>
            </View>

            {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
