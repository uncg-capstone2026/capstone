import {
  comboKey,
  isCompleteOutfit,
  pickToSend,
  validateOutfits,
  type CandidateLists,
} from './candidates';

const list = (...ids: string[]) => ids.map((itemId, i) => ({ itemId, score: i / 10 }));

const piece = (id: string, category: string | null) => ({ id, category });
const top = piece('top1', 'Top');
const top2 = piece('top2', 'Top');
const jeans = piece('jeans1', 'Bottoms');
const jeans2 = piece('jeans2', 'Bottoms');
const dress = piece('dress1', 'OnePiece');
const shoes = piece('shoes1', 'Shoes');
const shoes2 = piece('shoes2', 'Shoes');

describe('comboKey', () => {
  it('ignores order', () => {
    expect(comboKey(['b', 'a', 'c'])).toBe(comboKey(['c', 'b', 'a']));
  });

  it('matches the old suggestionId encoding', () => {
    expect(comboKey(['b', 'a'])).toBe(Buffer.from('a,b').toString('base64url'));
  });
});

describe('isCompleteOutfit', () => {
  it('accepts a top and bottoms, or a one-piece', () => {
    expect(isCompleteOutfit([top, jeans])).toBe(true);
    expect(isCompleteOutfit([dress, shoes])).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCompleteOutfit([top, shoes])).toBe(false);
    expect(isCompleteOutfit([])).toBe(false);
  });
});

describe('pickToSend', () => {
  const lists: CandidateLists = {
    't-shirt': list('t1', 't2', 't3', 't4', 't5', 't6'),
    jeans: list('j1', 'j2'),
  };

  it('takes the closest perType of each type at first', () => {
    expect(pickToSend(lists, { perType: 4 })).toEqual(['t1', 't2', 't3', 't4', 'j1', 'j2']);
  });

  it('skips banned items', () => {
    expect(pickToSend(lists, { perType: 2, banned: new Set(['t1', 'j2']) })).toEqual(['t2', 't3', 'j1']);
  });

  it('keeps the best sent items and fills with new ones', () => {
    const alreadySent = new Set(['t1', 't2', 't3', 't4']);
    expect(pickToSend({ 't-shirt': lists['t-shirt'] }, { perType: 4, alreadySent })).toEqual(['t1', 't2', 't5', 't6']);
  });

  it('tops up with other sent items when new ones run out', () => {
    const alreadySent = new Set(['t1', 't2', 't3', 't4', 't5']);
    expect(pickToSend({ 't-shirt': lists['t-shirt'] }, { perType: 4, alreadySent })).toEqual(['t1', 't2', 't6', 't3']);
  });
});

describe('validateOutfits', () => {
  const candidates = [top, top2, jeans, jeans2, dress, shoes, shoes2];

  it('maps ids to items and keeps complete outfits', () => {
    const [outfit] = validateOutfits(
      [{ outfit: ['top1', 'jeans1', 'shoes1'], name: ' Easy day ', reasons: [' One. ', '', 'Two.'] }],
      { candidates },
    );
    expect(outfit.items.map((i) => i.id)).toEqual(['top1', 'jeans1', 'shoes1']);
    expect(outfit.name).toBe('Easy day');
    expect(outfit.reasons).toEqual(['One.', 'Two.']);
  });

  it('drops unknown and duplicate ids, then incomplete outfits', () => {
    const result = validateOutfits(
      [
        { outfit: ['top1', 'top1', 'nope', 'jeans1'], name: 'a', reasons: ['r'] },
        { outfit: ['top1', 'shoes1'], name: 'b', reasons: ['r'] },
      ],
      { candidates },
    );
    expect(result.map((o) => o.items.map((i) => i.id))).toEqual([['top1', 'jeans1']]);
  });

  it('drops outfits shown before, repeated in the batch, or with banned items', () => {
    const result = validateOutfits(
      [
        { outfit: ['jeans1', 'top1'], name: 'shown', reasons: ['r'] },
        { outfit: ['top2', 'jeans2'], name: 'new', reasons: ['r'] },
        { outfit: ['jeans2', 'top2'], name: 'repeat', reasons: ['r'] },
        { outfit: ['dress1', 'shoes2'], name: 'banned', reasons: ['r'] },
      ],
      {
        candidates,
        shownKeys: new Set([comboKey(['top1', 'jeans1'])]),
        banned: new Set(['shoes2']),
      },
    );
    expect(result.map((o) => o.name)).toEqual(['new']);
  });

  it('adds fixed pieces to every outfit and allows only fixed pieces', () => {
    const result = validateOutfits(
      [
        { outfit: ['shoes2', 'top1'], name: 'swap', reasons: ['r'] },
        { outfit: [], name: 'as is', reasons: ['r'] },
      ],
      { candidates: [shoes, shoes2], fixed: [top, jeans] },
    );
    expect(result.map((o) => o.items.map((i) => i.id))).toEqual([
      ['top1', 'jeans1', 'shoes2'],
      ['top1', 'jeans1'],
    ]);
  });
});
