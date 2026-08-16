import { applyReactionPick } from '@/features/chat/reactionPick';

const ME = 'me-1';
const PARTNER = 'partner-1';

describe('applyReactionPick', () => {
  it('adds the first reaction with my userId', () => {
    const r = applyReactionPick([], '❤️', ME);
    expect(r.next).toEqual([{ emoji: '❤️', count: 1, userIds: [ME] }]);
    expect(r.removeEmoji).toBeNull();
    expect(r.addEmoji).toBe('❤️');
  });

  it('replaces my own reaction instead of stacking a second one', () => {
    const prev = [{ emoji: '❤️', count: 1, userIds: [ME] }];
    const r = applyReactionPick(prev, '😂', ME);
    expect(r.next).toEqual([{ emoji: '😂', count: 1, userIds: [ME] }]);
    expect(r.removeEmoji).toBe('❤️');
    expect(r.addEmoji).toBe('😂');
  });

  it('removes my reaction when the same emoji is picked again', () => {
    const prev = [{ emoji: '❤️', count: 1, userIds: [ME] }];
    const r = applyReactionPick(prev, '❤️', ME);
    expect(r.next).toEqual([]);
    expect(r.removeEmoji).toBe('❤️');
    expect(r.addEmoji).toBeNull();
  });

  // Asıl istenen: karşı taraf başka emoji attıysa ikisi de listede kalır → yan yana chip.
  it('keeps the partner reaction next to mine when the emojis differ', () => {
    const prev = [{ emoji: '❤️', count: 1, userIds: [PARTNER] }];
    const r = applyReactionPick(prev, '😂', ME);
    expect(r.next).toEqual([
      { emoji: '❤️', count: 1, userIds: [PARTNER] },
      { emoji: '😂', count: 1, userIds: [ME] },
    ]);
  });

  it('keeps the partner reaction when I replace my own emoji', () => {
    const prev = [
      { emoji: '❤️', count: 1, userIds: [PARTNER] },
      { emoji: '🔥', count: 1, userIds: [ME] },
    ];
    const r = applyReactionPick(prev, '😂', ME);
    expect(r.next).toEqual([
      { emoji: '❤️', count: 1, userIds: [PARTNER] },
      { emoji: '😂', count: 1, userIds: [ME] },
    ]);
    expect(r.removeEmoji).toBe('🔥');
    expect(r.addEmoji).toBe('😂');
  });

  it('groups into one chip with count 2 when both users pick the same emoji', () => {
    const prev = [{ emoji: '❤️', count: 1, userIds: [PARTNER] }];
    const r = applyReactionPick(prev, '❤️', ME);
    expect(r.next).toEqual([{ emoji: '❤️', count: 2, userIds: [PARTNER, ME] }]);
    expect(r.removeEmoji).toBeNull();
    expect(r.addEmoji).toBe('❤️');
  });

  it('drops my emoji from a shared chip without removing the partner', () => {
    const prev = [{ emoji: '❤️', count: 2, userIds: [PARTNER, ME] }];
    const r = applyReactionPick(prev, '❤️', ME);
    expect(r.next).toEqual([{ emoji: '❤️', count: 1, userIds: [PARTNER] }]);
    expect(r.removeEmoji).toBe('❤️');
    expect(r.addEmoji).toBeNull();
  });

  it('never touches other users when my userId is unknown', () => {
    const prev = [{ emoji: '❤️', count: 1, userIds: [PARTNER] }];
    const r = applyReactionPick(prev, '😂', undefined);
    expect(r.next).toEqual([
      { emoji: '❤️', count: 1, userIds: [PARTNER] },
      { emoji: '😂', count: 1, userIds: [] },
    ]);
    expect(r.removeEmoji).toBeNull();
  });
});
