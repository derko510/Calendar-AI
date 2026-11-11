import { memo, useMemo } from 'react';
import { startOfWeek, addDays } from 'date-fns';
import TimeGrid from './TimeGrid';

// Seven-day time grid (Sunday start, like Google's default)
const WeekView = memo(function WeekView({ currentDate, ...props }) {
  const weekStartMs = startOfWeek(currentDate, { weekStartsOn: 0 }).getTime();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStartMs), i)), [weekStartMs]);
  return <TimeGrid days={days} {...props} />;
});

export default WeekView;
