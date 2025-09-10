import { useState, useRef, useEffect } from 'react'
import './styles/App.css'
import useSpeechToText from './component/SpeechToText.jsx';
import AuthPage from './component/Auth.jsx';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("")
  
  // Generate unique session ID for this conversation
  const [sessionId] = useState(() => 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
  
  // Enhanced speech-to-text with wake command
  const { 
    isListening, 
    isAwake, 
    transcript, 
    rawTranscript,
    error, 
    wakeCommand,
    toggleListening, 
    clearTranscript
  } = useSpeechToText('hey jarvis');
  
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef(null);
  const silenceTimerRef = useRef(null);

  // Check for existing authentication on component mount
  useEffect(() => {
    const checkAuth = async () => {
      const savedToken = localStorage.getItem('auth_token');
      const savedUser = localStorage.getItem('user_info');
      
      if (savedToken && savedUser) {
        try {
          // Verify token with server
          const response = await fetch('http://localhost:3001/api/verify-token', {
            headers: {
              'Authorization': `Bearer ${savedToken}`
            }
          });
          
          if (response.ok) {
            const userData = await response.json();
            setUser(userData.user);
            setToken(savedToken);
            
            // Set initial message with user's name
            setMessages([
              { text: `Hello ${userData.user.username}! I'm Jarvis. How can I assist you today?`, sender: "bot" }
            ]);
          } else {
            // Token is invalid, clear storage
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_info');
            localStorage.removeItem('jarvis_conversation');
          }
        } catch (error) {
          console.error('Auth verification error:', error);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user_info');
          localStorage.removeItem('jarvis_conversation');
        }
      }
    };
    
    checkAuth();
  }, []);

  // Load conversation from localStorage when user is authenticated
  useEffect(() => {
    if (user) {
      const savedConversation = localStorage.getItem(`jarvis_conversation_${user.id}`);
      if (savedConversation) {
        try {
          const parsedConversation = JSON.parse(savedConversation);
          if (parsedConversation && Array.isArray(parsedConversation)) {
            setMessages(parsedConversation);
          }
        } catch (error) {
          console.error('Error loading conversation from localStorage:', error);
        }
      }
    }
  }, [user]);

  // Save conversation to localStorage whenever messages change
  useEffect(() => {
    if (user && messages.length > 0) {
      localStorage.setItem(`jarvis_conversation_${user.id}`, JSON.stringify(messages));
    }
  }, [messages, user]);

  // Auto-start listening when user is authenticated
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        if (!isListening) {
          toggleListening();
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user]);

  // Auto-restart listening if it stops unexpectedly (continuous listening)
  useEffect(() => {
    if (user && !isListening && !isTyping) {
      const restartTimer = setTimeout(() => {
        toggleListening();
      }, 1000);

      return () => clearTimeout(restartTimer);
    }
  }, [isListening, isTyping, user]);

  // Handle transcript changes for manual input display
  useEffect(() => {
    console.log('Transcript changed:', transcript, 'isAwake:', isAwake);
    if (isAwake && transcript) {
      setInput(transcript);
    }
  }, [transcript, isAwake]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-send when user finishes speaking
  useEffect(() => {
    if (isAwake && transcript && transcript.trim() !== "") {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      
      silenceTimerRef.current = setTimeout(() => {
        if (transcript.trim() !== "" && !isTyping) {
          handleAutoSend();
        }
      }, 3000);
    }

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [transcript, isAwake, isTyping]);

  const sendMessageWithContext = async (messageToSend) => {
    // Add user message to state immediately
    const newUserMessage = { text: messageToSend, sender: "user" };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setIsTyping(true);
    
    try {
      console.log('=== FRONTEND DEBUG ===');
      console.log('Sending message:', messageToSend);
      console.log('Updated messages length:', updatedMessages.length);
      console.log('Updated messages:', updatedMessages);
      console.log('=====================');
      
      // Send message with conversation history and authentication
      const response = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          message: messageToSend,
          conversationHistory: updatedMessages,
          sessionId: sessionId
        })
      });
      
      if (response.status === 401 || response.status === 403) {
        // Token expired or invalid, logout user
        handleLogout();
        return;
      }
      
      const data = await response.json();
      
      // Add bot response to state
      const newBotMessage = { text: data.message, sender: "bot" };
      setMessages([...updatedMessages, newBotMessage]);
      
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = { text: "Error: Could not send message. Please try again.", sender: "bot" };
      setMessages([...updatedMessages, errorMessage]);
    }
    
    setIsTyping(false);
  };

  const handleAutoSend = async () => {
    if (!transcript || transcript.trim() === "") return;
    
    const messageToSend = transcript.trim();
    setInput("");
    clearTranscript();
    
    await sendMessageWithContext(messageToSend);
  };

  const handleManualSend = async () => {
    if (input.trim() === "") return;
    
    const messageToSend = input.trim();
    setInput("");
    
    await sendMessageWithContext(messageToSend);
  };

  const handleLoginSuccess = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    setMessages([
      { text: `Hello ${userData.username}! I'm Jarvis. How can I assist you today?`, sender: "bot" }
    ]);
  };

  const handleLogout = () => {
    // Clear all stored data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    localStorage.removeItem(`jarvis_conversation_${user?.id}`);
    
    // Reset state
    setUser(null);
    setToken(null);
    setMessages([]);
    setInput("");
    
    // Stop listening
    if (isListening) {
      toggleListening();
    }
  };

  // Clear conversation function
  const clearConversation = () => {
    const initialMessage = { text: `Hello ${user.username}! I'm Jarvis. How can I assist you today?`, sender: "bot" };
    setMessages([initialMessage]);
    localStorage.removeItem(`jarvis_conversation_${user.id}`);
  };

  // Show authentication page if user is not logged in
  if (!user) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Show main chat interface if user is authenticated
  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <span>Jarvis Chat</span>
          
        </div>
        <div className="status-indicators">
          <span className={`status-badge ${isAwake ? 'awake' : 'listening'}`}>
            {isAwake ? '🟢 Listening to you...' : '🎤 Say "hey jarvis"'}
          </span>
        </div>
      </div>
      
      <div className="chat-messages">
        {messages.map((msg, idx) => {
          let className = "message";
          if (msg.sender === "bot") {
            className += " bot-message";
          } else {
            className += " user-message";
          }
          return (
            <div className={className} key={idx}>
              {msg.text}
            </div>
          );
        })}
        {isTyping && (<div className="typing-indicator">Jarvis is thinking...</div>)}
        <div ref={bottomRef} />
      </div>
      
      <div className="chat-input">

        <button1 onClick={handleLogout} className="logout-button">Logout</button1>

        <input
          type="text"
          placeholder={isAwake ? "I'm listening... or type here" : 'Say "hey jarvis" or type here'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleManualSend() }}
        />
        <button onClick={handleManualSend}>Send</button>
      </div>
    </div>
  )
}

export default App