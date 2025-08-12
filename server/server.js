require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Database setup
const DB_PATH = path.join(__dirname, 'jarvis.db');
const db = new sqlite3.Database(DB_PATH);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';

// Initialize database tables
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating users table:', err);
          return reject(err);
        }
      });

      // Conversations table
      db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        session_id TEXT,
        message TEXT NOT NULL,
        response TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`, (err) => {
        if (err) {
          console.error('Error creating conversations table:', err);
          return reject(err);
        }
        console.log('Database initialized successfully');
        resolve();
      });
    });
  });
};

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Database helper functions
const findUserByEmail = (email) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const findUserByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const createUser = (username, email, hashedPassword) => {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
      [username, email, hashedPassword], 
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

const saveConversation = (userId, sessionId, message, response) => {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO conversations (user_id, session_id, message, response) VALUES (?, ?, ?, ?)',
      [userId, sessionId, message, response],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

const getUserConversations = (userId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT 100',
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

// Auth Routes
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    // Check if user already exists
    const existingUserByEmail = await findUserByEmail(email);
    const existingUserByUsername = await findUserByUsername(username);
    
    if (existingUserByEmail) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    if (existingUserByUsername) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = await createUser(username, email, hashedPassword);

    // Generate JWT token
    const token = jwt.sign(
      { userId: userId, username: username, email: email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`New user registered: ${username} (${email}) - ID: ${userId}`);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { id: userId, username, email }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Find user by email
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`User logged in: ${user.username} (ID: ${user.id})`);

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error during login' });
  }
});

// Verify token endpoint
app.get('/api/verify-token', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.userId,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// Get user's conversation history
app.get('/api/conversation', authenticateToken, async (req, res) => {
  try {
    const conversations = await getUserConversations(req.user.userId);
    res.json({ conversations });
  } catch (error) {
    console.error('Error loading conversations:', error);
    res.status(500).json({ message: 'Error loading conversations' });
  }
});

// Admin endpoint to get database stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const userCountPromise = new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    const conversationCountPromise = new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM conversations', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    const [userCount, conversationCount] = await Promise.all([userCountPromise, conversationCountPromise]);

    res.json({
      totalUsers: userCount,
      totalConversations: conversationCount,
      databasePath: DB_PATH
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ message: 'Error getting database stats' });
  }
});

// Protected chat endpoint
app.post('/api/chat', authenticateToken, async (req, res) => {
  const { message, conversationHistory, sessionId } = req.body;
  const userId = req.user.userId;
  
  console.log('=== DEBUG INFO ===');
  console.log('User:', req.user.username, '(ID:', userId, ')');
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
    
    // Add personalized system message
    messages.push({
      role: 'system',
      content: `You are Jarvis, an intelligent AI assistant for ${req.user.username}. Be helpful, conversational, and remember the context of your conversation. You can reference previous parts of your conversation.`
    });
    
    // Add conversation history - but EXCLUDE the last message since it's the current user message
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 1) {
      const pastMessages = conversationHistory.slice(0, -1);
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
    const responseText = data?.message?.content || data?.response || "No response from bot";
    
    console.log("Response from Ollama received, length:", responseText.length);

    // Save conversation to database
    try {
      await saveConversation(userId, sessionId, message, responseText);
      console.log('Conversation saved to database');
    } catch (convError) {
      console.error('Error saving conversation to database:', convError);
    }

    res.json({ message: responseText });

  } catch (error) {
    console.error("Error processing message:", error);
    res.status(500).json({ message: "Error: Could not process message." });
  }
});

// Initialize database and start server
initDatabase().then(() => {
  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('JWT Secret configured:', JWT_SECRET ? 'YES' : 'NO');
    console.log('Database path:', DB_PATH);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});