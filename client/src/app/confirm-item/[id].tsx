import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ColorEditor, MAX_COLORS } from '@/components/confirm-item/color-editor';
import { FitSlider } from '@/components/item-details/fit-slider';
import { GarmentCard } from '@/components/item-details/garment-card';
import { SelectField } from '@/components/item-details/select-field';
import { MascotMessage } from '@/components/mascot-message';
import { SessionExpiredError } from '@/services/api';
import {
  CATEGORY_BY_TYPE,
  CATEGORY_OPTIONS,
  CLOTHING_TYPE_OPTIONS,
  COMMON_CUTS,
  deleteItem,
  FORMALITY_OPTIONS,
  getItem,
  MATERIAL_OPTIONS,
  PATTERN_OPTIONS,
  SEASON_OPTIONS,
  updateItem,
  type ClothingItemChanges,
  type ClothingItemDetails,
  type ClothingType,
} from '@/services/items';
import { normalizeHex } from '@/utils/colors';

const MAX_NAME_LENGTH = 60;
const MAX_TEXT_LENGTH = 50;
const AI_HINT = 'Filled in by StyleMe';

// Every cut from every category, for items that don't have a category yet.
const ALL_CUTS = [...new Set(Object.values(COMMON_CUTS).flat())].sort();

// The fields the user checks here. Everything else on the item isn't shown.
type Draft = Pick<
  ClothingItemDetails,
  'name' | 'type' | 'category' | 'colorHex' | 'pattern' | 'material' | 'season' | 'formality' | 'fit' | 'cut'
>;

function toDraft(item: ClothingItemDetails): Draft {
  const { name, type, category, colorHex, pattern, material, season, formality, fit, cut } = item;
  return { name, type, category, colorHex, pattern, material, season, formality, fit, cut };
}

// Only the fields the user changed, so the PATCH doesn't resend what the server already has.
function changesBetween(original: Draft, draft: Draft): ClothingItemChanges {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as (keyof Draft)[]) {
    const before = original[key];
    const after = key === 'name' ? draft.name.trim() : draft[key];
    const isSame = Array.isArray(before) && Array.isArray(after) ? before.join() === after.join() : before === after;
    if (!isSame) changes[key] = after;
  }
  return changes as ClothingItemChanges;
}

