import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmSheet } from '@/components/confirm-sheet';
import { AllOutfitsCard } from '@/components/outfits/all-outfits-card';
import { CollectionsGrid } from '@/components/outfits/collections-grid';
import { FavoritesRow } from '@/components/outfits/favorites-row';
import { PromptSheet } from '@/components/prompt-sheet';
import { useOutfitColors } from '@/hooks/use-outfit-colors';
import { SessionExpiredError } from '@/services/api';
import {
  ALL_OUTFITS_ID,
  COLLECTION_NAME_MAX_LENGTH,
  createCollection,
  deleteCollection,
  FAVORITES_ID,
  getOutfitsOverview,
  listOutfits,
  renameCollection,
  type OutfitCollection,
  type OutfitPreview,
  type OutfitsOverview,
  type SavedOutfit,
} from '@/services/outfits';

export default function OutfitsScreen() {
  const [overview, setOverview] = useState<OutfitsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [renaming, setRenaming] = useState<OutfitCollection | null>(null);
  const [deleting, setDeleting] = useState<OutfitCollection | null>(null);
  const [outfits, setOutfits] = useState<SavedOutfit[]>([]); // only to colour the covers
  const colorFor = useOutfitColors();

  // Reload whenever the tab comes back into view, e.g. after saving an outfit. Leaving the
  // tab ends edit mode.
  useFocusEffect(
    useCallback(() => {
      setError(null);
      getOutfitsOverview()
        .then(setOverview)
        .catch((e) => {
          if (e instanceof SessionExpiredError) return;
          setError(e instanceof Error ? e.message : 'Something went wrong.');
        });
      listOutfits()
        .then(setOutfits)
        .catch(() => {
          // Covers just use the default background.
        });
      return () => setIsEditing(false);
    }, []),
  );

  const collections = overview?.collections ?? [];

  // A cover is an outfit's pieces without its id, so its background colour comes from the saved
  // outfit with the same pieces (the default sage if none matches).
  function coverColor(cover: OutfitPreview | null): string {
    const key = cover ? piecesKey(cover) : null;
    const outfit = outfits.find((o) => piecesKey(o.items) === key);
    return colorFor(outfit?.id ?? '');
  }

  function openCollection(id: string) {
    router.push({ pathname: '/collection/[id]', params: { id } });
  }

  function updateCollections(update: (collections: OutfitCollection[]) => OutfitCollection[]) {
    setOverview((current) => (current ? { ...current, collections: update(current.collections) } : current));
  }

  async function create(name: string) {
    const collection = await createCollection(name);
    updateCollections((current) => [collection, ...current]);
    setIsCreating(false);
  }

  async function rename(name: string) {
    if (!renaming) return;
    const renamed = await renameCollection(renaming.id, name);
    updateCollections((current) => current.map((c) => (c.id === renamed.id ? renamed : c)));
    setRenaming(null);
  }

  async function remove() {
    if (!deleting) return;
    await deleteCollection(deleting.id);
    const remaining = collections.filter((c) => c.id !== deleting.id);
    updateCollections(() => remaining);
    setDeleting(null);
    if (remaining.length === 0) setIsEditing(false);
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <ScrollView contentContainerClassName="gap-4 px-6 pb-8 pt-2">
        <Text accessibilityRole="header" className="font-heading text-4xl text-sage-800">
          Outfits
        </Text>

        {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}

        {!overview ? (
          error ? null : <ActivityIndicator color="#7a9264" className="mt-8" />
        ) : (
          <>
            <AllOutfitsCard
              count={overview.allOutfits.count}
              cover={overview.allOutfits.cover}
              coverColor={coverColor(overview.allOutfits.cover)}
              onPress={() => openCollection(ALL_OUTFITS_ID)}
            />

            <View className="mt-2 flex-row items-center justify-between">
              <Text className="font-label text-xs uppercase tracking-widest text-sage-500">Your collections</Text>
              {collections.length > 0 ? (
                <Pressable
                  onPress={() => setIsEditing((editing) => !editing)}
                  accessibilityRole="button"
                  hitSlop={8}>
                  <Text className="font-label text-sm text-sage-700 underline">{isEditing ? 'Done' : 'Edit'}</Text>
                </Pressable>
              ) : null}
            </View>

            <FavoritesRow count={overview.favorites.count} onPress={() => openCollection(FAVORITES_ID)} />

            <CollectionsGrid
              collections={collections}
              coverColorFor={(collection) => coverColor(collection.cover)}
              isEditing={isEditing}
              onNewPress={() => setIsCreating(true)}
              onCollectionPress={(collection) =>
                isEditing ? setRenaming(collection) : openCollection(collection.id)
              }
              onCollectionDelete={setDeleting}
            />
          </>
        )}
      </ScrollView>

      <PromptSheet
        visible={isCreating}
        title="New collection"
        subtitle="Group outfits you like to wear together."
        placeholder="e.g. Weekend Casual"
        confirmLabel="Create"
        maxLength={COLLECTION_NAME_MAX_LENGTH}
        submitOnEnter
        onCancel={() => setIsCreating(false)}
        onSubmit={create}
      />
      <PromptSheet
        visible={renaming !== null}
        title="Rename collection"
        subtitle="Its outfits stay the same."
        placeholder="Collection name"
        confirmLabel="Save"
        initialText={renaming?.name}
        maxLength={COLLECTION_NAME_MAX_LENGTH}
        submitOnEnter
        onCancel={() => setRenaming(null)}
        onSubmit={rename}
      />
      <ConfirmSheet
        visible={deleting !== null}
        title={`Delete “${deleting?.name}”?`}
        message="The outfits in it stay in All saved outfits."
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </SafeAreaView>
  );
}

// The same pieces in any order give the same key.
function piecesKey(pieces: OutfitPreview): string {
  return pieces
    .map((piece) => piece.id)
    .sort()
    .join(',');
}
