import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GOLD } from '@/components/closet/category-filter';
import { ColorSection } from '@/components/item-details/color-section';
import { FitSlider } from '@/components/item-details/fit-slider';
import { GarmentCard } from '@/components/item-details/garment-card';
import { MoreDetails } from '@/components/item-details/more-details';
import { OutfitChips } from '@/components/item-details/outfit-chips';
import { RemoveItem } from '@/components/item-details/remove-item';
import { SelectField } from '@/components/item-details/select-field';
import { WearStats } from '@/components/item-details/wear-stats';
import { SessionExpiredError } from '@/services/api';
import {
  AI_HINT,
  CATEGORY_OPTIONS,
  CLOTHING_TYPE_OPTIONS,
  COMMON_CUTS,
  deleteItem,
  FORMALITY_OPTIONS,
  getItem,
  MATERIAL_OPTIONS,
  SEASON_OPTIONS,
  stylistHint,
  updateItem,
  type ClothingItemChanges,
  type ClothingItemDetails,
} from '@/services/items';

const MAX_NAME_LENGTH = 60;
const MAX_CUT_LENGTH = 50;
const MAX_MATERIAL_LENGTH = 50;

// Every cut from every category, for items that don't have a category yet.
const ALL_CUTS = [...new Set(Object.values(COMMON_CUTS).flat())].sort();

