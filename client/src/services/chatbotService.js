const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ChatbotService {
  async sendMessage(message) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chatbot/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      return await response.json();
    } catch (error) {
      console.error('Chatbot service error:', error);
      throw error;
    }
  }

  async syncCalendar() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/calendar/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync calendar');
      }

      return await response.json();
    } catch (error) {
      console.error('Calendar sync error:', error);
      throw error;
    }
  }

  async getCalendarEvents(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.startDate) params.append('startDate', options.startDate);
      if (options.endDate) params.append('endDate', options.endDate);
      if (options.searchTerm) params.append('searchTerm', options.searchTerm);
      if (options.limit) params.append('limit', options.limit);

      const response = await fetch(`${API_BASE_URL}/api/calendar/events?${params}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch events');
      }

      return await response.json();
    } catch (error) {
      console.error('Get events error:', error);
      throw error;
    }
  }
}

export default new ChatbotService();