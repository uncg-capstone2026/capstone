import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmSheet } from '@/components/confirm-sheet';
import { AddOutfitsButton } from '@/components/outfits/add-outfits-button';
import { AddOutfitsSheet } from '@/components/outfits/add-outfits-sheet';
import { OutfitGrid } from '@/components/outfits/outfit-grid';
import { OutfitTile } from '@/components/outfits/outfit-tile';
import { SessionExpiredError } from '@/services/api';
import {
  addOutfitsToCollection,
  ALL_OUTFITS_ID,
  COLLECTION_NAME_MAX_LENGTH,
  deleteOutfit,
  formatOutfitCount,
  getCollection,
  isBuiltInCollection,
  removeOutfitFromCollection,
  renameCollection,
  type CollectionDetails,
  type SavedOutfit,
} from '@/services/outfits';

// One list of outfits: All saved outfits, Favorites, or a user collection. In edit mode:
// - a user collection can be renamed, and outfits added or removed (the outfits themselves stay);
// - Favorites can have outfits added (favorited) or removed (unfavorited);
// - All saved outfits can only delete outfits, after a confirmation.
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAllOutfits = id === ALL_OUTFITS_ID;
  const canRename = !isBuiltInCollection(id);

  const [collection, setCollection] = useState<CollectionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedOutfit | null>(null);

  const load = useCallback(() => {
    getCollection(id)
      .then((details) => {
        setCollection(details);
        setDraftName(details.name);
      })
      .catch((e) => {
        if (e instanceof SessionExpiredError) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      });
  }, [id]);

  // Reload whenever the screen comes back into view. Leaving it ends edit mode.
  useFocusEffect(
    useCallback(() => {
      setError(null);
      load();
      return () => setIsEditing(false);
    }, [load]),
  );

  const outfits = collection?.outfits ?? [];

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/outfits');
  }

  // Saves the title if it changed. Returns false if the rename failed.
  async function saveName(): Promise<boolean> {
    if (!collection || !canRename) return true;
    const name = draftName.trim();
    if (!name || name === collection.name) {
      setDraftName(collection.name);
      return true;
    }
    setIsSavingName(true);
    setError(null);
    try {
      const renamed = await renameCollection(collection.id, name);
      setCollection((current) => (current ? { ...current, name: renamed.name } : current));
      setDraftName(renamed.name);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    } finally {
      setIsSavingName(false);
    }
  }

  async function toggleEditing() {
    if (isEditing && !(await saveName())) return;
    setError(null);
    setIsEditing((editing) => !editing);
  }

  function startAdding() {
    setIsEditing(true);
    setIsPicking(true);
  }

  async function add(outfitIds: string[]) {
    await addOutfitsToCollection(id, outfitIds);
    setIsPicking(false);
    load();
  }

  function removeOutfit(outfit: SavedOutfit) {
    if (isAllOutfits) {
      setDeleting(outfit);
      return;
    }
    if (removingId) return;
    setRemovingId(outfit.id);
    setError(null);
    removeOutfitFromCollection(id, outfit.id)
      .then(() => dropOutfit(outfit.id))
      .catch((e) => {
        if (e instanceof SessionExpiredError) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      })
      .finally(() => setRemovingId(null));
  }

  async function confirmDelete() {
    if (!deleting) return;
    await deleteOutfit(deleting.id);
    dropOutfit(deleting.id);
    setDeleting(null);
  }

  function dropOutfit(outfitId: string) {
    setCollection((current) =>
      current ? { ...current, outfits: current.outfits.filter((o) => o.id !== outfitId) } : current,
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <View className="flex-row items-center justify-between px-4 pt-1">
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center">
          <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
        </Pressable>
        {collection ? (
          <Pressable
            onPress={toggleEditing}
            disabled={isSavingName}
            accessibilityRole="button"
            hitSlop={8}
            className="px-2 disabled:opacity-50">
            {isSavingName ? (
              <ActivityIndicator color="#4d5d3f" />
            ) : (
              <Text className="font-label text-base text-sage-700">{isEditing ? 'Done' : 'Edit'}</Text>
            )}
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerClassName="gap-4 px-6 pb-8 pt-2" keyboardShouldPersistTaps="handled">
        {collection ? (
          <View className="gap-1">
            {isEditing && canRename ? (
              <View className="flex-row items-center gap-2 border-b-2 border-sage-300">
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  onSubmitEditing={saveName}
                  editable={!isSavingName}
                  maxLength={COLLECTION_NAME_MAX_LENGTH}
                  returnKeyType="done"
                  accessibilityLabel="Collection name"
                  className="flex-1 py-1 font-heading text-4xl text-sage-800"
                />
                <Ionicons name="pencil" size={18} color="#7a9264" />
              </View>
            ) : (
              <Text accessibilityRole="header" className="font-heading text-4xl text-sage-800">
                {collection.name}
              </Text>
            )}
            <Text className="font-body text-base text-sage-500">{formatOutfitCount(outfits.length)}</Text>
          </View>
        ) : null}

        {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}

        {!collection ? (
          error ? null : <ActivityIndicator color="#7a9264" className="mt-8" />
        ) : (
          <>
            {isEditing && !isAllOutfits ? <AddOutfitsButton onPress={() => setIsPicking(true)} /> : null}

            {outfits.length === 0 && !isEditing ? (
              <View className="mt-8 items-center gap-2">
                {isAllOutfits ? (
                  <Text className="text-center font-body text-base text-sage-500">
                    Outfits you save from the Stylist show up here.
                  </Text>
                ) : (
                  <>
                    <Text className="font-body text-base text-sage-500">No outfits yet.</Text>
                    <Pressable onPress={startAdding} accessibilityRole="button" hitSlop={8}>
                      <Text className="font-label text-base text-sage-700 underline">Add outfits</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : (
              <OutfitGrid
                outfits={outfits}
                renderTile={(outfit) => (
                  <OutfitTile
                    outfit={outfit}
                    disabled={removingId === outfit.id}
                    onPress={
                      isEditing ? undefined : () => router.push({ pathname: '/outfit/[id]', params: { id: outfit.id } })
                    }
                    onRemove={isEditing ? () => removeOutfit(outfit) : undefined}
                  />
                )}
              />
            )}
          </>
        )}
      </ScrollView>

      <AddOutfitsSheet
        visible={isPicking}
        existingIds={outfits.map((outfit) => outfit.id)}
        onCancel={() => setIsPicking(false)}
        onAdd={add}
      />
      <ConfirmSheet
        visible={deleting !== null}
        title="Delete this outfit?"
        message={`“${deleting?.name}” will be removed from All saved outfits and every collection. This can't be undone.`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </SafeAreaView>
  );
}
