import { ColorPicker, Host } from '@expo/ui/swift-ui';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AiHint } from '@/components/item-details/select-field';
import { colorName, normalizeHex } from '@/utils/colors';

export const MAX_COLORS = 3;

type ColorEditorProps = {
  colors: string[]; // 0-3 "#RRGGBB" values, main color first
  onChange: (colors: string[]) => void;
  aiHint?: string;
};

// The item's colors as removable swatches, plus the iOS color picker to add one.
export function ColorEditor({ colors, onChange, aiHint }: ColorEditorProps) {
  // The picker reports every change while it's open, so the color it adds is replaced as the
  // user drags rather than added again. Reset once it's committed with "Add".
  const [pending, setPending] = useState<string | null>(null);

  function addPending() {
    if (!pending) return;
    if (!colors.includes(pending)) onChange([...colors, pending].slice(0, MAX_COLORS));
    setPending(null);
  }

  return (
    <View className="gap-3">
      <View className="gap-0.5">
        <Text className="font-label text-base text-sage-700">Colors</Text>
        {aiHint ? <AiHint text={aiHint} /> : null}
      </View>

      {colors.length === 0 ? (
        <Text className="font-body text-sm text-sage-500">No colors yet. Add one or use the dropper.</Text>
      ) : (
        <View className="gap-2">
          {colors.map((hex, index) => (
            <View key={hex} className="flex-row items-center gap-3">
              <View style={{ backgroundColor: hex }} className="h-9 w-9 rounded-full border-2 border-cream-50" />
              <Text className="flex-1 font-body text-base text-sage-800">
                {colorName(hex)}
                {index === 0 ? <Text className="text-sage-500"> · Main</Text> : null}
              </Text>
              <Pressable
                onPress={() => onChange(colors.filter((c) => c !== hex))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${colorName(hex)}`}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center">
                <Ionicons name="close" size={18} color="#61754e" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {colors.length < MAX_COLORS ? (
        <View className="flex-row items-center gap-3">
          <Host matchContents>
            <ColorPicker
              selection={pending ?? '#9CAF88'}
              onSelectionChange={(value) => setPending(normalizeHex(value))}
            />
          </Host>
          {pending ? (
            <>
              <Text className="flex-1 font-body text-base text-sage-800">{colorName(pending)}</Text>
              <Pressable onPress={addPending} accessibilityRole="button" className="rounded-full bg-sage-500 px-4 py-2">
                <Text className="font-label text-sm text-cream-50">Add</Text>
              </Pressable>
            </>
          ) : (
            <Text className="flex-1 font-body text-sm text-sage-600">Pick a color to add</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
