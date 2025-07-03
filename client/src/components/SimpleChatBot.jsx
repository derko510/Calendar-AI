import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';

const SimpleChatBot = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: "Hi! I'm your calendar assistant. I'm currently running in simple mode. Try asking me something!",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001';
      console.log('🔄 Checking connection to:', `${API_BASE_URL}/api/chat/health`);
      console.log('🌐 Current window.location.origin:', window.location.origin);
      
      const response = await fetch(`${API_BASE_URL}/api/chat/health`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('📡 Response status:', response.status, response.ok);
      
      if (response.ok) {
        const text = await response.text();
        console.log('📄 Raw response:', text);
        try {
          const data = JSON.parse(text);
          console.log('📊 Health data:', data);
          setConnectionStatus(data.ollama ? 'connected' : 'ollama-down');
        } catch (parseError) {
          console.error('❌ JSON parse error:', parseError);
          console.error('Response was:', text);
          setConnectionStatus('server-down');
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Server responded with error:', response.status, errorText);
        setConnectionStatus('server-down');
      }
    } catch (error) {
      console.error('❌ Connection check failed:', error);
      console.error('Error details:', error.message);
      setConnectionStatus('server-down');
    }
  };

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
      console.log('💬 Sending message to:', `${API_BASE_URL}/api/chat/message`);
      
      const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
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
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMessage]);
        setConnectionStatus('connected');
      } else {
        throw new Error(data.message || 'Failed to get response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: 'Sorry, I encountered an error. Please make sure the backend server is running and Ollama is available.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
      setConnectionStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'checking': return 'bg-yellow-500';
      case 'ollama-down': return 'bg-orange-500';
      case 'server-down': return 'bg-red-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'checking': return 'Checking...';
      case 'ollama-down': return 'Ollama offline';
      case 'server-down': return 'Server offline';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6" />
            <div>
              <h3 className="text-lg font-semibold">Calendar Assistant</h3>
              <p className="text-blue-100 text-sm">Simple Mode (No Auth Required)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
            <span className="text-xs">{getStatusText()}</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-16rem)]">
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
                  <span className="text-sm text-gray-600">Thinking...</span>
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
            placeholder="Ask me anything..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading || connectionStatus === 'server-down'}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || connectionStatus === 'server-down'}
            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {connectionStatus === 'ollama-down' && (
          <p className="text-xs text-orange-600 mt-1">
            Ollama is offline. Run 'ollama serve' to enable AI responses.
          </p>
        )}
        {connectionStatus === 'server-down' && (
          <p className="text-xs text-red-600 mt-1">
            Backend server is offline. Please start the server.
          </p>
        )}
      </form>
    </div>
  );
};

export default SimpleChatBot;