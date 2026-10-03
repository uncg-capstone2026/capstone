import { Image } from 'expo-image';
import { View } from 'react-native';

import type { ClothingCategory } from '@/services/items';
import type { SuggestedPiece } from '@/services/stylist';

type Slot = 'accessory' | 'outerwear' | 'top' | 'bottoms' | 'shoes';

// Where each piece sits, as fractions of the flat-lay's box: left, top, width, height.
// zIndex keeps outerwear behind the top it's layered over.
type Frame = { left: number; top: number; width: number; height: number; zIndex: number };

// Top and bottoms: the top is the largest piece (lower left), bottoms are tall and narrow
// (upper right) with the shoes below them, and an accessory in the top left.
const SEPARATES_LAYOUT: Record<Slot, Frame> = {
  accessory: { left: 0.02, top: 0, width: 0.26, height: 0.28, zIndex: 3 },
  outerwear: { left: 0, top: 0.14, width: 0.5, height: 0.62, zIndex: 1 },
  top: { left: 0.05, top: 0.3, width: 0.53, height: 0.7, zIndex: 2 },
  bottoms: { left: 0.6, top: 0, width: 0.36, height: 0.64, zIndex: 2 },
  shoes: { left: 0.6, top: 0.7, width: 0.34, height: 0.3, zIndex: 2 },
};

// A one-piece (or set) takes the top's place and runs the full height. The bottoms slot is
// empty, so the shoes move up and the accessory takes the top right instead.
const ONE_PIECE_LAYOUT: Record<Slot, Frame> = {
  accessory: { left: 0.62, top: 0.02, width: 0.3, height: 0.3, zIndex: 3 },
  outerwear: { left: 0, top: 0, width: 0.48, height: 0.7, zIndex: 1 },
  top: { left: 0.05, top: 0.04, width: 0.52, height: 0.96, zIndex: 2 },
  bottoms: { left: 0, top: 0, width: 0, height: 0, zIndex: 0 },
  shoes: { left: 0.6, top: 0.48, width: 0.36, height: 0.34, zIndex: 2 },
};

const SLOT_BY_CATEGORY: Record<ClothingCategory, Slot> = {
  tops: 'top',
  'one-piece': 'top',
  sets: 'top',
  bottoms: 'bottoms',
  outerwear: 'outerwear',
  shoes: 'shoes',
  accessories: 'accessory',
};

type FlatLayProps = {
  items: SuggestedPiece[];
  width: number;
  height: number;
};

// The outfit's cutouts placed freely in a box, like clothes laid out on a bed. Used full size
// on the stage and as the mini tile in the piece thumbnails.
export function FlatLay({ items, width, height }: FlatLayProps) {
  const isOnePiece = items.some((item) => item.category === 'one-piece' || item.category === 'sets');
  const layout = isOnePiece ? ONE_PIECE_LAYOUT : SEPARATES_LAYOUT;

  // One piece per slot. Any extra (e.g. a second accessory) is still in the thumbnails.
  const placed = new Map<Slot, SuggestedPiece>();
  for (const item of items) {
    const slot = SLOT_BY_CATEGORY[item.category];
    if (!placed.has(slot)) placed.set(slot, item);
  }

  return (
    <View style={{ width, height }}>
      {[...placed].map(([slot, item]) => {
        const frame = layout[slot];
        return (
          <Image
            key={item.id}
            source={{ uri: item.imageUrl }}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            style={{
              position: 'absolute',
              left: frame.left * width,
              top: frame.top * height,
              width: frame.width * width,
              height: frame.height * height,
              zIndex: frame.zIndex,
            }}
          />
        );
      })}
    </View>
  );
}
