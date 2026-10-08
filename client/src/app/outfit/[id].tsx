import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GOLD } from '@/components/closet/category-filter';
import { StatCard } from '@/components/item-details/wear-stats';
import { CollectionChips } from '@/components/outfit-details/collection-chips';
import { PiecePickerSheet } from '@/components/outfit-details/piece-picker-sheet';
import { ScheduleSheet } from '@/components/outfit-details/schedule-sheet';
import { ScheduledList } from '@/components/outfit-details/scheduled-list';
import { OutfitStage, OVERLAY_BG, SHEET_OVERLAP } from '@/components/suggestion/outfit-stage';
import { PieceThumbnails } from '@/components/suggestion/piece-thumbnails';
import { SelectedPieceBar } from '@/components/suggestion/selected-piece-bar';
import { SessionExpiredError } from '@/services/api';
import { CATEGORY_OPTIONS, listItems } from '@/services/items';
import {
  deleteOutfit,
  getOutfit,
  isCompleteOutfit,
  scheduleOutfit,
  setOutfitFavorite,
  unscheduleOutfit,
  updateOutfitItems,
  type OutfitDetails,
  type ScheduledDate,
} from '@/services/outfits';
import { DEFAULT_STAGE_COLOR, getOutfitColors, setOutfitColor } from '@/services/preferences';
import type { SuggestedPiece } from '@/services/stylist';
import { fromDateKey } from '@/utils/dates';

// Which piece picker is open: swapping a piece for another of its category, or adding one.
type Picker = { kind: 'swap'; piece: SuggestedPiece } | { kind: 'add' };

