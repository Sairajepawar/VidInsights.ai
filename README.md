# Video Insights AI

A web application that generates AI-powered summaries and insights from YouTube videos using Groq and Neo4j. Ask questions about your videos and get intelligent answers backed by a knowledge graph.

## Features

- YouTube video transcript extraction and analysis
- Multiple language support for both summaries and questions
- Voice input support for questions
- Dark/light mode theme switching
- Question & Answer history with local storage
- Customizable summary options:
  - Adjustable length
  - Different styles (concise, normal, explanatory)
- Knowledge graph generation using Neo4j
- Modern responsive UI with Tailwind CSS
- Powered by Groq's LLM for high-quality responses

## Prerequisites

- Python 3.8+
- Node.js 18+
- Neo4j Database
- Groq API Key

## Setup

### Backend Setup

1. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
```

2. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

3. Configure environment variables:
- Copy `.env.example` to `.env`
- Add your Groq API key
- Configure Neo4j connection details

4. Start the backend server:
```bash
uvicorn main:app --reload
```

### Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Start the development server:
```bash
npm run dev
```

### Neo4j Setup

1. Install and start Neo4j
2. Create a new database or use the default one
3. Update the `.env` file with your Neo4j credentials

## Usage

1. Open the application in your browser (default: http://localhost:5173)
2. Paste a YouTube video URL
3. Select your preferred language
4. Choose the summary length and style
5. Click "Generate Summary"

## Architecture

- Frontend: React + Vite + Tailwind CSS
- Backend: FastAPI
- Database: Neo4j (Knowledge Graph)
- AI Services: Groq (LLaMA, Whisper)
- Video Processing: youtube-transcript-api

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
