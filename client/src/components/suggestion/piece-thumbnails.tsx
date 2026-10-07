import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';

import { FlatLay } from '@/components/suggestion/flat-lay';
import type { SuggestedPiece } from '@/services/stylist';

const TILE_SIZE = 66;
const TILE_PADDING = 6;
// Room above and to the right of the tiles for the remove badge, which the ScrollView would clip.
const BADGE_ROOM = 8;

type PieceThumbnailsProps = {
  items: SuggestedPiece[];
  selectedId: string | null; // null = the whole outfit
  stageColor: string;
  onSelect: (id: string | null) => void;
  flatLayItems?: SuggestedPiece[]; // the whole-outfit tile's pieces, if not all of `items`
  // The outfit details screen: a dashed "+" tile at the end, and a × on the selected piece.
  onAdd?: () => void;
  onRemove?: (id: string) => void;
  canRemove?: (id: string) => boolean;
};

// The whole outfit as a mini flat-lay, then one tile per piece. The active tile gets a ring.
export function PieceThumbnails({
  items,
  selectedId,
  stageColor,
  onSelect,
  flatLayItems = items,
  onAdd,
  onRemove,
  canRemove,
}: PieceThumbnailsProps) {
  const inner = TILE_SIZE - TILE_PADDING * 2;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: -BADGE_ROOM }}
      contentContainerStyle={{ paddingTop: BADGE_ROOM, paddingRight: BADGE_ROOM }}
      contentContainerClassName="gap-2.5">
      <Tile isActive={selectedId === null} label="Whole outfit" onPress={() => onSelect(null)} color={stageColor}>
        <FlatLay items={flatLayItems} width={inner} height={inner} />
      </Tile>
      {items.map((item) => {
        const isActive = selectedId === item.id;
        const showRemove = isActive && onRemove && (canRemove?.(item.id) ?? true);
        return (
          <View key={item.id}>
            <Tile isActive={isActive} label={item.name} onPress={() => onSelect(item.id)} color="#fffdf9">
              <Image
                source={{ uri: item.imageUrl }}
                contentFit="contain"
                accessibilityIgnoresInvertColors
                style={{ width: inner, height: inner }}
              />
            </Tile>
            {showRemove ? (
              <Pressable
                onPress={() => onRemove(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name} from the outfit`}
                hitSlop={6}
                className="absolute -right-1.5 -top-1.5 h-6 w-6 items-center justify-center rounded-full border-2 border-cream-200 bg-red-700">
                <Ionicons name="close" size={13} color="#fffdf9" />
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a piece"
          className="rounded-2xl border-2 border-transparent p-0.5">
          <View
            style={{ width: TILE_SIZE, height: TILE_SIZE }}
            className="items-center justify-center rounded-xl border-2 border-dashed border-sage-300">
            <Ionicons name="add" size={26} color="#61754e" />
          </View>
        </Pressable>
      ) : null}
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
