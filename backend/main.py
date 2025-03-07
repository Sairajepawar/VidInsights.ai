from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
import re
import os
import base64
import tempfile
from dotenv import load_dotenv
from groq import Groq
import httpx
from typing import Optional, List, Dict
import ssl
from neo4j import GraphDatabase
from urllib3.util import ssl_
from gtts import gTTS

load_dotenv()

app = FastAPI()

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def hello():
    return {
        "message": "Hello from VidInsights.ai API!",
        "status": "online",
        "version": "1.0.0"
    }

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Neo4j setup
neo4j_uri = os.getenv("NEO4J_URI")
neo4j_user = os.getenv("NEO4J_USERNAME")  
neo4j_password = os.getenv("NEO4J_PASSWORD")

# Validate Neo4j credentials
if not all([neo4j_uri, neo4j_user, neo4j_password]):
    raise ValueError("Missing Neo4j credentials. Please check your .env file.")

try:
    # Initialize Neo4j driver with proper SSL configuration
    neo4j_driver = GraphDatabase.driver(
        neo4j_uri,
        auth=(neo4j_user, neo4j_password)
    )
    
    # Test connection
    with neo4j_driver.session() as session:
        result = session.run("RETURN 1")
        result.single()  # Verify we can actually execute a query
    print("Successfully connected to Neo4j database")
    
except Exception as e:
    print(f"Failed to connect to Neo4j: {str(e)}")
    raise ValueError(f"Neo4j connection failed: {str(e)}")

def get_neo4j_driver():
    return neo4j_driver

class VideoRequest(BaseModel):
    video_url: str
    language: str
    word_count: int
    style: str

class QuestionRequest(BaseModel):
    video_url: str
    question: str
    language: str
    question_type: str = "text"  # "text" or "speech"

class SpeechToTextRequest(BaseModel):
    audio_data: str  # Base64 encoded audio data
    language: str

class VideoResponse(BaseModel):
    success: bool
    summary: str
    message: Optional[str] = None

class QuestionResponse(BaseModel):
    success: bool
    answer: str
    message: Optional[str] = None

class TextFormatter:
    def format_transcript(self, transcript):
        return " ".join([entry["text"] for entry in transcript])

def extract_video_id(url: str) -> str:
    video_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', url)
    if not video_id_match:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    return video_id_match.group(1)

def create_knowledge_graph(video_id: str, transcript_text: str):
    try:
        with neo4j_driver.session() as session:
            # First, test the connection
            session.run("RETURN 1")
            
            # check video already exists in knowledge graph
            result = session.run("""
                MATCH (v:Video {video_id: $video_id}) 
                RETURN v LIMIT 1
            """, video_id=video_id)
            
            if result.single():
                print(f"Video with ID '{video_id}' already exists. Aborting operation.")
                return  # Stop function if video already exists

            
            # Create video node
            session.run("""
                CREATE (v:Video {video_id: $video_id, transcript: $transcript})
            """, video_id=video_id, transcript=transcript_text)
            
            # Generate entities and relationships using Groq
            prompt = f"""
            Analyze this video transcript and identify key entities (people, places, concepts, events) and their relationships.
            Format the output as a list of triples (entity1, relationship, entity2).
            Keep it focused on the most important relationships.
            
            Transcript:
            {transcript_text}
            
            Output only the triples in this format (maximum 10 relationships):
            entity1|relationship|entity2
            """
            
            response = groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-specdec",
                temperature=0.3,
            )
            
            triples = response.choices[0].message.content.strip().split('\n')
            
            # Create nodes and relationships in Neo4j
            for triple in triples:
                if '|' not in triple:
                    continue
                try:
                    entity1, relationship, entity2 = triple.split('|')
                    session.run("""
                        MATCH (v:Video {video_id: $video_id})
                        MERGE (e1:Entity {name: $entity1})
                        MERGE (e2:Entity {name: $entity2})
                        MERGE (e1)-[r:RELATES_TO {type: $relationship}]->(e2)
                        MERGE (v)-[:HAS_ENTITY]->(e1)
                        MERGE (v)-[:HAS_ENTITY]->(e2)
                    """, 
                    video_id=video_id,
                    entity1=entity1.strip(),
                    entity2=entity2.strip(),
                    relationship=relationship.strip()
                    )
                except Exception as e:
                    print(f"Error creating relationship: {str(e)}")
                    continue
                    
    except Exception as e:
        print(f"Error in create_knowledge_graph: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create knowledge graph: {str(e)}"
        )

