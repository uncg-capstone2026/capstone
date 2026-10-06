import { View } from 'react-native';

import type { SavedOutfit } from '@/services/outfits';

type OutfitGridProps = {
  outfits: SavedOutfit[];
  renderTile: (outfit: SavedOutfit) => React.ReactNode;
};

// Two-column grid of square outfit tiles.
export function OutfitGrid({ outfits, renderTile }: OutfitGridProps) {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      {outfits.map((outfit) => (
        <View key={outfit.id} className="w-[48%]">
          {renderTile(outfit)}
        </View>
      ))}
    </View>
  );
}
