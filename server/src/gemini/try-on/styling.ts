import { FORMALITY_LEVELS, type FormalityLevel } from '../constants';
import type { TryOnItem } from './service';

// How the outfit is worn (tucked, open, sleeves, hems), decided in code
// before any Gemini call so every frame of the turnaround agrees. Items with
// no type get no rules, and Gemini decides for them.

// Business-casual and above counts as a formal outfit.
const FORMAL_FROM = FORMALITY_LEVELS.indexOf('business-casual');

// Never tucked in, however formal the outfit.
const NEVER_TUCKED = new Set(['hoodie', 'sweater', 'cardigan']);
// Tucked in only when the outfit is formal.
const TUCKED_WHEN_FORMAL = new Set(['t-shirt', 'tank-top', 'long-sleeve-shirt', 'button-up-shirt', 'blouse']);
const OUTERWEAR = new Set(['blazer', 'jacket', 'coat']);
const FULL_LENGTH_BOTTOMS = new Set(['jeans', 'dress-pants', 'sweat-pants']);

// One line per rule, e.g. "Wear the White crew-neck tee untucked, hanging naturally."
export function stylingNotes(items: TryOnItem[]): string[]
{
  const formal = items.some((item) => FORMALITY_LEVELS.indexOf(item.formality as FormalityLevel) >= FORMAL_FROM);
  const hasBottoms = items.some((item) => item.category === 'Bottoms');
  const notes: string[] = [];

  for (const item of items) {
    const type = item.type ?? '';
    if (hasBottoms && NEVER_TUCKED.has(type)) {
      notes.push(`Wear the ${item.name} untucked, hanging naturally over the bottoms.`);
    } else if (hasBottoms && TUCKED_WHEN_FORMAL.has(type)) {
      notes.push(formal
        ? `Wear the ${item.name} neatly tucked into the bottoms, all the way around.`
        : `Wear the ${item.name} untucked, hanging naturally over the bottoms.`);
    } else if (OUTERWEAR.has(type)) {
      notes.push(`Wear the ${item.name} open: unbuttoned and unzipped, over the top.`);
    } else if (FULL_LENGTH_BOTTOMS.has(type)) {
      notes.push(`Wear the ${item.name} at their natural length, with the hems not cuffed or rolled.`);
    }
  }

  if (items.some((item) => item.category === 'Top' || item.category === 'Outerwear' || item.category === 'OnePiece')) {
    notes.push('Any long sleeves stay down at full length, not rolled or pushed up.');
  }
  return notes;
}
