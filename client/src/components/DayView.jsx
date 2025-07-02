import { format, isToday } from 'date-fns';
import { getEventsForDate } from '../utils/dateUtils';

const DayView = ({ 
  currentDate, 
  events, 
  handleEventClick 
}) => {
  const dayEvents = getEventsForDate(events, currentDate);
  const isTodayDate = isToday(currentDate);

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-gray-200 bg-gray-50 h-28 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-gray-500 font-medium mb-2">
            {format(currentDate, 'EEEE').toUpperCase()}
          </div>
          <div className={`inline-flex items-center justify-center w-16 h-16 text-2xl ${
            isTodayDate
              ? 'bg-blue-600 text-white rounded-full font-medium'
              : 'text-gray-900 font-normal'
          }`}>
            {format(currentDate, 'd')}
          </div>
        </div>
      </div>
      <div className="flex-1 p-8 space-y-4 overflow-auto">
        {dayEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <p className="text-xl">No events scheduled</p>
            </div>
          </div>
        ) : (
          dayEvents.map((event, index) => (
            <div key={`${event.id}-${index}`} className="mb-4">
              <div className="flex items-start space-x-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={(e) => handleEventClick(event, e)}>
                <div className="text-lg text-gray-600 font-medium min-w-[120px]">
                  {event.start?.dateTime ? format(new Date(event.start.dateTime), 'HH:mm') : 'All day'}
                </div>
                <div className="flex-1">
                  <div className="text-xl font-medium text-gray-900 mb-1">
                    {event.summary}
                  </div>
                  {event.description && (
                    <div className="text-lg text-gray-600">
                      {event.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DayView;