# Jarvis-your-daily-assistant

# 🤖 Jarvis AI Chatbot

A modern, full-stack AI chatbot application with real-time streaming responses, voice recognition, and secure user authentication.

## ✨ Features

- **🔥 Real-time Streaming**: Messages stream word-by-word as they're generated, like ChatGPT
- **🎤 Voice Recognition**: Wake commands ("Hey Jarvis") with continuous speech-to-text
- **🔐 Secure Authentication**: JWT with httpOnly cookies for maximum security
- **💾 Persistent Conversations**: All chats saved per user with conversation history
- **📱 Responsive Design**: Modern UI with smooth animations and mobile-friendly layout
- **⚡ Performance Optimized**: Efficient database queries and optimized streaming
- **⛅ Weather searching**: weather commands for searching real-time weather

## 🛠️ Tech Stack

### Frontend
- **React** - Modern UI library with hooks
- **JavaScript ES6+** - Modern JavaScript features
- **CSS3** - Custom styling with animations
- **Web Speech API** - Voice recognition functionality

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **JWT** - Secure authentication
- **bcryptjs** - Password hashing
- **PostgreSQL** - Relational database

### AI Integration
- **Ollama API** - Llama 2.1 integration for intelligent responses

## 🚀 Getting Started

### Prerequisites
- Node.js (v14+)
- PostgreSQL
- npm 


## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │◄──►│  Express Server │◄──►│   PostgreSQL    │
│                 │    │                 │    │                 │
│ • Voice Input   │    │ • Authentication│    │ • Users         │
│ • Streaming UI  │    │ • Streaming API │    │ • Conversations │
│ • Chat History  │    │ • AI Integration│    │ • Sessions      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Llama 2.1. AI     │
                    │                 │
                    │ • LLM Processing│
                    │ • Stream Response│
                    └─────────────────┘
```

## 📁 Project Structure

```
jarvis-chatbot/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── styles/         # CSS files
│   │   └── App.jsx         # Main application
│   └── package.json
├── server/                 # Node.js backend
│   ├── server.js           # Main server file
│   ├── .env                # Environment variables
│   └── package.json
└── README.md
```



## 🎯 Use Cases

- **Personal Assistant**: Voice-activated AI assistant for daily tasks
- **Customer Support**: Automated customer service with human-like responses
- **Educational Tool**: Interactive learning with AI-powered explanations
- **Development Learning**: Full-stack development reference implementation

## 🚧 Future Enhancements

- [ ] File upload and document analysis
- [ ] Multi-language support
- [ ] Advanced voice commands
- [ ] Integration with external APIs ( calendar, etc.)
- [ ] Mobile app version
- [ ] Docker containerization
- [ ] Cloud deployment (AWS/Vercel)



## 👨‍💻 Author

**Gal Andrei Ionuț**
- GitHub: https://github.com/BlackPh4ntom1

## 🙏 Acknowledgments

- Victory Square Partners for internship opportunity
- Ollama team for AI API integration
- React and Node.js communities for excellent documentation

