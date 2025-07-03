# Calendar AI Setup Guide

## 🚨 Current Issue Fix

The error you're seeing is because the backend authentication isn't properly configured. Here's how to fix it:

## 1. 📊 Set up PostgreSQL Database

```bash
# Install PostgreSQL (if not already installed)
sudo apt install postgresql postgresql-contrib

# Create database
sudo -u postgres createuser --interactive
# Answer: y (superuser)
# Username: your_username

sudo -u postgres createdb calendar_ai

# Test connection
psql -d calendar_ai -c "SELECT version();"
```

## 2. 🔑 Configure Environment Variables

Edit `/home/derko/Calendar-AI/server/.env`:

```bash
# Database - Update with your actual credentials
DATABASE_URL=postgresql://your_username:your_password@localhost:5432/calendar_ai

# Google OAuth - Get from Google Cloud Console
GOOGLE_CLIENT_ID=your_actual_google_client_id
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret

# Session Secret - Generate a random string
SESSION_SECRET=your_random_session_secret_here

# Server
PORT=3001

# Ollama (Free LLM)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

## 3. 🤖 Set up Ollama (Free LLM)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
ollama serve

# In another terminal, pull the model
ollama pull llama3.2:3b
```

## 4. 🚀 Start the Services

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start Backend
cd /home/derko/Calendar-AI/server
npm install
npm run dev

# Terminal 3: Start Frontend
cd /home/derko/Calendar-AI/client
npm install
npm run dev
```

## 5. 🔧 Test the Setup

1. Go to `http://localhost:5173`
2. Sign in with Google
3. Try asking the chatbot: "What events do I have this week?"

## 🆘 Common Issues

- **Database connection failed**: Check PostgreSQL is running and credentials are correct
- **Google auth failed**: Verify Google OAuth credentials in `.env`
- **Ollama not responding**: Make sure `ollama serve` is running
- **CORS errors**: Backend should be on port 3001, frontend on 5173

## 🔍 Debug Commands

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check backend logs
cd /home/derko/Calendar-AI/server && npm run dev

# Test database connection
psql -d calendar_ai -c "SELECT NOW();"
```