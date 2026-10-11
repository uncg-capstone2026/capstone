import { formatHistory, historyWindow, replyTo, type HistoryTurn } from './turn-history';

const turn = (turnNumber: number, userMessage = '', route = 'reroll'): HistoryTurn => ({
  turnNumber,
  route: turnNumber === 1 ? 'initial' : route,
  userMessage,
  chosenItemIds: [`a${turnNumber}`, `b${turnNumber}`],
  name: `Outfit ${turnNumber}`,
});

describe('historyWindow', () => {
  it('keeps everything in full up to the limit', () => {
    const turns = [1, 2, 3].map((n) => turn(n));
    expect(historyWindow(turns, 0, 5)).toEqual({ recent: turns, toSummarize: [], summarizedThrough: 0 });
  });

  it('summarizes older turns not summarized yet', () => {
    const turns = [1, 2, 3, 4, 5, 6, 7].map((n) => turn(n));
    const window = historyWindow(turns, 1, 5);
    expect(window.recent.map((t) => t.turnNumber)).toEqual([3, 4, 5, 6, 7]);
    expect(window.toSummarize.map((t) => t.turnNumber)).toEqual([2]);
    expect(window.summarizedThrough).toBe(2);
  });

  it('works with gaps from failed turns', () => {
    const turns = [1, 2, 4, 5, 6, 7, 8].map((n) => turn(n));
    const window = historyWindow(turns, 0, 5);
    expect(window.toSummarize.map((t) => t.turnNumber)).toEqual([1, 2]);
    expect(window.summarizedThrough).toBe(2);
  });
});

describe('replyTo', () => {
  it("is the next turn's message, or null for the last turn", () => {
    const turns = [turn(1, 'class'), turn(2, 'different shoes', 'swap'), turn(3)];
    expect(replyTo(turns, turns[0])).toBe('different shoes');
    expect(replyTo(turns, turns[1])).toBe('');
    expect(replyTo(turns, turns[2])).toBeNull();
  });
});

describe('formatHistory', () => {
  it('lists turns with what the user said, then the new message', () => {
    const text = formatHistory({
      summary: 'They dislike bright colors.',
      recent: [turn(1, 'class'), turn(2, 'different shoes', 'swap')],
      itemNames: new Map([['a1', 'Grey tee'], ['b1', 'Navy chinos'], ['a2', 'Grey tee']]),
      message: 'more formal',
    });
    expect(text).toBe([
      'The conversation so far:',
      'Earlier in this conversation: They dislike bright colors.',
      'Turn 1: you suggested "Outfit 1": Grey tee, Navy chinos.',
      'The user said: "different shoes".',
      'Turn 2: you suggested "Outfit 2": Grey tee.',
      'Now the user says: "more formal". Suggest something new that follows this.',
    ].join('\n'));
  });

  it('describes a plain reroll', () => {
    const text = formatHistory({ summary: null, recent: [turn(1, 'class')], itemNames: new Map(), message: '' });
    expect(text).toContain('Turn 1: you suggested "Outfit 1": (items since removed).');
    expect(text.endsWith('Now the user asks for another option. Suggest something new.')).toBe(true);
  });
});
