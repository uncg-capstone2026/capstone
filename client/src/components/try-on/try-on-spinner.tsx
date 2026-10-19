import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { PanResponder, View } from 'react-native';

import type { TryOnFrame } from '@/services/stylist';

// How far a drag moves before stepping to the next frame.
const STEP_PX = 24;

// A 360° spin of the try-on frames: dragging steps through positions 0 → 7 → 0, starting
// on the front. Frames without an image are skipped. Every frame is mounted and stacked,
// with only the current one visible, so stepping never waits on an image load; preload the
// URLs (Image.prefetch) before showing this.
export function TryOnSpinner({ frames, accessibilityLabel }: { frames: TryOnFrame[]; accessibilityLabel: string }) {
  const available = useMemo(
    () =>
      frames
        .filter((frame): frame is TryOnFrame & { imageUrl: string } => !!frame.imageUrl)
        .sort((a, b) => a.position - b.position),
    [frames],
  );
  // `start` is the frame a drag began on, so each move steps relative to it.
  const [{ index }, setSpin] = useState({ index: 0, start: 0 });
  const count = available.length;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Horizontal drags only, so vertical scrolls and taps pass through.
        onMoveShouldSetPanResponder: (_, g) =>
          count > 1 && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => setSpin((spin) => ({ ...spin, start: spin.index })),
        // Dragging left turns the person to their right (the next position).
        onPanResponderMove: (_, g) =>
          setSpin((spin) => {
            const next = wrap(spin.start - Math.round(g.dx / STEP_PX), count);
            return next === spin.index ? spin : { ...spin, index: next };
          }),
        onPanResponderTerminationRequest: () => false,
      }),
    [count],
  );

  const current = available[Math.min(index, count - 1)];

  function step(by: number) {
    if (count > 1) setSpin((spin) => ({ ...spin, index: wrap(spin.index + by, count) }));
  }

  return (
    <View
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: current ? angleLabel(current) : undefined }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ flex: 1 }}>
      {available.map((frame, i) => (
        <Image
          key={frame.position}
          source={{ uri: frame.imageUrl }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: i === index ? 1 : 0 }}
        />
      ))}
    </View>
  );
}

function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

function angleLabel(frame: TryOnFrame): string {
  if (frame.position === 0) return 'Front';
  if (frame.position === 4) return 'Back';
  return `Turned ${frame.angle}°`;
}
