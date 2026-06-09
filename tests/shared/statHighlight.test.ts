import { describe, it, expect } from 'vitest';
import { resolveStatTone } from '../../src/shared/statHighlight';

describe('resolveStatTone', () => {
  it('value above baseline → positive', () => {
    expect(resolveStatTone(15, 10)).toBe('positive');
  });

  it('value below baseline → negative', () => {
    expect(resolveStatTone(5, 10)).toBe('negative');
  });

  it('value equal to baseline → neutral', () => {
    expect(resolveStatTone(10, 10)).toBe('neutral');
  });

  it('net mixed sources resolve by final value', () => {
    // equipment +10 then debuff -15 against a baseline of 100 → displayed 95 < 100 → negative
    expect(resolveStatTone(95, 100)).toBe('negative');
    // equipment +10 and debuff -10 → displayed 100 === 100 → neutral
    expect(resolveStatTone(100, 100)).toBe('neutral');
    // equipment +10 and buff +5 → displayed 115 > 100 → positive
    expect(resolveStatTone(115, 100)).toBe('positive');
  });
});
