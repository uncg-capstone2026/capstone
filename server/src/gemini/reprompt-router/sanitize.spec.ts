import { sanitizeRouteDecision } from './sanitize';

const current = ['t-shirt', 'jeans', 'sneakers'];

describe('sanitizeRouteDecision', () => {
  it('passes a reroll through', () => {
    expect(sanitizeRouteDecision({ route: 'reroll' }, current)).toEqual({ route: 'reroll' });
  });

  it('keeps only swap types that are in the current outfit', () => {
    expect(sanitizeRouteDecision({ route: 'swap', swap_types: ['sneakers', 'boots', 'sneakers'] }, current))
      .toEqual({ route: 'swap', swapTypes: ['sneakers'] });
  });

  it('turns a swap with no matching pieces into a refine, or a restart', () => {
    const edits = { add: [], remove: [], change: [{ type: 'boots', semantic_query: 'black ankle boots' }], keep_rest: true };
    expect(sanitizeRouteDecision({ route: 'swap', swap_types: ['boots'], edits }, current).route).toBe('refine');
    expect(sanitizeRouteDecision({ route: 'swap', swap_types: ['boots'], edits: null }, current))
      .toEqual({ route: 'restart' });
  });

  it('cleans refine edits', () => {
    const decision = sanitizeRouteDecision({
      route: 'refine',
      swap_types: [],
      edits: {
        add: [
          { type: 'jacket', semantic_query: '  light denim jacket ' },
          { type: 'cape', semantic_query: 'red cape' },
          { type: 'coat', semantic_query: '   ' },
        ],
        remove: ['hat', 'jacket', 'nope'],
        change: [],
        keep_rest: true,
      },
    }, current);
    expect(decision).toEqual({
      route: 'refine',
      edits: {
        add: [{ type: 'jacket', semantic_query: 'light denim jacket' }],
        remove: ['hat'],
        change: [],
        keepRest: true,
      },
    });
  });

  it('defaults keep_rest to true and restarts on empty edits', () => {
    const decision = sanitizeRouteDecision(
      { route: 'refine', edits: { remove: ['hat'] } },
      current,
    );
    expect(decision).toEqual({ route: 'refine', edits: { add: [], remove: ['hat'], change: [], keepRest: true } });
    expect(sanitizeRouteDecision({ route: 'refine', edits: { add: [], remove: [], change: [] } }, current))
      .toEqual({ route: 'restart' });
  });

  it('restarts on anything unknown', () => {
    expect(sanitizeRouteDecision({ route: 'dance' }, current)).toEqual({ route: 'restart' });
    expect(sanitizeRouteDecision({}, current)).toEqual({ route: 'restart' });
  });
});
