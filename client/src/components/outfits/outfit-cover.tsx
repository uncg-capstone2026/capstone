import { useState } from 'react';
import { View } from 'react-native';

import { FlatLay } from '@/components/suggestion/flat-lay';
import type { OutfitPreview } from '@/services/outfits';

// A flat-lay that fills its parent. FlatLay places pieces in pixels, so this measures first.
export function OutfitCover({ items }: { items: OutfitPreview }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  return (
    <View
      className="flex-1"
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {size ? <FlatLay items={items} width={size.width} height={size.height} /> : null}
    </View>
  );
}
