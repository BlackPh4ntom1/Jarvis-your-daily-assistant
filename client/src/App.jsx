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
  const { isListening, transcript, error, toggleListening, clearTranscript } = useSpeechToText(); // for speech to text hook
  const [isTyping, setIsTyping] = useState(false)  // for typing indicator
  const bottomRef = useRef(null); // for auto scroll to bottom hook
  

  useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); // for auto scroll to bottom hook
}, [messages]);

  useEffect(() => {
    setInput(transcript); //for speech to text hook
  }, [transcript]);
  
  

  const handleSend = async() => {
    if (input.trim() === "") return
    setMessages(messages => [...messages, { text: input, sender: "user" }])
    setIsTyping(true)
    setInput("")
    try{
      const response = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
          
        },
        body: JSON.stringify({ message: input })
      });
      const data = await response.json();
      setMessages(messages => [...messages, { text: data.message, sender: "bot" }]);

    }catch (error) {
      console.error("Error sending message:", error);
      setMessages(messages => [...messages, { text: "Error: Could not send message.", sender: "bot" }]);
    }
    setIsTyping(false)
  }

  return (
    <div className="chat-container">
      <div className="chat-header">Jarvis Chat</div>
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
        {isTyping && (<div className="typing-indicator">Bot is typing...</div>)}

        <div ref={bottomRef} />


      </div>
      <div className="chat-input">
        <input
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSend() }}
        />
        <button onClick={handleSend}>Send</button>
        <button2 onClick={toggleListening} disabled={isTyping}>{isListening ? 'Stop Mic' : 'Start Mic'}</button2>

      </div>
    </div>
  )
}

export default App
