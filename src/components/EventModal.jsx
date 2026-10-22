import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, Calendar, MapPin, Users, Type } from 'lucide-react';
import Modal from 'react-modal';

const EventModal = ({ isOpen, onClose, onSave, event = null, isLoading = false }) => {
  const [isAllDay, setIsAllDay] = useState(false);
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue
  } = useForm({
    defaultValues: {
      summary: '',
      description: '',
      location: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      attendees: ''
    }
  });

  useEffect(() => {
    if (event) {
      // Populate form with existing event data
      setValue('summary', event.summary || '');
      setValue('description', event.description || '');
      setValue('location', event.location || '');
      
      if (event.start) {
        const startDate = new Date(event.start.dateTime || event.start.date);
        setValue('startDate', startDate.toISOString().split('T')[0]);
        
        if (event.start.dateTime) {
          setValue('startTime', startDate.toTimeString().slice(0, 5));
        } else {
          setIsAllDay(true);
        }
      }
      
      if (event.end) {
        const endDate = new Date(event.end.dateTime || event.end.date);
        setValue('endDate', endDate.toISOString().split('T')[0]);
        
        if (event.end.dateTime) {
          setValue('endTime', endDate.toTimeString().slice(0, 5));
        }
      }
      
      if (event.attendees) {
        const emails = event.attendees.map(a => a.email).join(', ');
        setValue('attendees', emails);
      }
    } else {
      // Reset form for new event
      reset();
      setIsAllDay(false);
      
      // Set default date to today
      const today = new Date();
      setValue('startDate', today.toISOString().split('T')[0]);
      setValue('endDate', today.toISOString().split('T')[0]);
    }
  }, [event, setValue, reset]);

  const onSubmit = (data) => {
    const eventData = {
      summary: data.summary,
      description: data.description,
      location: data.location,
    };

    if (isAllDay) {
      eventData.start = { date: data.startDate };
      eventData.end = { date: data.endDate };
    } else {
      eventData.start = { 
        dateTime: `${data.startDate}T${data.startTime}:00`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      eventData.end = { 
        dateTime: `${data.endDate}T${data.endTime}:00`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    }

    if (data.attendees.trim()) {
      eventData.attendees = data.attendees
        .split(',')
        .map(email => ({ email: email.trim() }))
        .filter(attendee => attendee.email);
    }

    onSave(eventData);
  };

  const handleClose = () => {
    reset();
    setIsAllDay(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      className="max-w-2xl mx-auto mt-20 bg-white rounded-lg shadow-xl outline-none"
      overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50"
      ariaHideApp={false}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {event ? 'Edit Event' : 'Create New Event'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Title */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              <Type size={16} className="mr-2" />
              Event Title *
            </label>
            <input
              {...register('summary', { required: 'Event title is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter event title"
            />
            {errors.summary && (
              <p className="text-red-500 text-sm mt-1">{errors.summary.message}</p>
            )}
          </div>

          {/* Date and Time */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              <Calendar size={16} className="mr-2" />
              Date & Time
            </label>
            
            <div className="mb-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="mr-2"
                />
                All day event
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Start Date</label>
                <input
                  {...register('startDate', { required: 'Start date is required' })}
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              {!isAllDay && (
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Start Time</label>
                  <input
                    {...register('startTime', { required: !isAllDay && 'Start time is required' })}
                    type="time"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">End Date</label>
                <input
                  {...register('endDate', { required: 'End date is required' })}
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              {!isAllDay && (
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">End Time</label>
                  <input
                    {...register('endTime', { required: !isAllDay && 'End time is required' })}
                    type="time"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              <MapPin size={16} className="mr-2" />
              Location
            </label>
            <input
              {...register('location')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add location"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Description
            </label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add event description"
            />
          </div>

          {/* Attendees */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              <Users size={16} className="mr-2" />
              Attendees
            </label>
            <input
              {...register('attendees')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter email addresses separated by commas"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default EventModal;