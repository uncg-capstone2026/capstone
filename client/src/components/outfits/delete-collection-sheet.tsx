import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OutfitCollection } from '@/services/outfits';

type DeleteCollectionSheetProps = {
  collection: OutfitCollection | null; // null hides the sheet
  onCancel: () => void;
  // Throws to keep the sheet open and show the error.
  onDelete: (collection: OutfitCollection) => Promise<void>;
};

// Bottom sheet confirming a collection delete. The outfits in it aren't deleted.
export function DeleteCollectionSheet({ collection, onCancel, onDelete }: DeleteCollectionSheetProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Measured out here: inside a Modal the insets can read 0 on the first frame and jump.
  const insets = useSafeAreaInsets();

  function cancel() {
    if (isDeleting) return;
    setError(null);
    onCancel();
  }

  async function confirm() {
    if (!collection || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(collection);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Modal visible={collection !== null} transparent animationType="fade" onRequestClose={cancel}>
      <View className="flex-1">
        <Pressable className="flex-1 bg-sage-900/40" onPress={cancel} accessibilityLabel="Close" />
        <View className="gap-4 rounded-t-3xl bg-cream-50 px-[22px] pt-6" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="gap-1.5">
            <Text accessibilityRole="header" className="font-heading text-xl text-sage-800">
              Delete “{collection?.name}”?
            </Text>
            <Text className="font-body text-sm text-sage-600">
              The outfits in it stay in All saved outfits.
            </Text>
          </View>

          {error ? <Text className="font-body text-sm text-red-700">{error}</Text> : null}

          <View className="flex-row gap-3">
            <Pressable
              onPress={cancel}
              disabled={isDeleting}
              accessibilityRole="button"
              className="flex-1 items-center rounded-full border border-sage-400 py-3.5 disabled:opacity-50">
              <Text className="font-label text-base text-sage-700">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              disabled={isDeleting}
              accessibilityRole="button"
              className="flex-1 items-center rounded-full bg-red-700 py-3.5 disabled:opacity-60">
              {isDeleting ? (
                <ActivityIndicator color="#fffdf9" />
              ) : (
                <Text className="font-label text-base text-cream-50">Delete</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
