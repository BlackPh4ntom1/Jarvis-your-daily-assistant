require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message, conversationHistory, sessionId } = req.body;
  
  console.log('=== DEBUG INFO ===');
  console.log('Current message:', message);
  console.log('Conversation history received:', conversationHistory ? 'YES' : 'NO');
  console.log('Conversation history length:', conversationHistory?.length || 0);
  
  if (conversationHistory && conversationHistory.length > 0) {
    console.log('Last few messages:');
    conversationHistory.slice(-3).forEach((msg, i) => {
      console.log(`  ${i}: [${msg.sender}] ${msg.text?.substring(0, 50)}...`);
    });
  }
  console.log('==================');
  
  try {
    // Build messages array for Ollama
    let messages = [];
    
    // Add system message
    messages.push({
      role: 'system',
      content: 'You are Jarvis, an intelligent AI assistant. Be helpful, conversational, and remember the context of our conversation. You can reference previous parts of our conversation.'
    });
    
    // Add conversation history - but EXCLUDE the last message since it's the current user message
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 1) {
      // Get all messages except the last one (which is the current user message)
      const pastMessages = conversationHistory.slice(0, -1);
      
      // Limit to last 15 messages to avoid token limits
      const recentPastMessages = pastMessages.slice(-15);
      
      console.log(`Adding ${recentPastMessages.length} past messages to context`);
      
      recentPastMessages.forEach((msg) => {
        if (msg && msg.text && msg.sender) {
          messages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
          });
        }
      });
    }
    
    // Add the current message
    messages.push({
      role: 'user',
      content: message
    });

    console.log(`Sending ${messages.length} total messages to Ollama (1 system + ${messages.length - 2} history + 1 current)`);

    const botResponse = await fetch("https://ollama.vsp.dev/api/chat", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3.1',
        messages: messages,
        stream: false
      })
    });

    const data = await botResponse.json();
    console.log("Response from Ollama received, length:", data?.message?.content?.length || 0);

    res.json({
      message: data?.message?.content || data?.response || "No response from bot"
    });

  } catch (error) {
    console.error("Error processing message:", error);
    res.status(500).json({ message: "Error: Could not process message." });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});