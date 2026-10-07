import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AiHint } from '@/components/item-details/select-field';
import { colorName } from '@/utils/colors';
import { formatTag } from '@/utils/format';

type ColorSectionProps = {
  colors: string[]; // 0-3 "#RRGGBB" values
  pattern: string | null;
  colorsHint?: string; // sparkle notes, as on SelectField
  patternHint?: string;
};

// The item's 1-3 colors as overlapping swatches, the main color's name, and its pattern.
// Tapping "+ n more" shows every color's name; tapping again goes back to just the main one.
export function ColorSection({ colors, pattern, colorsHint, patternHint }: ColorSectionProps) {
  const names = colors.map(colorName);
  const [showAll, setShowAll] = useState(false);

  return (
    <View className="gap-2">
      <View className="gap-0.5">
        <Text className="font-label text-base text-sage-700">Color</Text>
        {colorsHint ? <AiHint text={colorsHint} /> : null}
      </View>
      {colors.length === 0 ? (
        <Text className="font-body text-sm text-sage-500">No colors yet.</Text>
      ) : (
        <View className="flex-row items-center gap-3">
          <View accessible accessibilityLabel={`Colors: ${names.join(', ')}`} className="flex-row">
            {colors.map((hex, index) => (
              <View
                key={`${hex}-${index}`}
                style={{ backgroundColor: hex, marginLeft: index === 0 ? 0 : -10, zIndex: colors.length - index }}
                className="h-9 w-9 rounded-full border-2 border-cream-50"
              />
            ))}
          </View>
          {colors.length > 1 ? (
            <Pressable
              onPress={() => setShowAll((shown) => !shown)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAll }}
              accessibilityHint={showAll ? 'Shows only the main color' : 'Shows every color name'}
              hitSlop={8}
              className="shrink">
              {showAll ? (
                <Text className="font-body text-base text-sage-800">{listNames(names)}</Text>
              ) : (
                <Text className="font-body text-base text-sage-800">
                  {names[0]}
                  <Text className="text-sage-500"> + {colors.length - 1} more</Text>
                </Text>
              )}
            </Pressable>
          ) : (
            <Text className="font-body text-base text-sage-800">{names[0]}</Text>
          )}
        </View>
      )}
      <Text className="font-body text-sm text-sage-500">
        Pattern: <Text className="text-sage-700">{pattern ? formatTag(pattern) : 'No pattern set'}</Text>
      </Text>
      {patternHint ? <AiHint text={patternHint} /> : null}
    </View>
  );
}

// "Navy and White", or "Navy, White and Gray".
function listNames(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