def enforce_language(text: str, target_language: str) -> str:
    """Ensure the text is in the specified language using appropriate grammar and script"""
    language_prompts = {
        "english": "Translate this to English if it's not already in English: ",
        "hindi": "Translate this to Hindi (हिंदी) using Devanagari script: ",
        "marathi": "Translate this to Marathi (मराठी) using Marathi script. Ensure it's proper Marathi, not Hindi: ",
        "gujarati": "Translate this to Gujarati (ગુજરાતી) using Gujarati script: ",
        "bengali": "Translate this to Bengali (বাংলা) using Bengali script: ",
        "kannada": "Translate this to Kannada (ಕನ್ನಡ) using Kannada script: "
    }
    
    prompt = f"""
    {language_prompts.get(target_language.lower(), "Translate to English: ")}
    
    Text: {text}
    
    Important: If the target language is Marathi, ensure it's proper Marathi language and not Hindi.
    Use appropriate grammar, vocabulary, and expressions specific to the target language.
    """
    
    response = groq_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.3-70b-specdec",
        temperature=0.3,
    )
    
    return response.choices[0].message.content.strip()

def generate_graph_based_summary(video_id: str, style: str, word_count: int, language: str = "english") -> str:
    with neo4j_driver.session() as session:
        # Get the transcript and key entities
        result = session.run("""
            MATCH (v:Video {video_id: $video_id})
            OPTIONAL MATCH (v)-[:HAS_ENTITY]->(e)
            WITH v, collect(DISTINCT e.name) as entities
            RETURN v.transcript as transcript, entities
        """, video_id=video_id)
        
        data = result.single()
        if not data:
            raise HTTPException(status_code=404, detail="Video not found in knowledge graph")
        
        transcript = data["transcript"]
        entities = data["entities"]
        
        # Get key relationships
        relationships = session.run("""
            MATCH (v:Video {video_id: $video_id})-[:HAS_ENTITY]->(e1)-[r:RELATES_TO]->(e2)
            RETURN e1.name as from, r.type as relationship, e2.name as to
        """, video_id=video_id)
        
        relationships_text = "\n".join([
            f"- {rel['from']} {rel['relationship']} {rel['to']}"
            for rel in relationships
        ])

        # Generate summary first
        summary_prompt = f"""
        Generate a {style} summary of approximately {word_count} words for this video.
        Use the knowledge graph information to structure the summary.
        
        Key entities: {', '.join(entities)}
        
        Key relationships:
        {relationships_text}
        
        Full transcript:
        {transcript}
        
        Focus on the main topics and their relationships, ensuring the summary is {style} in nature.
        """
        
        summary_response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": summary_prompt}],
            model="llama-3.3-70b-specdec",
            temperature=0.7,
        )
        
        summary = summary_response.choices[0].message.content.strip()
        
        # Enforce the target language
        if language.lower() != "english":
            summary = enforce_language(summary, language)
        
        return summary

