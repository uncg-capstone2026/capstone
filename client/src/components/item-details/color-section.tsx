import { Text, View } from 'react-native';

import { colorName } from '@/utils/colors';
import { formatTag } from '@/utils/format';

type ColorSectionProps = {
  colors: string[]; // 0-3 "#RRGGBB" values
  pattern: string | null;
};

// The item's 1-3 colors as overlapping swatches, the main color's name, and its pattern.
export function ColorSection({ colors, pattern }: ColorSectionProps) {
  const names = colors.map(colorName);

  return (
    <View className="gap-2">
      <Text className="font-label text-base text-sage-700">Color</Text>
      {colors.length === 0 ? (
        <Text className="font-body text-sm text-sage-500">No colors yet — use the dropper.</Text>
      ) : (
        <View
          accessible
          accessibilityLabel={`Colors: ${names.join(', ')}`}
          className="flex-row items-center gap-3">
          <View className="flex-row">
            {colors.map((hex, index) => (
              <View
                key={`${hex}-${index}`}
                style={{ backgroundColor: hex, marginLeft: index === 0 ? 0 : -10, zIndex: colors.length - index }}
                className="h-9 w-9 rounded-full border-2 border-cream-50"
              />
            ))}
          </View>
          <Text className="font-body text-base text-sage-800">
            {names[0]}
            {colors.length > 1 ? (
              <Text className="text-sage-500"> + {colors.length - 1} more</Text>
            ) : null}
          </Text>
        </View>
      )}
      <Text className="font-body text-sm text-sage-500">
        Pattern: <Text className="text-sage-700">{pattern ? formatTag(pattern) : 'No pattern set'}</Text>
      </Text>
    </View>
  );
}
