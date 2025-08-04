import { useState } from 'react'
import {useRef} from 'react'
import {useEffect} from 'react'
import './styles/App.css'
import useSpeechToText from './component/SpeechToText.jsx';

function App() {
  const [messages, setMessages] = useState([
    { text: "Hello! How can I assist you today?", sender: "bot" }
  ])
  const [input, setInput] = useState("")
  
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
  } = useSpeechToText('hey jarvis'); // Custom wake command for your Jarvis chat
  
  const [isTyping, setIsTyping] = useState(false)  // for typing indicator
  const bottomRef = useRef(null); // for auto scroll to bottom hook
  const silenceTimerRef = useRef(null); // Timer for detecting end of speech

  // Auto-start listening when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isListening) {
        toggleListening();
      }
    }, 50000); // Start listening immediately

    return () => clearTimeout(timer);
  }, []);

  // Auto-restart listening if it stops unexpectedly (continuous listening)
  useEffect(() => {
    if (!isListening && !isTyping) {
      const restartTimer = setTimeout(() => {
        toggleListening();
      }, 0); // Restart quickly if stopped

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
      // Clear any existing timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      
      // Set a new timer - send message after 3 seconds of silence
      silenceTimerRef.current = setTimeout(() => {
        if (transcript.trim() !== "" && !isTyping) {
          handleAutoSend();
        }
      }, 3000); // 3 seconds of silence before auto-send
    }

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [transcript, isAwake, isTyping]);

  const handleAutoSend = async () => {
    if (!transcript || transcript.trim() === "") return;
    
    const messageToSend = transcript.trim();
    setMessages(messages => [...messages, { text: messageToSend, sender: "user" }]);
    setIsTyping(true);
    setInput("");
    clearTranscript();
    
    try {
      const response = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"                   
        },
        body: JSON.stringify({ message: messageToSend })
      });
      const data = await response.json();
      setMessages(messages => [...messages, { text: data.message, sender: "bot" }]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(messages => [...messages, { text: "Error: Could not send message.", sender: "bot" }]);
    }
    setIsTyping(false);
  };

  const handleManualSend = async () => {
    if (input.trim() === "") return;
    
    const messageToSend = input.trim();
    setMessages(messages => [...messages, { text: messageToSend, sender: "user" }]);
    setIsTyping(true);
    setInput("");
    
    try {
      const response = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"                   
        },
        body: JSON.stringify({ message: messageToSend })
      });
      const data = await response.json();
      setMessages(messages => [...messages, { text: data.message, sender: "bot" }]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(messages => [...messages, { text: "Error: Could not send message.", sender: "bot" }]);
    }
    setIsTyping(false);
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