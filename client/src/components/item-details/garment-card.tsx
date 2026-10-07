import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { SessionExpiredError } from '@/services/api';
import { getItemColorGrid, type ItemColorGrid } from '@/services/items';
import { colorName } from '@/utils/colors';

const RING_SIZE = 32;
// On a touch screen the ring sits above the finger so the finger doesn't hide it.
const TOUCH_RING_OFFSET = Platform.OS === 'web' ? 0 : 44;

type Size = { width: number; height: number };
type Hover = { x: number; y: number; color: string | null };

type GarmentCardProps = {
  itemId: string;
  imageUrl: string;
  name: string;
};

// The item's cutout on a soft card, with the color dropper in the corner and its status bar below.
// A picked color is only shown in the status bar; it isn't saved to the item.
// The dropper reads colors from a small grid the server makes from the image (loaded once, the
// first time it's turned on), so the ring can show the color under the finger with no requests.
export function GarmentCard({ itemId, imageUrl, name }: GarmentCardProps) {
  const [isOn, setIsOn] = useState(false);
  const [grid, setGrid] = useState<ItemColorGrid | null>(null);
  const [isLoadingGrid, setIsLoadingGrid] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [area, setArea] = useState<Size | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  async function toggle() {
    if (isOn) {
      setIsOn(false);
      setHover(null);
      return;
    }
    setUnavailable(null);
    setPicked(null);
    setIsOn(true);
    if (grid) return;

    setIsLoadingGrid(true);
    try {
      setGrid(await getItemColorGrid(itemId));
    } catch (e) {
      setIsOn(false);
      if (!(e instanceof SessionExpiredError)) {
        setUnavailable(e instanceof Error ? e.message : "Couldn't load the colors. Please try again.");
      }
    } finally {
      setIsLoadingGrid(false);
    }
  }

  // The color under a point in the image area, or null over the transparent background.
  // The image is drawn with contentFit="contain", so allow for the letterbox around it.
  function colorAt(x: number, y: number): string | null {
    if (!grid || !area) return null;
    const scale = Math.min(area.width / grid.width, area.height / grid.height);
    const left = (area.width - grid.width * scale) / 2;
    const top = (area.height - grid.height * scale) / 2;
    const col = Math.floor((x - left) / scale);
    const row = Math.floor((y - top) / scale);
    if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
    return grid.pixels[row * grid.width + col] ?? null;
  }

  function aim(x: number, y: number) {
    setHover({ x, y, color: colorAt(x, y) });
  }

  function onTouch(e: GestureResponderEvent) {
    aim(e.nativeEvent.locationX, e.nativeEvent.locationY);
  }

  function pick() {
    const color = hover?.color;
    if (Platform.OS !== 'web') setHover(null);
    if (!color) return;
    setPicked(color);
  }

  const canAim = isOn && grid !== null;

  return (
    <View className="gap-2">
      <View style={{ aspectRatio: 1 }} className="w-full rounded-3xl bg-cream-50 p-4">
        <View
          className="flex-1"
          onLayout={(e) => setArea(e.nativeEvent.layout)}
          onStartShouldSetResponder={() => canAim}
          onMoveShouldSetResponder={() => canAim}
          // Keep the touch while aiming, instead of letting the page scroll take it.
          onResponderTerminationRequest={() => false}
          onResponderGrant={onTouch}
          onResponderMove={onTouch}
          onResponderRelease={pick}
          onResponderTerminate={() => setHover(null)}
          // Web: the ring follows the cursor without a click.
          onPointerMove={
            Platform.OS === 'web' && canAim
              ? (e) => aim(e.nativeEvent.offsetX, e.nativeEvent.offsetY)
              : undefined
          }
          onPointerLeave={Platform.OS === 'web' ? () => setHover(null) : undefined}
          style={Platform.OS === 'web' && canAim ? { cursor: 'pointer' } : undefined}>
          <Image
            source={{ uri: imageUrl }}
            contentFit="contain"
            pointerEvents="none"
            accessibilityLabel={name}
            style={{ width: '100%', height: '100%' }}
          />
          {canAim && hover ? (
            <View
              pointerEvents="none"
              style={{
                left: hover.x - RING_SIZE / 2,
                top: hover.y - RING_SIZE / 2 - TOUCH_RING_OFFSET,
                width: RING_SIZE,
                height: RING_SIZE,
                backgroundColor: hover.color ?? 'transparent',
              }}
              className="absolute rounded-full border-[3px] border-cream-50 shadow"
            />
          ) : null}
        </View>

        <Pressable
          onPress={toggle}
          accessibilityRole="switch"
          accessibilityLabel="Color dropper"
          accessibilityState={{ checked: isOn }}
          className={`absolute right-3 top-3 h-10 w-10 items-center justify-center rounded-full border ${
            isOn ? 'border-sage-500 bg-sage-500' : 'border-sage-200 bg-cream-100'
          }`}>
          {isLoadingGrid ? (
            <ActivityIndicator size="small" color="#fffdf9" />
          ) : (
            <MaterialCommunityIcons name="eyedropper" size={20} color={isOn ? '#fffdf9' : '#37402f'} />
          )}
        </Pressable>
      </View>

      <DropperStatus isOn={isOn} isLoading={isLoadingGrid} unavailable={unavailable} picked={picked} />
    </View>
  );
}

type DropperStatusProps = {
  isOn: boolean;
  isLoading: boolean;
  unavailable: string | null;
  picked: string | null;
};

function DropperStatus({ isOn, isLoading, unavailable, picked }: DropperStatusProps) {
  let content;
  if (unavailable) {
    content = <Text className="font-body text-sm text-sage-600">{unavailable}</Text>;
  } else if (!isOn) {
    content = (
      <View className="gap-0.5">
        <Text className="font-label text-sm text-sage-700">Color dropper is off</Text>
        <Text className="font-body text-xs text-sage-500">
          Tap the dropper to read out the color of any part of this item.
        </Text>
      </View>
    );
  } else if (isLoading) {
    content = <Text className="font-body text-sm text-sage-600">Loading colors…</Text>;
  } else if (picked) {
    content = (
      <View className="flex-row items-center gap-3">
        <View style={{ backgroundColor: picked }} className="h-7 w-7 rounded-full border-2 border-cream-50" />
        <Text className="font-label text-sm text-sage-700">{colorName(picked)}</Text>
        <Text className="font-body text-sm uppercase text-sage-500">{picked}</Text>
      </View>
    );
  } else {
    content = <Text className="font-body text-sm text-sage-600">Tap the item to pick a color.</Text>;
  }

  return (
    <View accessibilityLiveRegion="polite" className="min-h-[52px] justify-center rounded-2xl bg-cream-50 px-4 py-2.5">
      {content}
    </View>
  );
}
