// Wall-clock math for the Week/Day time grid.
// Positions use the clock time shown to the user (getHours/getMinutes), never elapsed
// milliseconds since midnight: on a daylight-saving day midnight→9:00 is 8 or 10 real hours,
// but 9:00 must still be drawn on the 9 AM line. Kept free of relative imports so it can be
// tested directly with node (see the report for the TZ=America/Los_Angeles check).
import { startOfDay, addDays } from 'date-fns';

export const DAY_MINUTES = 24 * 60;

/** Minutes past midnight on the wall clock for `date` within `day` (0 before the day, 1440 after it). */
export const minutesIntoDay = (date, day) => {
  const dayStart = startOfDay(day);
  if (date <= dayStart) return 0;
  if (date >= addDays(dayStart, 1)) return DAY_MINUTES;
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
};

/** The Date shown at `minutes` past midnight on `day`'s wall clock (1440 = next midnight). */
export const dateAtMinutes = (day, minutes) => {
  const d = startOfDay(day);
  d.setHours(0, minutes, 0, 0);
  return d;
};

/** Top and bottom of a clipped segment ({ start, end, continuesBefore, continuesAfter }) in wall minutes. */
export const segmentMinutes = ({ start, end, continuesBefore, continuesAfter }, day) => {
  const startMin = continuesBefore ? 0 : minutesIntoDay(start, day);
  const endMin = continuesAfter ? DAY_MINUTES : minutesIntoDay(end, day);
  return { startMin, endMin: Math.max(endMin, startMin) };
};
