import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Calendar, RefreshCw } from 'lucide-react';
import googleCalendarService from '../services/googleCalendar';

const RealCalendarBot = ({ userCredential, events }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: "🗓️ Hi! I'm your Calendar AI. I can access your actual Google Calendar data. Let me sync your events first...",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Not synced');
  const [isSynced, setIsSynced] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Auto-sync when component loads
    if (userCredential && events && events.length > 0 && !isSynced) {
      handleSync();
    }
  }, [userCredential, events, isSynced]);

  const handleSync = async () => {
    if (!userCredential || !events) {
      setSyncStatus('❌ No calendar data available');
      return;
    }

    setIsSyncing(true);
    try {
      const API_BASE_URL = 'https://server-git-dev-derricks-projects-0ffc821f.vercel.app';
      console.log('🔗 API_BASE_URL:', API_BASE_URL);
      
      // Extract user info from credential
      const userInfo = {
        email: userCredential.email || 'user@example.com',
        name: userCredential.name || 'User',
        id: userCredential.id || 'unknown'
      };

      // Get access token from localStorage
      const googleAuth = JSON.parse(localStorage.getItem('googleAuth') || '{}');
      const accessToken = googleAuth.accessToken;

      console.log(`🔄 Syncing ${events.length} real calendar events...`);
      
      const response = await fetch(`${API_BASE_URL}/api/real-calendar/sync-frontend-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: events,
          userInfo: userInfo,
          accessToken: accessToken
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSyncStatus(`✅ Synced ${data.eventCount} real events`);
        setIsSynced(true);
        
        const syncMessage = {
          id: Date.now(),
          type: 'bot',
          content: `Perfect! I've synced ${data.eventCount} events from your Google Calendar. Now you can ask me questions about your actual calendar data!

Try asking:
• "When is my next meeting?"
• "What do I have scheduled this week?"
• "Find my dentist appointments"`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, syncMessage]);
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      console.error('Real calendar sync error:', error);
      setSyncStatus('❌ Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!isSynced) {
      const errorMessage = {
        id: Date.now(),
        type: 'bot',
        content: 'Please wait for calendar sync to complete before asking questions.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const API_BASE_URL = 'https://server-git-dev-derricks-projects-0ffc821f.vercel.app';
      console.log('🔗 API_BASE_URL:', API_BASE_URL);
      
      // Get access token from localStorage for chat requests too
      const googleAuth = JSON.parse(localStorage.getItem('googleAuth') || '{}');
      const accessToken = googleAuth.accessToken;
      
      const response = await fetch(`${API_BASE_URL}/api/real-calendar/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          userEmail: userCredential.email || 'user@example.com',
          accessToken: accessToken
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Handle both success and structured failure responses from backend
        const botMessage = {
          id: Date.now() + 1,
          type: 'bot',
          content: data.message || 'I received your message but had trouble processing it.',
          timestamp: new Date(),
          events: data.events || [],
          isError: !data.success && !data.message // Only show as error if no helpful message provided
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        throw new Error(data.message || 'Failed to get response');
      }
    } catch (error) {
      console.error('Real calendar chat error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: 'Sorry, I encountered an error. Make sure your calendar is synced and try again.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-green-600 text-white p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            <div>
              <h3 className="text-lg font-semibold">Calendar AI</h3>
              <p className="text-blue-100 text-sm">Connected to your Google Calendar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-green-300' : 'bg-yellow-300'}`}></div>
            <span className="text-xs">{isSynced ? 'Synced' : 'Syncing...'}</span>
          </div>
        </div>
      </div>

      {/* Sync Status */}
      <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
        <span className="text-sm text-gray-600">{syncStatus}</span>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Re-sync Calendar'}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-18rem)]">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl p-3 ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.isError
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="flex items-start gap-2">
                {message.type === 'bot' && (
                  <Bot className={`w-4 h-4 mt-1 flex-shrink-0 ${message.isError ? 'text-red-500' : 'text-gray-500'}`} />
                )}
                <div className="flex-1">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <p className={`text-xs mt-1 opacity-70 ${message.type === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {formatTime(message.timestamp)}
                  </p>
                </div>
                {message.type === 'user' && (
                  <User className="w-4 h-4 mt-1 flex-shrink-0 text-blue-100" />
                )}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl p-3 max-w-[80%]">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-gray-500" />
                <div className="flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  <span className="text-sm text-gray-600">Searching your calendar...</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isSynced ? "Ask about your real calendar events..." : "Syncing calendar data..."}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading || !isSynced}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !isSynced}
            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default RealCalendarBot;