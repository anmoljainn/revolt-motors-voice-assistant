#Instructions

#Clone the repository

git clone https://github.com/anmoljainn/revolt-motors-voice-assistant.git cd revolt-motors-voice-assistant

#Install dependencies

npm install

#Setup environment variables

Copy .env.example to .env

#Edit .env to add your Gemini API Key and PORT:

GEMINI_API_KEY=your_api_key_here PORT=3000 MODEL=models/gemini-2.5-flash-preview-native-audio-dialog

#Run the application

npm run dev