// Opened right after a photo is added. The server has already saved the item (and will tag it
// once AI tagging is wired in), so this checks and corrects it. Save sends the edits; Discard
// and Retake delete it.
export default function ConfirmItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<ClothingItemDetails | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'saving' | 'discarding' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getItem(id)
      .then((loaded) => {
        if (cancelled) return;
        setItem(loaded);
        setDraft(toDraft(loaded));
      })
      .catch((e) => {
        if (cancelled || e instanceof SessionExpiredError) return;
        setLoadError(e instanceof Error ? e.message : 'Something went wrong.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadCount]);

  function retry() {
    setLoadError(null);
    setReloadCount((n) => n + 1);
  }

  function edit(changes: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }

  // Picking a type also fills in its category. The user can still change the category after.
  function changeType(type: string | null) {
    const category = type ? CATEGORY_BY_TYPE[type as ClothingType] : undefined;
    edit(category ? { type, category } : { type });
  }

  // From the dropper. A full set has its last color replaced, as on the item details screen.
  function addColor(hex: string) {
    if (!draft) return;
    const color = normalizeHex(hex);
    if (draft.colorHex.includes(color)) return;
    const colors = draft.colorHex;
    edit({ colorHex: colors.length < MAX_COLORS ? [...colors, color] : [...colors.slice(0, MAX_COLORS - 1), color] });
  }

  async function save() {
    if (!item || !draft || !draft.name.trim()) return;
    setBusy('saving');
    setError(null);
    try {
      const changes = changesBetween(toDraft(item), draft);
      if (Object.keys(changes).length > 0) await updateItem(item.id, changes);
      router.dismissTo('/closet'); // the closet reloads when it comes back into view
    } catch (e) {
      if (e instanceof SessionExpiredError) return;
      setError(e instanceof Error ? e.message : 'Could not save your changes.');
      setBusy(null);
    }
  }

  // Retake goes back to the photo step; Discard (and Back) to the closet.
  function confirmDiscard(then: 'retake' | 'closet') {
    Alert.alert(
      then === 'retake' ? 'Retake this photo?' : 'Discard this item?',
      'It won’t be added to your closet.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: then === 'retake' ? 'Retake' : 'Discard', style: 'destructive', onPress: () => discard(then) },
      ],
    );
  }

  async function discard(then: 'retake' | 'closet') {
    setBusy('discarding');
    setError(null);
    try {
      await deleteItem(id);
      if (then === 'retake' && router.canGoBack()) router.back();
      else router.dismissTo('/closet');
    } catch (e) {
      if (e instanceof SessionExpiredError) return;
      setError(e instanceof Error ? e.message : 'Could not discard this item.');
      setBusy(null);
    }
  }

  const isBusy = busy !== null;
  const isTagged = Boolean(item?.type || item?.category);
  const hint = (value: unknown) => (item && value !== null && value !== '' ? AI_HINT : undefined);

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      {/* Leaving has to go through Save or Discard, so the item isn't left half-checked. */}
      <Stack.Screen options={{ gestureEnabled: false }} />

      <View className="flex-row items-center px-4 pb-2 pt-1">
        <Pressable
          onPress={() => (item ? confirmDiscard('closet') : router.back())}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center">
          <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
        </Pressable>
        <Text className="flex-1 text-center font-label text-lg text-sage-700">Check the details</Text>
        <Pressable
          onPress={() => confirmDiscard('closet')}
          disabled={!item || isBusy}
          accessibilityRole="button"
          className="h-10 items-center justify-center px-1 disabled:opacity-50">
          <Text className="font-label text-base text-sage-600">Discard</Text>
        </Pressable>
      </View>

      {error ? (
        <View accessibilityLiveRegion="polite" className="mx-6 mb-2 flex-row items-center gap-2 rounded-xl bg-red-50 px-4 py-2">
          <Text className="flex-1 font-body text-sm text-red-700">{error}</Text>
          <Pressable onPress={() => setError(null)} accessibilityLabel="Dismiss" hitSlop={8}>
            <Ionicons name="close" size={18} color="#b91c1c" />
          </Pressable>
        </View>
      ) : null}

      {loadError ? (
        <View className="items-center gap-4 px-6 pt-12">
          <Text className="text-center font-body text-base text-sage-600">{loadError}</Text>
          <Pressable onPress={retry} accessibilityRole="button" className="rounded-xl bg-sage-500 px-6 py-3">
            <Text className="font-label text-base text-cream-50">Try again</Text>
          </Pressable>
        </View>
      ) : !item || !draft ? (
        <ActivityIndicator color="#7a9264" className="mt-12" />
      ) : (
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <ScrollView contentContainerClassName="gap-6 px-6 pb-12 pt-2" keyboardShouldPersistTaps="handled">
            <MascotMessage>
              {isTagged
                ? 'Here’s what I filled in. Fix anything I got wrong before it goes in your closet.'
                : 'I couldn’t tag this one yet. Fill in what you can; Type and Category help me style it.'}
            </MascotMessage>

            <View className="gap-2">
              <GarmentCard itemId={item.id} imageUrl={item.imageUrl} name={draft.name} onPickColor={addColor} />
              <Pressable
                onPress={() => confirmDiscard('retake')}
                disabled={isBusy}
                accessibilityRole="button"
                className="flex-row items-center justify-center gap-1.5 self-center px-3 py-2">
                <Ionicons name="camera-outline" size={16} color="#61754e" />
                <Text className="font-label text-sm text-sage-600">Retake photo</Text>
              </Pressable>
            </View>

            <View className="gap-2">
              <Text className="font-label text-base text-sage-700">Name</Text>
              <TextInput
                value={draft.name}
                onChangeText={(name) => edit({ name })}
                maxLength={MAX_NAME_LENGTH}
                placeholder="e.g. Cream cable-knit sweater"
                placeholderTextColor="#7a9264"
                returnKeyType="done"
                accessibilityLabel="Name"
                className="rounded-xl border border-sage-200 bg-cream-50 px-4 py-3 font-body text-base text-sage-800"
              />
              {!draft.name.trim() ? (
                <Text className="font-body text-xs text-sage-500">Give it a name to save it.</Text>
              ) : null}
            </View>

            <SelectField
              label="Type"
              value={draft.type}
              options={[...CLOTHING_TYPE_OPTIONS]}
              onChange={changeType}
              aiHint="AI tag · the stylist uses this to pick outfits"
            />

            <SelectField
              label="Category"
              value={draft.category}
              options={CATEGORY_OPTIONS.map(({ key, label }) => ({ value: key, label }))}
              onChange={(category) => edit({ category })}
              aiHint={hint(item.category)}
            />

            <View className="h-px bg-sage-200" />

            <ColorEditor
              colors={draft.colorHex}
              onChange={(colorHex) => edit({ colorHex })}
              aiHint={item.colorHex.length > 0 ? AI_HINT : undefined}
            />

            <SelectField
              label="Pattern"
              value={draft.pattern}
              options={PATTERN_OPTIONS}
              onChange={(pattern) => edit({ pattern })}
              aiHint={hint(item.pattern)}
            />

            <SelectField
              label="Material"
              value={draft.material}
              options={MATERIAL_OPTIONS}
              onChange={(material) => edit({ material })}
              allowCustom={{ label: 'Add a custom material…', maxLength: MAX_TEXT_LENGTH }}
              aiHint={hint(item.material)}
            />

            <View className="h-px bg-sage-200" />

            <SelectField
              label="Season"
              value={draft.season}
              options={SEASON_OPTIONS}
              onChange={(season) => edit({ season })}
              aiHint={hint(item.season)}
            />

            <SelectField
              label="Formality"
              value={draft.formality}
              options={FORMALITY_OPTIONS}
              onChange={(formality) => edit({ formality })}
              aiHint={hint(item.formality)}
            />

            <FitSlider value={draft.fit} onChange={(fit) => edit({ fit })} />

            <SelectField
              label="Cut"
              value={draft.cut}
              options={(draft.category ? COMMON_CUTS[draft.category] : ALL_CUTS).map((cut) => ({
                value: cut,
                label: cut,
              }))}
              onChange={(cut) => edit({ cut })}
              allowCustom={{ label: 'Add a custom cut…', maxLength: MAX_TEXT_LENGTH }}
            />

            <Pressable
              onPress={save}
              disabled={isBusy || !draft.name.trim()}
              accessibilityRole="button"
              className="mt-2 flex-row items-center justify-center rounded-xl bg-sage-500 py-3.5 disabled:opacity-60">
              {busy === 'saving' ? (
                <ActivityIndicator color="#fffdf9" />
              ) : (
                <Text className="font-label text-base text-cream-50">Save to closet</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
