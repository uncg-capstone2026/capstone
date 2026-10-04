import {
  Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException,
} from '@nestjs/common';
import type { Category, Item } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { WeatherService } from '../weather/weather.service';
import { QueryExpansionService } from '../gemini/query-expansion/service';
import { OutfitPlanningService } from '../gemini/outfit-planning/service';
import { OutfitSelectionService, type OutfitCandidate } from './outfit-selection/service';
import { CATEGORY_BY_TYPE, type ClothingType } from '../gemini/constants';
import { CATEGORY_TO_CLIENT } from '../items/item-mappings';
import { StyleOutfitDto } from './stylist.dto';

// Messages shown in the app (503 and 422 messages are safe to display).
const AI_DOWN = 'StyleMe is having trouble right now. Please try again in a minute.';
const NOT_ENOUGH_ITEMS =
  'StyleMe couldn\'t build a full outfit for this from your closet. Add a top and bottoms (or a dress) and some shoes, then try again.';
const NO_NEW_OUTFITS = 'That\'s every outfit StyleMe can find for this. Try describing the occasion differently.';

// Order pieces are listed in, top of the flat-lay to the bottom.
const DISPLAY_ORDER: Category[] = ['Outerwear', 'Top', 'OnePiece', 'Sets', 'Bottoms', 'Shoes', 'Accessory'];

// Images sent to Gemini are shrunk to this size on the longest side.
const AI_IMAGE_SIZE = 512;

@Injectable()
export class StylistService {
  private readonly logger = new Logger(StylistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly weather: WeatherService,
    private readonly queryExpansion: QueryExpansionService,
    private readonly outfitPlanning: OutfitPlanningService,
    private readonly outfitSelection: OutfitSelectionService,
  ) {}

