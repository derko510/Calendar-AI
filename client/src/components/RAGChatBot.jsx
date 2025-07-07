import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Database, RefreshCw } from 'lucide-react';
import authService from '../services/authService';

const RAGChatBot = ({ backendAuth }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: backendAuth 
        ? "Hi! I'm your calendar assistant with access to your calendar data. Try asking me about your events!"
        : "Hi! I need backend authentication to access your calendar data. Please wait while I connect...",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('No data synced yet');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSync = async () => {
    if (!backendAuth) {
      alert('Backend authentication required for sync');
      return;
    }

    setIsSyncing(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001';
      
      // Check if we have a valid JWT token
      if (!authService.jwtToken) {
        console.error('❌ No JWT token available');
        setSyncStatus('❌ No authentication token - please refresh the page');
        return;
      }
      
      console.log('🔍 Testing JWT token before sync...');
      const headers = authService.getAuthHeaders();
      console.log('📝 Using headers:', headers);
      
      const sessionTest = await authService.checkBackendSession();
      
      if (!sessionTest) {
        console.error('❌ JWT token test failed');
        setSyncStatus('❌ Authentication expired - please refresh the page');
        return;
      }
      
      console.log('🔄 JWT token valid, proceeding with sync...');
      const response = await fetch(`${API_BASE_URL}/api/rag-chat/sync`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
      });

      console.log('📊 Sync response:', {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (response.ok) {
        const data = await response.json();
        setSyncStatus(`✅ Synced ${data.eventCount} events`);
        
        const syncMessage = {
          id: Date.now(),
          type: 'bot',
          content: `Great! I've synced ${data.eventCount} calendar events to my database. Now you can ask me questions about your calendar!`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, syncMessage]);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Sync failed:', errorData);
        setSyncStatus(`❌ Sync failed: ${errorData.error || 'Unknown error'}`);
        throw new Error(`Sync failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus(`❌ Sync failed: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!backendAuth) {
      const errorMessage = {
        id: Date.now(),
        type: 'bot',
        content: 'Sorry, I need backend authentication to access your calendar data. Please refresh the page and try again.',
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
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001';
      const response = await fetch(`${API_BASE_URL}/api/rag-chat/message`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify({
          message: userMessage.content
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const botMessage = {
          id: Date.now() + 1,
          type: 'bot',
          content: data.message || 'I received your message but had trouble processing it.',
          timestamp: new Date(),
          events: data.events || []
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        throw new Error(data.message || 'Failed to get response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: 'Sorry, I encountered an error. Make sure your calendar data is synced and try again.',
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
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6" />
            <div>
              <h3 className="text-lg font-semibold">Calendar AI</h3>
              <p className="text-green-100 text-sm">Powered by your calendar data</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${backendAuth ? 'bg-green-300' : 'bg-red-300'}`}></div>
            <span className="text-xs">{backendAuth ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      {/* Sync Status */}
      <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
        <span className="text-sm text-gray-600">{syncStatus}</span>
        <button
          onClick={handleSync}
          disabled={isSyncing || !backendAuth}
          className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync Calendar'}
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
                  <span className="text-sm text-gray-600">Searching calendar...</span>
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
            placeholder={backendAuth ? "Ask about your calendar events..." : "Waiting for authentication..."}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading || !backendAuth}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !backendAuth}
            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default RAGChatBot;