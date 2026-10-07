import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { OutfitGrid } from '@/components/outfits/outfit-grid';
import { OutfitTile } from '@/components/outfits/outfit-tile';
import { useOutfitColors } from '@/hooks/use-outfit-colors';
import { SessionExpiredError } from '@/services/api';
import { listOutfits, type SavedOutfit } from '@/services/outfits';

type AddOutfitsSheetProps = {
  visible: boolean;
  existingIds: string[]; // already in the collection: shown checked and can't be picked
  onCancel: () => void;
  // Throws to keep the sheet open and show the error.
  onAdd: (outfitIds: string[]) => Promise<void>;
};

// Page sheet listing every saved outfit to pick from, with Cancel and "Add (n)".
export function AddOutfitsSheet({ visible, existingIds, onCancel, onAdd }: AddOutfitsSheetProps) {
  const [outfits, setOutfits] = useState<SavedOutfit[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorFor = useOutfitColors();

  // Load (or reload) the outfits each time the sheet opens.
  function load() {
    setOutfits(null);
    setSelectedIds([]);
    setError(null);
    listOutfits()
      .then(setOutfits)
      .catch((e) => {
        if (e instanceof SessionExpiredError) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      });
  }

  function cancel() {
    if (isAdding) return;
    onCancel();
  }

  function toggle(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  }

  async function add() {
    if (selectedIds.length === 0 || isAdding) return;
    setIsAdding(true);
    setError(null);
    try {
      await onAdd(selectedIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setIsAdding(false);
    }
  }

  const canAdd = selectedIds.length > 0 && !isAdding;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={load}
      onRequestClose={cancel}>
      <View className="flex-1 bg-cream-100">
        <View className="flex-row items-center justify-between border-b border-sage-200 px-4 py-3.5">
          <Pressable onPress={cancel} accessibilityRole="button" hitSlop={8} className="min-w-[64px]">
            <Text className="font-label text-base text-sage-700">Cancel</Text>
          </Pressable>
          <Text accessibilityRole="header" className="font-heading text-lg text-sage-800">
            Add outfits
          </Text>
          <Pressable
            onPress={add}
            disabled={!canAdd}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canAdd }}
            hitSlop={8}
            className="min-w-[64px] items-end disabled:opacity-40">
            {isAdding ? (
              <ActivityIndicator color="#4d5d3f" />
            ) : (
              <Text className="font-label text-base text-sage-700">
                {selectedIds.length > 0 ? `Add (${selectedIds.length})` : 'Add'}
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="gap-4 px-6 pb-10 pt-4">
          {error ? <Text className="font-body text-sm text-red-700">{error}</Text> : null}

          {!outfits ? (
            error ? null : <ActivityIndicator color="#7a9264" className="mt-8" />
          ) : outfits.length === 0 ? (
            <Text className="mt-8 text-center font-body text-base text-sage-500">No saved outfits yet.</Text>
          ) : (
            <OutfitGrid
              outfits={outfits}
              renderTile={(outfit) => {
                const isExisting = existingIds.includes(outfit.id);
                return (
                  <OutfitTile
                    outfit={outfit}
                    backgroundColor={colorFor(outfit.id)}
                    isSelected={isExisting || selectedIds.includes(outfit.id)}
                    disabled={isExisting}
                    onPress={() => toggle(outfit.id)}
                  />
                );
              }}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
