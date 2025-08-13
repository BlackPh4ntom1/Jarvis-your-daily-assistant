require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser());

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'jarvis_db',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL database:', err);
    process.exit(1);
  } else {
    console.log('✅ Connected to PostgreSQL database successfully');
    release();
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/'
};

const authenticateToken = (req, res, next) => {
  const token = req.cookies.authToken || 
                (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      res.clearCookie('authToken', COOKIE_OPTIONS);
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// DB helpers
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

// Weather API function
async function getCurrentWeather(city) {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) throw new Error("Missing OPENWEATHERMAP_API_KEY in environment variables");

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.statusText}`);
  const data = await res.json();

  return `${data.main.temp}°C with ${data.weather[0].description} in ${city}`;
}

// ======================= AUTH ROUTES =======================
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ message: 'Username, email, and password are required' });
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  if (username.length < 3) return res.status(400).json({ message: 'Username must be at least 3 characters long' });

  try {
    if (await findUserByEmail(email)) return res.status(400).json({ message: 'User with this email already exists' });
    if (await findUserByUsername(username)) return res.status(400).json({ message: 'Username already taken' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await createUser(username, email, hashedPassword);

    const token = jwt.sign({ userId: newUser.id, username: newUser.username, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('authToken', token, COOKIE_OPTIONS);
    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  try {
    const user = await findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ userId: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('authToken', token, COOKIE_OPTIONS);
    res.json({ message: 'Login successful', user });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Error during login' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('authToken', COOKIE_OPTIONS);
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/verify-token', authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ valid: true, user });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying token' });
  }
});

// ======================= CHAT ROUTE WITH WEATHER =======================
app.post('/api/chat', authenticateToken, async (req, res) => {
  const { message, conversationHistory, sessionId } = req.body;
  const userId = req.user.userId;

  try {
    let messages = [{
      role: 'system',
      content: `You are Jarvis, an AI assistant for ${req.user.username}.
      If you need real-time weather, reply ONLY with description ` //{"action":"get_current_weather","city":"London"}
    }];

    if (conversationHistory && conversationHistory.length > 1) {
      const past = conversationHistory.slice(0, -1).slice(-15);
      past.forEach(msg => {
        messages.push({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text });
      });
    }

    messages.push({ role: 'user', content: message });

    // First call to Ollama
    const botResponse = await fetch("https://ollama.vsp.dev/api/chat", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}` },
      body: JSON.stringify({ model: 'llama3.1', messages, stream: false })
    });

    const data = await botResponse.json();
    let responseText = data?.message?.content || data?.response || "No response from bot";

    // Check for weather request JSON
    let toolCall;
    try { toolCall = JSON.parse(responseText); } catch { toolCall = null; }

    if (toolCall?.action === "get_current_weather" && toolCall.city) {
      const weatherInfo = await getCurrentWeather(toolCall.city);
      messages.push({ role: 'assistant', content: responseText });
      messages.push({ role: 'tool', name: 'get_current_weather', content: weatherInfo });

      const finalBotResponse = await fetch("https://ollama.vsp.dev/api/chat", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}` },
        body: JSON.stringify({ model: 'llama3.1', messages, stream: false })
      });

      const finalData = await finalBotResponse.json();
      responseText = finalData?.message?.content || finalData?.response || weatherInfo;
    }

    await saveConversation(userId, sessionId, message, responseText);
    res.json({ message: responseText });

  } catch (error) {
    console.error("❌ Chat error:", error);
    res.status(500).json({ message: "Could not process message." });
  }
});

// ======================= DB INIT =======================
const initDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(255),
        message TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await client.query('COMMIT');
    console.log('✅ Database initialized');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down...');
  await pool.end();
  process.exit(0);
});

initDatabase().then(() => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
});
