import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Database, TestTube } from 'lucide-react';

const TestRAGBot = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: "🧪 Hi! I'm your Test RAG Calendar Assistant. I have demo calendar data loaded. Try asking:\n\n• When was my last dentist appointment?\n• What meetings do I have this week?\n• Tell me about my doctor visits",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

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
      const response = await fetch(`${API_BASE_URL}/api/test-rag/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          userId: 1 // Demo user
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
      console.error('Test RAG error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: 'Sorry, I encountered an error. Make sure the backend server is running.',
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

  const testQueries = [
    "When was my last dentist appointment?",
    "What meetings do I have this week?", 
    "Tell me about my doctor visits",
    "What events do I have in January?"
  ];

  const handleTestQuery = (query) => {
    setInput(query);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TestTube className="w-6 h-6" />
            <div>
              <h3 className="text-lg font-semibold">Test RAG Assistant</h3>
              <p className="text-purple-100 text-sm">Demo calendar data loaded</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-300"></div>
            <span className="text-xs">Demo Mode</span>
          </div>
        </div>
      </div>

      {/* Quick test buttons */}
      <div className="px-4 py-2 bg-gray-50 border-b">
        <p className="text-xs text-gray-600 mb-2">Quick tests:</p>
        <div className="flex flex-wrap gap-1">
          {testQueries.map((query, index) => (
            <button
              key={index}
              onClick={() => handleTestQuery(query)}
              className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200 transition-colors"
            >
              {query}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-20rem)]">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3 ${
                message.type === 'user'
                  ? 'bg-purple-600 text-white'
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
                  <p className={`text-xs mt-1 opacity-70 ${message.type === 'user' ? 'text-purple-100' : 'text-gray-500'}`}>
                    {formatTime(message.timestamp)}
                  </p>
                </div>
                {message.type === 'user' && (
                  <User className="w-4 h-4 mt-1 flex-shrink-0 text-purple-100" />
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
            placeholder="Ask about your calendar events..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-purple-600 text-white p-2 rounded-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default TestRAGBot;