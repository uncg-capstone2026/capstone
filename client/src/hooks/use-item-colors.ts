import { useEffect, useState } from 'react';

import { SessionExpiredError } from '@/services/api';
import { forgetOtherItemColors, getItemColors } from '@/services/item-colors';
import { getItem, type ClosetItem } from '@/services/items';

// How many item details to fetch at once when filling in missing colors.
const CONCURRENT_FETCHES = 4;

// The closet items with their colors added from the device's cache. Items with no saved
// colors are fetched in the background (GET /api/items/:id, a few at a time, once per item),
// and their cards update as the colors arrive.
export function useItemColors(items: ClosetItem[]): ClosetItem[] {
  const [colors, setColors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;

    async function fill() {
      const ids = items.map((item) => item.id);
      await forgetOtherItemColors(ids);
      const saved = await getItemColors();
      if (cancelled) return;
      setColors(saved);

      const missing = ids.filter((id) => !(id in saved));
      let next = 0;
      async function worker() {
        while (!cancelled && next < missing.length) {
          const id = missing[next++];
          try {
            const details = await getItem(id); // getItem saves the colors
            if (!cancelled) setColors((current) => ({ ...current, [id]: details.colorHex }));
          } catch (e) {
            // An expired session stops the fill; anything else is retried next time.
            if (e instanceof SessionExpiredError) cancelled = true;
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENT_FETCHES }, worker));
    }

    // Once the list has loaded; an empty closet has nothing to fill (or prune).
    if (items.length > 0) void fill();
    return () => {
      cancelled = true;
    };
  }, [items]);

  return items.map((item) => (item.colorHex || !colors[item.id] ? item : { ...item, colorHex: colors[item.id] }));
}
