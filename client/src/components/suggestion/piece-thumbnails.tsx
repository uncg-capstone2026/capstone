import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';

import { FlatLay } from '@/components/suggestion/flat-lay';
import type { SuggestedPiece } from '@/services/stylist';

const TILE_SIZE = 66;
const TILE_PADDING = 6;

type PieceThumbnailsProps = {
  items: SuggestedPiece[];
  selectedId: string | null; // null = the whole outfit
  stageColor: string;
  onSelect: (id: string | null) => void;
};

// The whole outfit as a mini flat-lay, then one tile per piece. The active tile gets a ring.
export function PieceThumbnails({ items, selectedId, stageColor, onSelect }: PieceThumbnailsProps) {
  const inner = TILE_SIZE - TILE_PADDING * 2;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5">
      <Tile isActive={selectedId === null} label="Whole outfit" onPress={() => onSelect(null)} color={stageColor}>
        <FlatLay items={items} width={inner} height={inner} />
      </Tile>
      {items.map((item) => (
        <Tile
          key={item.id}
          isActive={selectedId === item.id}
          label={item.name}
          onPress={() => onSelect(item.id)}
          color="#fffdf9">
          <Image
            source={{ uri: item.imageUrl }}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            style={{ width: inner, height: inner }}
          />
        </Tile>
      ))}
    </ScrollView>
  );
}

type TileProps = {
  isActive: boolean;
  label: string;
  color: string;
  onPress: () => void;
  children: React.ReactNode;
};

function Tile({ isActive, label, color, onPress, children }: TileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      className={`rounded-2xl border-2 p-0.5 ${isActive ? 'border-sage-500' : 'border-transparent'}`}>
      <View
        style={{ width: TILE_SIZE, height: TILE_SIZE, padding: TILE_PADDING, backgroundColor: color }}
        className="overflow-hidden rounded-xl">
        {children}
      </View>
    </Pressable>
  );
}
