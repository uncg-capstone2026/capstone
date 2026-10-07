import { useEffect, useState } from 'react';

import { DEFAULT_STAGE_COLOR, getOutfitColors, subscribeToOutfitColors } from '@/services/preferences';

// Each saved outfit's background colour. Updates as soon as one changes anywhere (e.g. on the
// outfit details screen), so screens underneath are already up to date on the way back.
export function useOutfitColors(): (outfitId: string) => string {
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getOutfitColors().then((next) => {
        if (!cancelled) setColors(next);
      });
    };
    refresh();
    const unsubscribe = subscribeToOutfitColors(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (outfitId) => colors[outfitId] ?? DEFAULT_STAGE_COLOR;
}
