import { describe, expect, it } from 'vitest';
import { currentWeekKey, dateKeyBoundsIso, dateKeyInTimeZone, mondayDateKeyFor } from '../../src/lib/appTime.js';

describe('app time helpers', () => {
  it('uses the app timezone date instead of raw UTC around Spanish midnight', () => {
    const instant = new Date('2026-06-11T22:21:00.000Z'); // 00:21 del 12 de junio en Madrid.
    expect(dateKeyInTimeZone(instant, 'Europe/Madrid')).toBe('2026-06-12');
    expect(dateKeyInTimeZone(instant, 'UTC')).toBe('2026-06-11');
  });

  it('computes local day bounds in UTC instants', () => {
    expect(dateKeyBoundsIso('2026-06-12', 'Europe/Madrid')).toEqual({
      startIso: '2026-06-11T22:00:00.000Z',
      endIso: '2026-06-12T22:00:00.000Z',
    });
  });

  it('uses the local calendar week key', () => {
    const instant = new Date('2026-06-14T22:30:00.000Z'); // lunes 15 en Madrid, domingo UTC.
    expect(currentWeekKey(instant, 'Europe/Madrid')).toBe('2026-06-15');
    expect(currentWeekKey(instant, 'UTC')).toBe('2026-06-08');
    expect(mondayDateKeyFor('2026-06-12')).toBe('2026-06-08');
  });
});
