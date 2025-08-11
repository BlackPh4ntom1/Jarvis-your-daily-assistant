import { useState } from 'react'
import {useRef} from 'react'
import {useEffect} from 'react'
import './styles/App.css'
import useSpeechToText from './component/SpeechToText.jsx';

function App() {
  const [messages, setMessages] = useState([
    { text: "Hello! I'm Jarvis. How can I assist you today?", sender: "bot" }
  ])
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

  // Load conversation from localStorage on component mount
  useEffect(() => {
    const savedConversation = localStorage.getItem('jarvis_conversation');
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
  }, []);

  // Save conversation to localStorage whenever messages change
  useEffect(() => {
    localStorage.setItem('jarvis_conversation', JSON.stringify(messages));
  }, [messages]);

  // Auto-start listening when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isListening) {
        toggleListening();
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Auto-restart listening if it stops unexpectedly (continuous listening)
  useEffect(() => {
    if (!isListening && !isTyping) {
      const restartTimer = setTimeout(() => {
        toggleListening();
      }, 1000);

      return () => clearTimeout(restartTimer);
    }
  }, [isListening, isTyping]);

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
      
      // Send message with conversation history (including the new user message)
      const response = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"                   
        },
        body: JSON.stringify({ 
          message: messageToSend,
          conversationHistory: updatedMessages, // Send updated conversation history
          sessionId: sessionId
        })
      });
      
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

  // Clear conversation function (optional - you can add a button for this)
  const clearConversation = () => {
    const initialMessage = { text: "Hello! I'm Jarvis. How can I assist you today?", sender: "bot" }; //I will remove this later
    setMessages([initialMessage]);
    localStorage.removeItem('jarvis_conversation');
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <span>Jarvis Chat</span>
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