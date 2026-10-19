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
  bottoms: { left: 0.6, top: 0, width: 0.36, height: 0.6, zIndex: 2 },
  shoes: { left: 0.58, top: 0.6, width: 0.4, height: 0.4, zIndex: 2 },
};

// A one-piece takes the top's place and runs the full height. The bottoms slot is
// empty, so the shoes move up and the accessory takes the top right instead.
const ONE_PIECE_LAYOUT: Record<Slot, Frame> = {
  accessory: { left: 0.62, top: 0.02, width: 0.3, height: 0.3, zIndex: 3 },
  outerwear: { left: 0, top: 0, width: 0.48, height: 0.7, zIndex: 1 },
  top: { left: 0.05, top: 0.04, width: 0.52, height: 0.96, zIndex: 2 },
  bottoms: { left: 0, top: 0, width: 0, height: 0, zIndex: 0 },
  shoes: { left: 0.58, top: 0.42, width: 0.4, height: 0.46, zIndex: 2 },
};

// How far each extra piece in a taken slot is moved, as a fraction of the box, so pieces
// added to a slot (e.g. a second accessory) overlap the first instead of hiding behind it.
const EXTRA_OFFSET = 0.08;

const SLOT_BY_CATEGORY: Record<ClothingCategory, Slot> = {
  tops: 'top',
  'one-piece': 'top',
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
  const isOnePiece = items.some((item) => item.category === 'one-piece');
  const layout = isOnePiece ? ONE_PIECE_LAYOUT : SEPARATES_LAYOUT;

  // Untagged pieces go with the accessories, as on the server. Extra pieces in a slot are
  // offset from the first, toward the middle of the box, and layered above it.
  const perSlot = new Map<Slot, number>();
  const placed = items.map((item) => {
    const slot = item.category ? SLOT_BY_CATEGORY[item.category] : 'accessory';
    const extra = perSlot.get(slot) ?? 0;
    perSlot.set(slot, extra + 1);
    return { item, frame: offsetFrame(layout[slot], extra) };
  });

  return (
    <View style={{ width, height }}>
      {placed.map(({ item, frame }) => (
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
      ))}
    </View>
  );
}

// The slot's frame for its `extra`th additional piece (0 = the first, unmoved), kept inside the box.
function offsetFrame(frame: Frame, extra: number): Frame {
  if (extra === 0) return frame;
  const shift = (start: number, size: number) => {
    const towardMiddle = start + size / 2 < 0.5 ? 1 : -1;
    return Math.min(Math.max(start + towardMiddle * extra * EXTRA_OFFSET, 0), 1 - size);
  };
  return {
    ...frame,
    left: shift(frame.left, frame.width),
    top: shift(frame.top, frame.height),
    zIndex: frame.zIndex + extra,
  };
}
