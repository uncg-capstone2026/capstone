import { ColorPicker, Host } from '@expo/ui/swift-ui';
import { Pressable, Text, View } from 'react-native';

import { DEFAULT_STAGE_COLOR } from '@/services/preferences';
import { normalizeHex } from '@/utils/colors';

// White, off-white, then shades of the default sage from lightest to darkest.
export const STAGE_COLOR_PRESETS = ['#FFFFFF', '#FAF8F3', '#E9EEE1', DEFAULT_STAGE_COLOR, '#D3DDC5', '#B3C49F'];

type StageColorPopoverProps = {
  color: string;
  onChange: (color: string) => void;
};

// Sits above the stage's colour button: a row of presets and the iOS colour picker.
export function StageColorPopover({ color, onChange }: StageColorPopoverProps) {
  return (
    <View
      className="gap-3 rounded-2xl bg-cream-50 p-3"
      style={{ shadowColor: '#2D362A', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <View className="flex-row gap-2.5">
        {STAGE_COLOR_PRESETS.map((preset) => {
          const isSelected = preset.toUpperCase() === color.toUpperCase();
          return (
            <Pressable
              key={preset}
              onPress={() => onChange(preset)}
              accessibilityRole="button"
              accessibilityLabel={`Background ${preset}`}
              accessibilityState={{ selected: isSelected }}
              className={`h-9 w-9 items-center justify-center rounded-full ${isSelected ? 'border-2 border-sage-600' : ''}`}>
              <View style={{ backgroundColor: preset }} className="h-7 w-7 rounded-full border border-sage-200" />
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-body text-sm text-sage-700">Custom colour</Text>
        <Host matchContents>
          <ColorPicker selection={color} onSelectionChange={(value) => onChange(normalizeHex(value))} />
        </Host>
      </View>
    </View>
  );
}
