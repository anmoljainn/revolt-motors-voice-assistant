const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const gTTS = require('gtts');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Gemini Live API configuration
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL_ID = 'gemini-1.5-flash-latest'; // Using for text responses

// Get API key from environment variables
const API_KEY = process.env.GEMINI_API_KEY;

// System instructions for Revolt Motors
const SYSTEM_INSTRUCTIONS = `You are Rev, an AI assistant for Revolt Motors. Only provide information about Revolt Motors products, services, and company. If asked about unrelated topics, politely redirect to Revolt Motors. Be helpful, friendly, and concise. Revolt Motors specializes in electric motorcycles and scooters.`;

// Create a temporary directory for audio files
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  let session = null;
  let isProcessing = false;
  
  // Handle incoming messages from client
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'start_session') {
        session = await initializeGeminiSession();
        ws.send(JSON.stringify({ type: 'session_started' }));
        console.log('Session started');
      } 
      else if (data.type === 'audio' && session && !isProcessing) {
        isProcessing = true;
        try {
          console.log('Processing audio input...');
          const mimeType = data.mimeType || 'audio/webm';
          console.log('Audio MIME type:', mimeType);
          
          // First, transcribe the audio to text
          const textResponse = await sendAudioToGemini(session, data.audio, mimeType);
          console.log('Received text response from Gemini:', textResponse);
          
          // Then convert text to audio
          const audioBase64 = await textToSpeech(textResponse);
          
          ws.send(JSON.stringify({ 
            type: 'audio_response', 
            audio: audioBase64,
            text: textResponse 
          }));
        } catch (error) {
          console.error('Error processing audio:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Error processing your request. Please try again.' 
          }));
        } finally {
          isProcessing = false;
        }
      }
      else if (data.type === 'interrupt' && session) {
        console.log('Interruption requested');
        await handleInterruption(session);
        isProcessing = false;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'An error occurred. Please refresh and try again.' 
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Initialize Gemini Live API session
async function initializeGeminiSession() {
  return {
    initialized: true
  };
}

// Send audio to Gemini and get text response
async function sendAudioToGemini(session, audioInput, mimeType = 'audio/webm') {
  console.log('Sending request to Gemini API...');
  
  const response = await fetch(`${GEMINI_API_URL}/${MODEL_ID}:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ 
          inlineData: {
            mimeType: mimeType,
            data: audioInput
          }
        }]
      }],
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTIONS }]
      },
      generationConfig: {
        responseModalities: ["TEXT"], // Only request text
      }
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw new Error(`Failed to get response: ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log('Gemini API response received');
  
  // Extract text from the response
  let textResponse = "";
  
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const parts = data.candidates[0].content.parts;
    for (const part of parts) {
      if (part.text) {
        textResponse = part.text;
        break;
      }
    }
  }
  
  return textResponse;
}

// Convert text to speech using Google Text-to-Speech
async function textToSpeech(text) {
  return new Promise((resolve, reject) => {
    try {
      // Generate a unique filename
      const fileName = `speech_${Date.now()}.mp3`;
      const filePath = path.join(tempDir, fileName);
      
      console.log(`Generating speech file: ${filePath}`);
      
      // Create a new gTTS instance
      const tts = new gTTS(text, 'en');
      
      // Save the file
      tts.save(filePath, (err, result) => {
        if (err) {
          console.error('Error generating speech:', err);
          reject(err);
          return;
        }
        
        console.log('Speech file generated successfully');
        
        // Convert the MP3 file to base64
        try {
          const audioBuffer = fs.readFileSync(filePath);
          const base64Audio = audioBuffer.toString('base64');
          
          // Clean up the temporary file
          fs.unlinkSync(filePath);
          console.log('Speech file converted and cleaned up successfully');
          
          resolve(base64Audio);
        } catch (err) {
          console.error('Error reading audio file:', err);
          reject(err);
        }
      });
    } catch (error) {
      console.error('Error in textToSpeech:', error);
      reject(error);
    }
  });
}

// Handle interruption
async function handleInterruption(session) {
  console.log('Interruption handled');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});