// One saved outfit: the flat-lay on its own background colour, its pieces (which can be
// swapped, removed or added to), wear stats, favorite, scheduled dates, collections and delete.
export default function OutfitDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [outfit, setOutfit] = useState<OutfitDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null); // null = whole outfit
  const [color, setColor] = useState(DEFAULT_STAGE_COLOR);
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
  // Pieces added on this screen show in the strip only, not in the flat-lay.
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [closet, setCloset] = useState<SuggestedPiece[] | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null);

  // Reload whenever the screen comes back into view, e.g. after opening an item or collection.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getOutfit(id)
        .then((next) => {
          if (!cancelled) setOutfit(next);
        })
        .catch((e) => {
          if (cancelled || e instanceof SessionExpiredError) return;
          setLoadError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        });
      getOutfitColors().then((colors) => {
        if (!cancelled && colors[id]) setColor(colors[id]);
      });
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  function changeColor(next: string) {
    setColor(next);
    setOutfitColor(id, next).catch(() => {
      // Keeps working for this session; it just won't be remembered next launch.
    });
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/outfits');
  }

  function showError(e: unknown) {
    if (e instanceof SessionExpiredError) return;
    setActionError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
  }

  if (!outfit) {
    return (
      <SafeAreaView className="flex-1 bg-cream-100">
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="ml-4 mt-1 h-10 w-10 items-center justify-center">
          <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
        </Pressable>
        {loadError ? (
          <Text className="mt-8 px-6 text-center font-body text-base text-red-600">{loadError}</Text>
        ) : (
          <ActivityIndicator color="#7a9264" className="mt-8" />
        )}
      </SafeAreaView>
    );
  }

  const pieces = outfit.items;
  const selectedPiece = pieces.find((piece) => piece.id === selectedId) ?? null;
  const flatLayPieces = pieces.filter((piece) => !addedIds.includes(piece.id));

  // Shows the change straight away, then saves it. Reverts and shows the error if it fails.
  async function toggleFavorite() {
    if (!outfit) return;
    const isFavorite = !outfit.isFavorite;
    setActionError(null);
    setOutfit({ ...outfit, isFavorite });
    try {
      await setOutfitFavorite(outfit.id, isFavorite);
    } catch (e) {
      setOutfit((current) => (current ? { ...current, isFavorite: !isFavorite } : current));
      showError(e);
    }
  }

  // Shows the outfit the server sends back, since it lays the pieces out again.
  async function savePieces(next: SuggestedPiece[]) {
    setOutfit(await updateOutfitItems(id, next));
  }

  // A piece can go as long as the outfit is still complete (a one-piece, or a top and bottoms).
  function canRemove(pieceId: string) {
    return isCompleteOutfit(pieces.filter((piece) => piece.id !== pieceId));
  }

  async function removePiece(pieceId: string) {
    if (!canRemove(pieceId)) return;
    setActionError(null);
    try {
      await savePieces(pieces.filter((piece) => piece.id !== pieceId));
      setSelectedId(null);
      setAddedIds((ids) => ids.filter((addedId) => addedId !== pieceId));
    } catch (e) {
      showError(e);
    }
  }

  function openPicker(next: Picker) {
    setCloset(null);
    setPicker(next);
    listItems()
      .then((items) =>
        setCloset(
          items.map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            type: null,
            imageUrl: item.imageUrl,
          })),
        ),
      )
      .catch((e) => {
        setPicker(null);
        showError(e);
      });
  }

  // Swap: the same category's pieces that aren't already in the outfit, with the current one
  // first and checked. Empty when there's nothing to swap to. Add: anything not in the outfit.
  function pickerPieces(): SuggestedPiece[] | null {
    if (!closet || !picker) return null;
    const inOutfit = new Set(pieces.map((piece) => piece.id));
    if (picker.kind === 'add') return closet.filter((item) => !inOutfit.has(item.id));
    const current = picker.piece;
    const others = current.category
      ? closet.filter((item) => item.category === current.category && !inOutfit.has(item.id))
      : [];
    return others.length > 0 ? [current, ...others] : [];
  }

  async function pick(piece: SuggestedPiece) {
    if (!picker) return;
    if (picker.kind === 'add') {
      await savePieces([...pieces, piece]);
      setAddedIds((ids) => [...ids, piece.id]);
    } else {
      const replaced = picker.piece.id;
      await savePieces(pieces.map((p) => (p.id === replaced ? piece : p)));
      // A piece swapped in for an added one is still an added one.
      setAddedIds((ids) => ids.map((addedId) => (addedId === replaced ? piece.id : addedId)));
      setSelectedId(piece.id);
    }
    setPicker(null);
  }

  async function schedule(entry: { date: string; eventName: string | null }) {
    const created = await scheduleOutfit(id, entry);
    setOutfit((current) => (current ? { ...current, scheduled: [...current.scheduled, created] } : current));
    setIsScheduling(false);
  }

  async function unschedule(entry: ScheduledDate) {
    setRemovingEntryId(entry.id);
    setActionError(null);
    try {
      await unscheduleOutfit(id, entry.id);
      setOutfit((current) =>
        current ? { ...current, scheduled: current.scheduled.filter((e) => e.id !== entry.id) } : current,
      );
    } catch (e) {
      showError(e);
    } finally {
      setRemovingEntryId(null);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete this outfit?',
      "It's removed from all your collections and scheduled dates. The items stay in your closet.",
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteOutfit(id)
              .then(goBack)
              .catch((e) => {
                if (e instanceof SessionExpiredError) return;
                Alert.alert('Could not delete this outfit', e instanceof Error ? e.message : 'Please try again.');
              });
          },
        },
      ],
    );
  }

  const swapCategory = picker?.kind === 'swap' ? categoryLabel(picker.piece) : null;

  return (
    <View className="flex-1 bg-cream-200">
      <ScrollView
        style={{ backgroundColor: color }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}>
        <OutfitStage
          items={flatLayPieces}
          selectedPiece={selectedPiece}
          topRight={
            <Pressable
              onPress={toggleFavorite}
              accessibilityRole="button"
              accessibilityLabel={outfit.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              accessibilityState={{ selected: outfit.isFavorite }}
              style={{ backgroundColor: OVERLAY_BG }}
              className="h-10 w-10 items-center justify-center rounded-full">
              <Ionicons
                name={outfit.isFavorite ? 'star' : 'star-outline'}
                size={20}
                color={outfit.isFavorite ? GOLD : '#4d5d3f'}
              />
            </Pressable>
          }
          color={color}
          isColorPopoverOpen={isColorPopoverOpen}
          onToggleColorPopover={() => setIsColorPopoverOpen((open) => !open)}
          onChangeColor={changeColor}
          onBack={goBack}
        />

        <View
          className="flex-grow gap-5 rounded-t-3xl bg-cream-200 px-[22px] pt-6"
          style={{ marginTop: -SHEET_OVERLAP, paddingBottom: insets.bottom + 24 }}>
          <Text accessibilityRole="header" className="font-heading text-[26px] leading-[34px] text-sage-800">
            {outfit.name}
          </Text>

          {actionError ? (
            <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2 rounded-xl bg-red-50 px-4 py-2">
              <Text className="flex-1 font-body text-sm text-red-700">{actionError}</Text>
              <Pressable onPress={() => setActionError(null)} accessibilityLabel="Dismiss" hitSlop={8}>
                <Ionicons name="close" size={18} color="#b91c1c" />
              </Pressable>
            </View>
          ) : null}

          <PieceThumbnails
            items={pieces}
            flatLayItems={flatLayPieces}
            selectedId={selectedId}
            stageColor={color}
            onSelect={setSelectedId}
            onAdd={() => openPicker({ kind: 'add' })}
            onRemove={removePiece}
            canRemove={canRemove}
          />

          <Pressable
            onPress={() => router.push('/try-on')}
            accessibilityRole="button"
            className="items-center rounded-full bg-sage-500 py-3.5">
            <Text className="font-label text-base text-cream-50">✧ Try on</Text>
          </Pressable>

          {selectedPiece ? (
            <SelectedPieceBar
              piece={selectedPiece}
              onSwap={() => openPicker({ kind: 'swap', piece: selectedPiece })}
              onViewItem={() => router.push({ pathname: '/item/[id]', params: { id: selectedPiece.id } })}
            />
          ) : null}

          <View className="flex-row gap-3">
            <StatCard value={outfit.timesWorn} label="times worn" />
            <StatCard value={formatLastWorn(outfit.lastWorn)} label="last worn" />
          </View>

          <Pressable
            onPress={toggleFavorite}
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-2 rounded-full border border-sage-300 bg-cream-50 py-3.5">
            <Ionicons
              name={outfit.isFavorite ? 'star' : 'star-outline'}
              size={18}
              color={outfit.isFavorite ? GOLD : '#4d5d3f'}
            />
            <Text className="font-label text-base text-sage-700">
              {outfit.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            </Text>
          </Pressable>

          <ScheduledList
            scheduled={outfit.scheduled}
            removingId={removingEntryId}
            onAdd={() => setIsScheduling(true)}
            onRemove={unschedule}
          />

          <CollectionChips collections={outfit.collections} />

          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            className="mt-2 items-center rounded-full border border-red-700 py-3.5">
            <Text className="font-label text-base text-red-700">Delete outfit</Text>
          </Pressable>
        </View>
      </ScrollView>

      <PiecePickerSheet
        visible={picker !== null}
        title={picker?.kind === 'add' ? 'Add a piece' : swapCategory ? `Swap ${swapCategory}` : 'Swap piece'}
        pieces={pickerPieces()}
        checkedId={picker?.kind === 'swap' ? picker.piece.id : undefined}
        emptyMessage={
          picker?.kind === 'add'
            ? 'Everything in your closet is already in this outfit.'
            : swapCategory
              ? `No other ${swapCategory} in your closet to swap in.`
              : 'Give this piece a category first, so StyleMe knows what to swap it with.'
        }
        onCancel={() => setPicker(null)}
        onPick={pick}
      />
      <ScheduleSheet visible={isScheduling} onCancel={() => setIsScheduling(false)} onSchedule={schedule} />
    </View>
  );
}

// e.g. "tops", or null for an untagged piece.
function categoryLabel(piece: SuggestedPiece): string | null {
  return CATEGORY_OPTIONS.find((option) => option.key === piece.category)?.label.toLowerCase() ?? null;
}

// "Oct 7", with the year if it isn't this year, or "Never". lastWorn is midnight UTC of the day,
// so only its date part is used (reading it as local time could give the day before).
function formatLastWorn(lastWorn: string | null | undefined): string {
  if (lastWorn === undefined) return '—';
  if (lastWorn === null) return 'Never';
  const day = fromDateKey(lastWorn.slice(0, 10));
  const sameYear = day.getFullYear() === new Date().getFullYear();
  return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
