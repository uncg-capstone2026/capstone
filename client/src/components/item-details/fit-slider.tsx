import { useRef, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { FIT_STEPS, type ClothingFit } from '@/services/items';

const THUMB_SIZE = 24;

type FitSliderProps = {
  value: ClothingFit | null;
  onChange: (fit: ClothingFit) => void;
};

// A 5-step slider from Fitted to Oversized. Tap a step or drag along the track. While the
// finger is down, a tooltip above the thumb explains the step under it.
export function FitSlider({ value, onChange }: FitSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null); // step under the finger
  const activeRef = useRef<number | null>(null); // the same, readable on release without a re-render
  const trackX = useRef(0); // the track's left edge on screen, worked out when a touch starts

  const valueIndex = FIT_STEPS.findIndex((step) => step.fit === value);
  const shownIndex = activeIndex ?? valueIndex;
  const lastIndex = FIT_STEPS.length - 1;
  const stepX = (index: number) => (trackWidth * index) / lastIndex;

  function indexAt(pageX: number) {
    if (!trackWidth) return 0;
    const ratio = Math.min(Math.max((pageX - trackX.current) / trackWidth, 0), 1);
    return Math.round(ratio * lastIndex);
  }

  // Every child ignores touches, so locationX is measured from the track's left edge. Working
  // the edge out from the first touch avoids an async measure that a quick tap could beat.
  function start(e: GestureResponderEvent) {
    trackX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
    move(e);
  }

  function move(e: GestureResponderEvent) {
    activeRef.current = indexAt(e.nativeEvent.pageX);
    setActiveIndex(activeRef.current);
  }

  function finish() {
    const index = activeRef.current;
    activeRef.current = null;
    setActiveIndex(null);
    if (index !== null && FIT_STEPS[index].fit !== value) onChange(FIT_STEPS[index].fit);
  }

  function cancel() {
    activeRef.current = null;
    setActiveIndex(null);
  }

  function adjust(delta: number) {
    const next = Math.min(Math.max((valueIndex < 0 ? 2 : valueIndex) + delta, 0), lastIndex);
    if (FIT_STEPS[next].fit !== value) onChange(FIT_STEPS[next].fit);
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-label text-base text-sage-700">Fit</Text>
        <Text className="font-body text-base text-sage-600">
          {valueIndex >= 0 ? FIT_STEPS[valueIndex].label : 'Not set'}
        </Text>
      </View>

      {/* Room above the track for the tooltip. */}
      <View className="pt-14">
        <View
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={start}
          onResponderMove={move}
          onResponderRelease={finish}
          onResponderTerminate={cancel}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Fit"
          accessibilityValue={{ text: valueIndex >= 0 ? FIT_STEPS[valueIndex].label : 'Not set' }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => adjust(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          style={{ height: THUMB_SIZE }}
          className="mx-3 justify-center">
          <View pointerEvents="none" className="h-1.5 rounded-full bg-sage-200" />
          {FIT_STEPS.map((step, index) => (
            <View
              key={step.fit}
              pointerEvents="none"
              style={{ left: stepX(index) - 5 }}
              className="absolute h-2.5 w-2.5 rounded-full bg-sage-300"
            />
          ))}
          {shownIndex >= 0 && trackWidth ? (
            <View
              pointerEvents="none"
              style={{
                left: stepX(shownIndex) - THUMB_SIZE / 2,
                width: THUMB_SIZE,
                height: THUMB_SIZE,
              }}
              className="absolute rounded-full border-2 border-cream-50 bg-sage-600"
            />
          ) : null}
          {activeIndex !== null && trackWidth ? (
            <Tooltip x={stepX(activeIndex)} trackWidth={trackWidth} index={activeIndex} />
          ) : null}
        </View>

        <View className="mt-2 flex-row justify-between">
          {FIT_STEPS.map((step, index) => (
            <Pressable
              key={step.fit}
              onPress={() => step.fit !== value && onChange(step.fit)}
              accessibilityElementsHidden
              importantForAccessibility="no"
              hitSlop={6}>
              <Text
                className={`font-body text-xs ${index === valueIndex ? 'text-sage-800' : 'text-sage-500'}`}>
                {step.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const TOOLTIP_WIDTH = 200;

// Kept inside the track's width so the first and last steps' tooltips don't run off screen.
function Tooltip({ x, trackWidth, index }: { x: number; trackWidth: number; index: number }) {
  const left = Math.min(Math.max(x - TOOLTIP_WIDTH / 2, -12), trackWidth - TOOLTIP_WIDTH + 12);
  const step = FIT_STEPS[index];
  return (
    <View
      pointerEvents="none"
      style={{ left, width: TOOLTIP_WIDTH, bottom: THUMB_SIZE + 8 }}
      className="absolute rounded-xl bg-sage-800 px-3 py-2">
      <Text className="font-label text-sm text-cream-50">{step.label}</Text>
      <Text className="font-body text-xs text-cream-100">{step.description}</Text>
    </View>
  );
}