  async suggestOutfit(userId: string, dto: StyleOutfitDto) {
    const weatherLine = await this.describeWeather(dto);
    const request = [
      dto.occasion.trim(),
      `Date: ${dto.date}`,
      `Weather that day: ${weatherLine ?? 'unknown'}`,
    ].join('\n');

    // 1. Turn the request into garment types plus search text, and embed them.
    const expanded = await this.callAi('query expansion', () =>
      this.queryExpansion.expandAndEmbedQuery(request),
    );

    // 2. The closest closet items for each garment type.
    const candidateIds = await this.outfitPlanning.findCandidates(userId, expanded.items);
    if (candidateIds.length === 0) {
      throw new UnprocessableEntityException({ message: NOT_ENOUGH_ITEMS });
    }
    const items = await this.prisma.item.findMany({
      where: { id: { in: candidateIds }, userId },
    });
    const byId = new Map(items.map((item) => [item.id, item]));

    // 3. Gemini picks outfits, looking at each item's details and photo.
    const candidates: OutfitCandidate[] = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        details: describeItem(item),
        image: await this.loadImageForAi(item),
      })),
    );
    const excluded = new Set(dto.excludeSuggestionIds ?? []);
    const shownBefore = [...excluded]
      .map(fromSuggestionId)
      .filter((ids): ids is string[] => ids !== null && ids.every((id) => byId.has(id)));
    const outfits = await this.callAi('outfit selection', () =>
      this.outfitSelection.selectOutfits(request, candidates, shownBefore),
    );

    // 4. Keep the first complete outfit the user hasn't seen yet.
    const complete = outfits.filter((o) =>
      isComplete(o.itemIds.map((id) => categoryOf(byId.get(id)!))),
    );
    const pick = complete.find((o) => !excluded.has(toSuggestionId(o.itemIds)));
    if (!pick) {
      throw new UnprocessableEntityException({
        message: complete.length > 0 ? NO_NEW_OUTFITS : NOT_ENOUGH_ITEMS,
      });
    }

    const pieces = pick.itemIds
      .map((id) => byId.get(id)!)
      .sort((a, b) => DISPLAY_ORDER.indexOf(categoryOf(a)) - DISPLAY_ORDER.indexOf(categoryOf(b)));

    return {
      suggestionId: toSuggestionId(pick.itemIds),
      name: pick.name,
      reasons: pick.reasons,
      items: await Promise.all(
        pieces.map(async (item) => ({
          id: item.id,
          name: item.name,
          category: CATEGORY_TO_CLIENT[categoryOf(item)],
          type: item.type,
          imageUrl: await this.s3.getDownloadUrl(item.cutoutKey ?? item.imageKey),
        })),
      ),
    };
  }

  // ---- Helpers ----

  // One line describing the day's weather, or null if there's no location or
  // the forecast can't be fetched. The stylist still works without it.
  private async describeWeather(dto: StyleOutfitDto): Promise<string | null> {
    if (dto.lat == null || dto.lon == null) return null;
    try {
      const w = await this.weather.getWeather({ lat: dto.lat, lon: dto.lon, date: dto.date });
      return `${w.condition}, high ${Math.round(w.highF)}°F, low ${Math.round(w.lowF)}°F, `
        + `${w.chanceOfRain}% chance of rain, in ${w.locationName}`;
    } catch (e) {
      this.logger.warn(`No weather for the stylist: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  // Runs a Gemini step; any failure becomes a 503 with a message the app can show.
  private async callAi<T>(step: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      this.logger.error(`Stylist ${step} failed: ${e instanceof Error ? e.message : e}`);
      throw new ServiceUnavailableException({ message: AI_DOWN });
    }
  }

  // The cutout (or the original), shrunk and converted to a type Gemini accepts.
  // Returns undefined if it can't load; the item is then judged on its details.
  private async loadImageForAi(item: Item): Promise<OutfitCandidate['image']> {
    const key = item.cutoutKey ?? item.imageKey;
    try {
      const original = await this.s3.getObjectBuffer(key);
      const resized = sharp(original).resize(AI_IMAGE_SIZE, AI_IMAGE_SIZE, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      // PNG keeps the cutout's transparency; everything else (incl. WebP) becomes JPEG.
      return key.endsWith('.png')
        ? { data: await resized.png().toBuffer(), mimeType: 'image/png' }
        : { data: await resized.jpeg({ quality: 85 }).toBuffer(), mimeType: 'image/jpeg' };
    } catch (e) {
      this.logger.warn(`Couldn't load ${key} for the stylist: ${e instanceof Error ? e.message : e}`);
      return undefined;
    }
  }
}

// The item's category, falling back to the one implied by its type.
function categoryOf(item: Item): Category {
  return item.category ?? CATEGORY_BY_TYPE[item.type as ClothingType] ?? 'Accessory';
}

// Top + Bottoms, or a OnePiece (or Sets), plus Shoes.
function isComplete(categories: Category[]): boolean {
  const has = (c: Category) => categories.includes(c);
  const base = (has('Top') && has('Bottoms')) || has('OnePiece') || has('Sets');
  return base && has('Shoes');
}

// The item's details line for the selection prompt, skipping empty fields.
function describeItem(item: Item): string {
  const fields: [string, unknown][] = [
    ['name', item.name],
    ['category', categoryOf(item)],
    ['type', item.type],
    ['colors', item.colorHex.join(', ')],
    ['pattern', item.pattern],
    ['material', item.material],
    ['season', item.season],
    ['formality', item.formality],
    ['fit', item.fit],
  ];
  return [`id: ${item.id}`, ...fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)].join(' | ');
}

// Nothing is saved, so a suggestionId is just the outfit's item ids, sorted and
// encoded. The same items always give the same id, which is how
// excludeSuggestionIds and the later accept/feedback routes recognize an outfit.
function toSuggestionId(itemIds: string[]): string {
  return Buffer.from([...itemIds].sort().join(',')).toString('base64url');
}

// The item ids inside a suggestionId, or null if it isn't one of ours.
function fromSuggestionId(suggestionId: string): string[] | null {
  const ids = Buffer.from(suggestionId, 'base64url').toString('utf8').split(',');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return ids.length > 0 && ids.every((id) => uuid.test(id)) ? ids : null;
}