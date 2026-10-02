import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type RemoveItemProps = {
  onRemove: () => Promise<void>;
};

// "Remove from closet" text link. Asks for confirmation inline before deleting.
export function RemoveItem({ onRemove }: RemoveItemProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    setIsRemoving(true);
    try {
      await onRemove();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setIsRemoving(false);
    }
  }

  if (!isConfirming) {
    return (
      <Pressable onPress={() => setIsConfirming(true)} accessibilityRole="button" className="self-center py-2">
        <Text className="font-label text-base text-red-700 underline">Remove from closet</Text>
      </Pressable>
    );
  }

  return (
    <View accessibilityLiveRegion="polite" className="gap-3 rounded-2xl border border-red-200 bg-cream-50 p-4">
      <Text className="font-body text-base text-sage-800">
        Remove this item from your closet? This can&apos;t be undone.
      </Text>
      {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}
      <View className="flex-row gap-3">
        <Pressable
          onPress={() => setIsConfirming(false)}
          disabled={isRemoving}
          accessibilityRole="button"
          className="flex-1 items-center rounded-xl border border-sage-200 bg-cream-100 py-2.5 disabled:opacity-60">
          <Text className="font-label text-base text-sage-700">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={remove}
          disabled={isRemoving}
          accessibilityRole="button"
          className="flex-1 items-center rounded-xl bg-red-700 py-2.5 disabled:opacity-60">
          {isRemoving ? (
            <ActivityIndicator color="#fffdf9" />
          ) : (
            <Text className="font-label text-base text-cream-50">Remove</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
