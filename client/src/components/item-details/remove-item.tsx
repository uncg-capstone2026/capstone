import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { isRequiredSlot, type ItemOutfit } from '@/services/items';

type RemoveItemProps = {
  outfits: ItemOutfit[]; // the saved outfits this item is in
  onRemove: () => Promise<void>;
};

// "Remove from closet" text link. Asks for confirmation inline before deleting, and says which
// saved outfits are deleted with it (where it's the top, bottom or one-piece).
export function RemoveItem({ outfits, onRemove }: RemoveItemProps) {
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
      {consequences(outfits).map((line) => (
        <Text key={line} className="font-body text-sm text-sage-700">
          {line}
        </Text>
      ))}
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

// What else the delete does, e.g. "This also deletes 2 outfits: Brunch fit and Easy layers."
// and "It's removed from 1 other outfit, which stays saved."
function consequences(outfits: ItemOutfit[]): string[] {
  const deleted = outfits.filter((outfit) => isRequiredSlot(outfit.slot));
  const kept = outfits.length - deleted.length;
  const lines: string[] = [];
  if (deleted.length > 0) {
    lines.push(`This also deletes ${count(deleted.length, 'outfit')}: ${listNames(deleted.map((o) => o.name))}.`);
  }
  if (kept > 0) {
    const other = deleted.length > 0 ? 'other ' : '';
    lines.push(`It's removed from ${kept} ${other}${kept === 1 ? 'outfit, which stays' : 'outfits, which stay'} saved.`);
  }
  return lines;
}

function count(n: number, noun: string): string {
  return n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
}

// "A", "A and B", "A, B and C", "A, B, C and 2 more"
function listNames(names: string[]): string {
  const MAX_SHOWN = 3;
  if (names.length > MAX_SHOWN) {
    return `${names.slice(0, MAX_SHOWN).join(', ')} and ${names.length - MAX_SHOWN} more`;
  }
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
