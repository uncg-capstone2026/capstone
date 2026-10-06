import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { OutfitCover } from '@/components/outfits/outfit-cover';
import type { SavedOutfit } from '@/services/outfits';

type OutfitTileProps = {
  outfit: SavedOutfit;
  onPress?: () => void; // opens the outfit; not used in edit mode
  onRemove?: () => void; // shows the "−" badge (edit mode)
  isSelected?: boolean; // the "Add outfits" picker: a ring and a check
  disabled?: boolean;
};

// Square tile with the outfit as a flat-lay.
export function OutfitTile({ outfit, onPress, onRemove, isSelected, disabled }: OutfitTileProps) {
  const isPicker = isSelected !== undefined;

  return (
    <View style={{ aspectRatio: 1 }} className="w-full">
      <Pressable
        onPress={onPress}
        disabled={disabled || !onPress}
        accessibilityRole={isPicker ? 'checkbox' : 'button'}
        accessibilityLabel={outfit.name}
        accessibilityState={isPicker ? { checked: isSelected, disabled } : undefined}
        className={`flex-1 overflow-hidden rounded-2xl border-2 bg-cream-50 p-3 active:opacity-80 ${
          isSelected ? 'border-sage-500' : 'border-transparent'
        } ${disabled ? 'opacity-50' : ''}`}>
        <OutfitCover items={outfit.items} />
      </Pressable>

      {isPicker ? (
        <View
          pointerEvents="none"
          className={`absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full border-2 ${
            isSelected ? 'border-sage-500 bg-sage-500' : 'border-sage-300 bg-cream-50'
          }`}>
          {isSelected ? <Ionicons name="checkmark" size={14} color="#fffdf9" /> : null}
        </View>
      ) : null}

      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${outfit.name}`}
          hitSlop={8}
          className="absolute -right-1.5 -top-1.5 h-7 w-7 items-center justify-center rounded-full border-2 border-cream-100 bg-red-700">
          <Ionicons name="remove" size={16} color="#fffdf9" />
        </Pressable>
      ) : null}
    </View>
  );
}
