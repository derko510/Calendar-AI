import { useMemo } from 'react';
import { startOfDay } from 'date-fns';
import TimeGrid from './TimeGrid';

// Single-day time grid; the day header is not a link (we're already on it)
const DayView = ({ currentDate, onDayClick: _onDayClick, ...props }) => {
  const dayMs = startOfDay(currentDate).getTime();
  const days = useMemo(() => [new Date(dayMs)], [dayMs]);
  return <TimeGrid days={days} {...props} />;
};

export default DayView;
