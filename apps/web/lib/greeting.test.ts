import { describe, expect, it } from 'vitest';
import { firstNameOf, formatToday, getDayPart, getGreeting } from './greeting';

describe('getDayPart', () => {
  it('maps hours to morning, afternoon, and evening', () => {
    expect(getDayPart(0)).toBe('morning');
    expect(getDayPart(11)).toBe('morning');
    expect(getDayPart(12)).toBe('afternoon');
    expect(getDayPart(17)).toBe('afternoon');
    expect(getDayPart(18)).toBe('evening');
    expect(getDayPart(23)).toBe('evening');
  });
});

describe('getGreeting', () => {
  it('adapts to the time of day', () => {
    expect(getGreeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(getGreeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
    expect(getGreeting(new Date(2026, 0, 1, 21))).toBe('Good evening');
  });
});

describe('formatToday', () => {
  it('uses the real runtime date, never a static fixture', () => {
    expect(formatToday(new Date(2026, 8, 8, 10))).toContain('September');
    expect(formatToday()).toMatch(/^[A-Za-z]+, [A-Za-z]+ \d{1,2}$/);
  });
});

describe('firstNameOf', () => {
  it('takes the first token of a display name', () => {
    expect(firstNameOf('Ada Lovelace')).toBe('Ada');
    expect(firstNameOf('Ada')).toBe('Ada');
    expect(firstNameOf('  ')).toBe('');
  });
});
