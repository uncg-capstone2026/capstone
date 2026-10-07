import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import type { SuggestedPiece } from '@/services/stylist';

type PiecePickerSheetProps = {
  visible: boolean;
  title: string; // e.g. "Swap top" or "Add a piece"
  pieces: SuggestedPiece[] | null; // null while the closet loads
  checkedId?: string; // the current piece when swapping
  emptyMessage: string;
  onCancel: () => void;
  // Throws to keep the sheet open and show the error.
  onPick: (piece: SuggestedPiece) => Promise<void>;
};

// A page sheet with a grid of closet pieces. Tapping one picks it and closes the sheet.
export function PiecePickerSheet({
  visible,
  title,
  pieces,
  checkedId,
  emptyMessage,
  onCancel,
  onPick,
}: PiecePickerSheetProps) {
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (pickingId) return;
    setError(null);
    onCancel();
  }

  async function pick(piece: SuggestedPiece) {
    if (pickingId || piece.id === checkedId) return;
    setPickingId(piece.id);
    setError(null);
    try {
      await onPick(piece);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setPickingId(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancel}>
      <View className="flex-1 bg-cream-100">
        <View className="flex-row items-center justify-between border-b border-sage-200 px-4 py-3.5">
          <Pressable onPress={cancel} accessibilityRole="button" hitSlop={8} className="min-w-[64px]">
            <Text className="font-label text-base text-sage-700">Cancel</Text>
          </Pressable>
          <Text accessibilityRole="header" className="font-heading text-lg text-sage-800">
            {title}
          </Text>
          <View className="min-w-[64px]" />
        </View>

        <ScrollView contentContainerClassName="gap-4 px-6 pb-10 pt-4">
          {error ? <Text className="font-body text-sm text-red-700">{error}</Text> : null}

          {!pieces ? (
            <ActivityIndicator color="#7a9264" className="mt-8" />
          ) : pieces.length === 0 ? (
            <Text className="mt-8 text-center font-body text-base text-sage-500">{emptyMessage}</Text>
          ) : (
            <View className="flex-row flex-wrap justify-between gap-y-4">
              {pieces.map((piece) => {
                const isChecked = piece.id === checkedId;
                return (
                  <Pressable
                    key={piece.id}
                    onPress={() => pick(piece)}
                    disabled={pickingId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={piece.name}
                    accessibilityState={{ selected: isChecked, busy: pickingId === piece.id }}
                    className="w-[48%] gap-1.5">
                    <View
                      style={{ aspectRatio: 1 }}
                      className={`w-full overflow-hidden rounded-2xl border-2 bg-cream-50 p-3 ${
                        isChecked ? 'border-sage-500' : 'border-transparent'
                      }`}>
                      <Image
                        source={{ uri: piece.imageUrl }}
                        contentFit="contain"
                        accessibilityIgnoresInvertColors
                        style={{ width: '100%', height: '100%' }}
                      />
                      {isChecked ? (
                        <View className="absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full bg-sage-500">
                          <Ionicons name="checkmark" size={14} color="#fffdf9" />
                        </View>
                      ) : null}
                      {pickingId === piece.id ? (
                        <View className="absolute inset-0 items-center justify-center bg-cream-50/70">
                          <ActivityIndicator color="#4d5d3f" />
                        </View>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} className="font-body text-sm text-sage-700">
                      {piece.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