def answer_question_with_graph(video_id: str, question: str, language: str = "english") -> str:
    with neo4j_driver.session() as session:
        # Get relevant entities and relationships based on the question
        result = session.run("""
            MATCH (v:Video {video_id: $video_id})
            OPTIONAL MATCH (v)-[:HAS_ENTITY]->(e1)-[r:RELATES_TO]->(e2)
            WITH v, collect(DISTINCT {from: e1.name, rel: r.type, to: e2.name}) as relationships
            RETURN v.transcript as transcript, relationships
        """, video_id=video_id)
        
        data = result.single()
        if not data:
            raise HTTPException(status_code=404, detail="Video not found in knowledge graph")
        
        transcript = data["transcript"]
        relationships = data["relationships"]
        
        relationships_text = "\n".join([
            f"- {rel['from']} {rel['rel']} {rel['to']}"
            for rel in relationships
        ])

        # Generate answer first in English
        answer_prompt = f"""
        Answer this question based on the video content and knowledge graph: {question}
        
        Use these relationships from the knowledge graph to provide context:
        {relationships_text}
        
        Full transcript:
        {transcript}
        
        Provide a clear and concise answer, using the knowledge graph relationships to support your response.
        """
        
        answer_response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": answer_prompt}],
            model="llama-3.3-70b-specdec",
            temperature=0.5,
        )
        
        answer = answer_response.choices[0].message.content.strip()
        
        # Enforce the target language
        if language.lower() != "english":
            answer = enforce_language(answer, language)
        
        return answer

@app.post("/speech-to-text")
async def speech_to_text(request: SpeechToTextRequest):
    try:
        # Decode base64 audio data
        audio_bytes = base64.b64decode(request.audio_data.split(',')[1] if ',' in request.audio_data else request.audio_data)
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix='.m4a', delete=False) as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name
        
        try:
            # Transcribe using Groq's API
            with open(temp_audio_path, "rb") as audio_file:
                transcription = groq_client.audio.transcriptions.create(
                    file=(temp_audio_path, audio_file.read()),
                    model="distil-whisper-large-v3-en",
                    response_format="verbose_json",
                )
            
            # Clean up temp file
            os.unlink(temp_audio_path)
            
            # If language is not English, translate the transcription
            text = transcription.text
            if request.language.lower() != "english":
                text = enforce_language(text, request.language)
            
            return {
                "success": True,
                "text": text.strip()
            }
        except Exception as e:
            if os.path.exists(temp_audio_path):
                os.unlink(temp_audio_path)
            raise HTTPException(status_code=500, detail=f"Error transcribing audio: {str(e)}")
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing audio: {str(e)}")

@app.post("/process-video", response_model=VideoResponse)
async def process_video(request: VideoRequest):
    try:
        video_id = extract_video_id(request.video_url)
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            formatter = TextFormatter()
            transcript_text = formatter.format_transcript(transcript)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not fetch video transcript: {str(e)}")
        
        try:
            # Create knowledge graph
            create_knowledge_graph(video_id, transcript_text)
            
            # Generate summary using graph with language support
            summary = generate_graph_based_summary(
                video_id=video_id,
                style=request.style,
                word_count=request.word_count,
                language=request.language
            )
            
            return VideoResponse(
                success=True,
                summary=summary,
                message="Video processed successfully"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error processing video: {str(e)}")
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ask-question", response_model=QuestionResponse)
async def ask_question(request: QuestionRequest):
    try:
        video_id = extract_video_id(request.video_url)
        
        if request.question_type == "speech":
            # Transcribe speech to text
            speech_to_text_response = await speech_to_text(SpeechToTextRequest(audio_data=request.question, language=request.language))
            question = speech_to_text_response["text"]
        else:
            question = request.question
        
        try:
            # Use knowledge graph for Q&A with language support
            answer = answer_question_with_graph(
                video_id=video_id,
                question=question,
                language=request.language  
            )
            
            return QuestionResponse(
                success=True,
                answer=answer,
                message="Question answered successfully"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error answering question: {str(e)}")
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Define a Pydantic model for the request body
class TextToSpeechRequest(BaseModel):
    text: str
    lang: str

@app.post("/text-to-speech")
async def text_to_speech(request: TextToSpeechRequest):
    try:
        # Create a gTTS object
        tts = gTTS(text=request.text, lang=request.lang, slow=False)
        
        # Save the audio to a temporary file
        audio_file = "temp_audio.mp3"
        tts.save(audio_file)
        
        # Read the audio file and encode it to base64
        with open(audio_file, "rb") as audio:
            audio_base64 = base64.b64encode(audio.read()).decode('utf-8')
        
        # Clean up the temporary file
        os.remove(audio_file)
        
        return {"audioContent": audio_base64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
