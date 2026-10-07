import AsyncStorage from '@react-native-async-storage/async-storage';

// Each closet item's colors (main first), kept on this device. GET /api/items doesn't send
// colors, so the closet reads them from here to give white items a tan card. They're saved
// whenever an item's details load or are saved (getItem and updateItem in services/items.ts),
// and useItemColors fetches any that are missing.
const ITEM_COLORS_KEY = 'styleme.item-colors';

// Loaded from storage once, then kept in memory. Every write saves the whole map.
let cache: Record<string, string[]> | null = null;

export async function getItemColors(): Promise<Record<string, string[]>> {
  if (cache) return cache;
  try {
    const stored = await AsyncStorage.getItem(ITEM_COLORS_KEY);
    cache = stored ? (JSON.parse(stored) as Record<string, string[]>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export async function rememberItemColors(itemId: string, colorHex: string[]): Promise<void> {
  const colors = await getItemColors();
  cache = { ...colors, [itemId]: colorHex };
  await save();
}

// Drops items that are no longer in the closet, so storage never outgrows it.
export async function forgetOtherItemColors(itemIds: string[]): Promise<void> {
  const colors = await getItemColors();
  const keep = new Set(itemIds);
  const stale = Object.keys(colors).filter((id) => !keep.has(id));
  if (stale.length === 0) return;
  cache = Object.fromEntries(Object.entries(colors).filter(([id]) => keep.has(id)));
  await save();
}

async function save(): Promise<void> {
  try {
    await AsyncStorage.setItem(ITEM_COLORS_KEY, JSON.stringify(cache));
  } catch {
    // Still in memory for this session; it's fetched again next launch.
  }
}