export default function ItemDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<ClothingItemDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Only the newest save may overwrite the screen, so a slow earlier reply can't undo a later change.
  const latestSave = useRef(0);

  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loaded = await getItem(id);
        if (!cancelled) setItem(loaded);
      } catch (e) {
        if (cancelled || e instanceof SessionExpiredError) return;
        setLoadError(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadCount]);

  function retry() {
    setIsLoading(true);
    setLoadError(null);
    setReloadCount((n) => n + 1);
  }

  // Shows the change straight away, then saves it. Reverts and shows the error if it fails.
  async function save(changes: ClothingItemChanges) {
    if (!item) return;
    const before = item;
    const request = ++latestSave.current;
    setSaveError(null);
    setItem({ ...item, ...changes });
    try {
      const saved = await updateItem(item.id, changes);
      if (request === latestSave.current) setItem(saved);
    } catch (e) {
      if (e instanceof SessionExpiredError) return;
      if (request === latestSave.current) setItem(before);
      setSaveError(e instanceof Error ? e.message : 'Could not save your changes.');
    }
  }

  async function remove() {
    if (!item) return;
    await deleteItem(item.id);
    goBack();
  }

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <View className="flex-row items-center px-4 pb-2 pt-1">
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to closet"
          className="h-10 w-10 items-center justify-center">
          <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
        </Pressable>
        <Text className="flex-1 text-center font-label text-lg text-sage-700">Item details</Text>
        <Pressable
          onPress={() => item && save({ isFavorite: !item.isFavorite })}
          disabled={!item}
          accessibilityRole="button"
          accessibilityLabel={item?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          accessibilityState={{ selected: item?.isFavorite ?? false }}
          className="h-10 w-10 items-center justify-center">
          <Ionicons
            name={item?.isFavorite ? 'star' : 'star-outline'}
            size={24}
            color={item?.isFavorite ? GOLD : '#4d5d3f'}
          />
        </Pressable>
      </View>

      {saveError ? (
        <View accessibilityLiveRegion="polite" className="mx-6 mb-2 flex-row items-center gap-2 rounded-xl bg-red-50 px-4 py-2">
          <Text className="flex-1 font-body text-sm text-red-700">{saveError}</Text>
          <Pressable onPress={() => setSaveError(null)} accessibilityLabel="Dismiss" hitSlop={8}>
            <Ionicons name="close" size={18} color="#b91c1c" />
          </Pressable>
        </View>
      ) : null}

      {isLoading && !item ? (
        <ActivityIndicator color="#7a9264" className="mt-12" />
      ) : loadError || !item ? (
        <View className="items-center gap-4 px-6 pt-12">
          <Text className="text-center font-body text-base text-sage-600">{loadError}</Text>
          <Pressable onPress={retry} accessibilityRole="button" className="rounded-xl bg-sage-500 px-6 py-3">
            <Text className="font-label text-base text-cream-50">Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-6 px-6 pb-12 pt-2" keyboardShouldPersistTaps="handled">
          <GarmentCard itemId={item.id} imageUrl={item.imageUrl} name={item.name} colorHex={item.colorHex} />

          <ItemName name={item.name} onRename={(name) => save({ name })} />

          <WearStats timesWorn={item.timesWorn} timesWornThisMonth={item.timesWornThisMonth} />

          <OutfitChips outfits={item.outfits} />

          <View className="h-px bg-sage-200" />

          <ColorSection
            colors={item.colorHex}
            pattern={item.pattern}
            colorsHint={stylistHint(item.colorHex)}
            patternHint={stylistHint(item.pattern)}
          />

          <FitSlider value={item.fit} onChange={(fit) => save({ fit })} aiHint={stylistHint(item.fit)} />

          <SelectField
            label="Cut"
            value={item.cut}
            options={(item.category ? COMMON_CUTS[item.category] : ALL_CUTS).map((cut) => ({
              value: cut,
              label: cut,
            }))}
            onChange={(cut) => save({ cut })}
            allowCustom={{ label: 'Add a custom cut…', maxLength: MAX_CUT_LENGTH }}
            aiHint={item.cut ? AI_HINT : undefined}
          />

          <SelectField
            label="Category"
            value={item.category}
            options={CATEGORY_OPTIONS.map(({ key, label }) => ({ value: key, label }))}
            onChange={(category) => save({ category })}
            aiHint={stylistHint(item.category)}
          />

          <MoreDetails summary="Type, material, season and formality">
            <SelectField
              label="Type"
              value={item.type}
              options={[...CLOTHING_TYPE_OPTIONS]}
              onChange={(type) => save({ type })}
              aiHint={stylistHint(item.type)}
            />
            <SelectField
              label="Material"
              value={item.material}
              options={MATERIAL_OPTIONS}
              onChange={(material) => save({ material })}
              allowCustom={{ label: 'Add a custom material…', maxLength: MAX_MATERIAL_LENGTH }}
              aiHint={stylistHint(item.material)}
            />
            <SelectField
              label="Season"
              value={item.season}
              options={SEASON_OPTIONS}
              onChange={(season) => save({ season })}
              aiHint={stylistHint(item.season)}
            />
            <SelectField
              label="Formality"
              value={item.formality}
              options={FORMALITY_OPTIONS}
              onChange={(formality) => save({ formality })}
              aiHint={stylistHint(item.formality)}
            />
          </MoreDetails>

          <View className="h-px bg-sage-200" />

          <ExcludeToggle
            value={item.excludeFromSuggestions}
            onChange={(excludeFromSuggestions) => save({ excludeFromSuggestions })}
          />

          <RemoveItem onRemove={remove} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// Opened from the closet, so back normally returns there. Falls back to it for a direct link.
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/closet');
}

// Large serif title with a pencil. Tapping it edits the name inline; an empty name is ignored.
function ItemName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // null = not editing

  function finish() {
    const trimmed = draft?.trim();
    setDraft(null);
    if (trimmed && trimmed !== name) onRename(trimmed);
  }

  if (draft !== null) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={finish}
        onBlur={finish}
        maxLength={MAX_NAME_LENGTH}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        accessibilityLabel="Item name"
        className="rounded-xl border border-sage-300 bg-cream-50 px-3 py-2 font-heading text-2xl text-sage-800"
      />
    );
  }

  return (
    <Pressable
      onPress={() => setDraft(name)}
      accessibilityRole="button"
      accessibilityLabel={`${name}. Rename`}
      className="flex-row items-center gap-2">
      <Text className="shrink font-heading text-2xl text-sage-800">{name}</Text>
      <Ionicons name="pencil" size={18} color="#61754e" />
    </Pressable>
  );
}

function ExcludeToggle({ value, onChange }: { value?: boolean; onChange: (value: boolean) => void }) {
  const isAvailable = value !== undefined;
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1 gap-0.5">
        <Text className="font-label text-base text-sage-700">Exclude from future outfit suggestions</Text>
        {!isAvailable ? <Text className="font-body text-xs text-sage-500">Coming soon</Text> : null}
      </View>
      <Switch
        value={value ?? false}
        onValueChange={onChange}
        disabled={!isAvailable}
        accessibilityLabel="Exclude from future outfit suggestions"
        trackColor={{ false: '#d3ddc5', true: '#7a9264' }}
        thumbColor="#fffdf9"
        ios_backgroundColor="#d3ddc5"
      />
    </View>
  );
}
