require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'jarvis_db',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL database:', err);
    process.exit(1);
  } else {
    console.log('✅ Connected to PostgreSQL database successfully');
    release();
  }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';

// Initialize database tables
const initDatabase = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(255),
        message TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_sessions table for tracking active sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes separately
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)
    `);

    // Create function to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create trigger for users table
    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query('COMMIT');
    console.log('✅ Database tables initialized successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
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
const findUserByEmail = async (email) => {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0];
};

const findUserByUsername = async (username) => {
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
};

const findUserById = async (id) => {
  const result = await pool.query('SELECT id, username, email, created_at FROM users WHERE id = $1', [id]);
  return result.rows[0];
};

const createUser = async (username, email, hashedPassword) => {
  const result = await pool.query(
    'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
    [username, email, hashedPassword]
  );
  return result.rows[0];
};

const saveConversation = async (userId, sessionId, message, response) => {
  const result = await pool.query(
    'INSERT INTO conversations (user_id, session_id, message, response) VALUES ($1, $2, $3, $4) RETURNING id',
    [userId, sessionId, message, response]
  );
  return result.rows[0];
};

const getUserConversations = async (userId, limit = 100) => {
  const result = await pool.query(
    'SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return result.rows;
};

const getUserStats = async (userId) => {
  const result = await pool.query(
    `SELECT 
      COUNT(*) as total_conversations,
      COUNT(DISTINCT session_id) as total_sessions,
      MIN(created_at) as first_conversation,
      MAX(created_at) as last_conversation
     FROM conversations 
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
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

  if (username.length < 3) {
    return res.status(400).json({ message: 'Username must be at least 3 characters long' });
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
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const newUser = await createUser(username, email, hashedPassword);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: newUser.id, 
        username: newUser.username, 
        email: newUser.email 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ New user registered: ${username} (${email}) - ID: ${newUser.id}`);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { 
        id: newUser.id, 
        username: newUser.username, 
        email: newUser.email,
        createdAt: newUser.created_at
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
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
      { 
        userId: user.id, 
        username: user.username, 
        email: user.email 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ User logged in: ${user.username} (ID: ${user.id})`);

    res.json({
      message: 'Login successful',
      token,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Error during login' });
  }
});

// Verify token endpoint
app.get('/api/verify-token', authenticateToken, async (req, res) => {
  try {
    // Get fresh user data from database
    const user = await findUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(500).json({ message: 'Error verifying token' });
  }
});

// Get user profile with stats
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.userId);
    const stats = await getUserStats(req.user.userId);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at
      },
      stats: {
        totalConversations: parseInt(stats.total_conversations),
        totalSessions: parseInt(stats.total_sessions),
        firstConversation: stats.first_conversation,
        lastConversation: stats.last_conversation
      }
    });
  } catch (error) {
    console.error('❌ Error loading profile:', error);
    res.status(500).json({ message: 'Error loading profile' });
  }
});

// Get user's conversation history
app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const conversations = await getUserConversations(req.user.userId, limit);
    res.json({ 
      conversations,
      count: conversations.length 
    });
  } catch (error) {
    console.error('❌ Error loading conversations:', error);
    res.status(500).json({ message: 'Error loading conversations' });
  }
});

// Admin endpoint to get database stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const userCountResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const conversationCountResult = await pool.query('SELECT COUNT(*) as count FROM conversations');
    const recentUsersResult = await pool.query(
      'SELECT username, email, created_at FROM users ORDER BY created_at DESC LIMIT 10'
    );

    res.json({
      totalUsers: parseInt(userCountResult.rows[0].count),
      totalConversations: parseInt(conversationCountResult.rows[0].count),
      recentUsers: recentUsersResult.rows,
      database: 'PostgreSQL'
    });
  } catch (error) {
    console.error('❌ Error getting admin stats:', error);
    res.status(500).json({ message: 'Error getting database stats' });
  }
});

// Protected chat endpoint
app.post('/api/chat', authenticateToken, async (req, res) => {
  const { message, conversationHistory, sessionId } = req.body;
  const userId = req.user.userId;
  
  console.log('=== CHAT DEBUG INFO ===');
  console.log('User:', req.user.username, '(ID:', userId, ')');
  console.log('Session:', sessionId);
  console.log('Current message:', message);
  console.log('Conversation history length:', conversationHistory?.length || 0);
  
  if (conversationHistory && conversationHistory.length > 0) {
    console.log('Last few messages:');
    conversationHistory.slice(-3).forEach((msg, i) => {
      console.log(`  ${i}: [${msg.sender}] ${msg.text?.substring(0, 50)}...`);
    });
  }
  console.log('========================');
  
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
    
    console.log("✅ Response from Ollama received, length:", responseText.length);

    // Save conversation to PostgreSQL database
    try {
      await saveConversation(userId, sessionId, message, responseText);
      console.log('✅ Conversation saved to PostgreSQL database');
    } catch (convError) {
      console.error('❌ Error saving conversation to database:', convError);
    }

    res.json({ message: responseText });

  } catch (error) {
    console.error("❌ Error processing message:", error);
    res.status(500).json({ message: "Error: Could not process message." });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  await pool.end();
  console.log('✅ Database connection closed');
  process.exit(0);
});

// Initialize database and start server
initDatabase().then(() => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log('✅ JWT Secret configured:', JWT_SECRET ? 'YES' : 'NO');
    console.log('✅ PostgreSQL database connected');
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});