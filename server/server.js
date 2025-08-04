require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // npm install node-fetch

const app = express();
app.use(cors());
app.use(express.json());

console.log('OLLAMA_API_KEY:', process.env.OLLAMA_API_KEY); // Should show your actual key (not undefined)

app.post('/api/chat', async (req, res) => {
  
  const {message} = req.body;
  
  try {
    const botResponse = await fetch("https://ollama.vsp.dev/api/chat", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}` // ✅ Use backticks here
      },
      body: JSON.stringify({
        model: 'llama3.1',
        messages: [
          { role: 'user', content: message }
        ], 
        stream: false// Set to false to get the full response at once
      })
    });

    

    const data = await botResponse.json();
    console.log("Response from Ollama:", data); // Optional: for debugging

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
