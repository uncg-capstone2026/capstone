import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlatLay } from '@/components/suggestion/flat-lay';
import { StageColorPopover } from '@/components/suggestion/stage-color-popover';
import type { SuggestedPiece } from '@/services/stylist';

export const STAGE_HEIGHT = 420;
// How far the sheet below slides up over the stage.
export const SHEET_OVERLAP = 22;

const OVERLAY_BG = 'rgba(255, 253, 249, 0.85)';
const SIDE_PADDING = 16;
// The flat-lay's wrapper view gets flattened away, so its pieces' zIndex values compete with
// the overlay controls directly. Keep the controls above every piece so they stay tappable.
const CONTROLS_Z_INDEX = 10;

type OutfitStageProps = {
  items: SuggestedPiece[];
  selectedPiece: SuggestedPiece | null; // null shows the whole flat-lay
  color: string;
  isColorPopoverOpen: boolean;
  onToggleColorPopover: () => void;
  onChangeColor: (color: string) => void;
  onBack: () => void;
};

export function OutfitStage({
  items,
  selectedPiece,
  color,
  isColorPopoverOpen,
  onToggleColorPopover,
  onChangeColor,
  onBack,
}: OutfitStageProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // The pieces stay clear of the overlay controls at the top and the sheet at the bottom.
  const contentTop = insets.top + 52;
  const contentWidth = width - SIDE_PADDING * 2;
  const contentHeight = STAGE_HEIGHT - contentTop - SHEET_OVERLAP - 12;

  return (
    <View style={{ height: STAGE_HEIGHT, backgroundColor: color }}>
      <View style={{ position: 'absolute', left: SIDE_PADDING, top: contentTop }}>
        {selectedPiece ? (
          <Image
            source={{ uri: selectedPiece.imageUrl }}
            contentFit="contain"
            accessibilityLabel={selectedPiece.name}
            accessibilityIgnoresInvertColors
            style={{ width: contentWidth, height: contentHeight }}
          />
        ) : (
          <FlatLay items={items} width={contentWidth} height={contentHeight} />
        )}
      </View>

      <View
        className="absolute left-0 right-0 flex-row items-center justify-between"
        style={{ top: insets.top + 6, paddingHorizontal: SIDE_PADDING, zIndex: CONTROLS_Z_INDEX }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ backgroundColor: OVERLAY_BG }}
          className="h-10 w-10 items-center justify-center rounded-full">
          <Ionicons name="chevron-back" size={22} color="#4d5d3f" />
        </Pressable>
        <View style={{ backgroundColor: OVERLAY_BG }} className="rounded-full px-3 py-1.5">
          <Text className="font-label text-[11px] uppercase tracking-widest text-sage-500">Suggested</Text>
        </View>
      </View>

      <View className="absolute items-end gap-2" style={{ right: SIDE_PADDING, bottom: SHEET_OVERLAP + 12, zIndex: CONTROLS_Z_INDEX }}>
        {isColorPopoverOpen ? <StageColorPopover color={color} onChange={onChangeColor} /> : null}
        <Pressable
          onPress={onToggleColorPopover}
          accessibilityRole="button"
          accessibilityLabel="Background colour"
          accessibilityState={{ expanded: isColorPopoverOpen }}
          style={{ backgroundColor: OVERLAY_BG }}
          className="h-10 flex-row items-center gap-1.5 rounded-full px-3">
          <View style={{ backgroundColor: color }} className="h-4 w-4 rounded-full border border-sage-300" />
          <Ionicons name="color-palette-outline" size={18} color="#4d5d3f" />
        </Pressable>
      </View>
    </View>
  );
}
