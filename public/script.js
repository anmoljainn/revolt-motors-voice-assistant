 document.addEventListener('DOMContentLoaded', () => {
      const startBtn = document.getElementById('startBtn');
      const interruptBtn = document.getElementById('interruptBtn');
      const statusEl = document.getElementById('status');
      const conversationEl = document.getElementById('conversation');
      const volumeSlider = document.getElementById('volumeSlider');
      
      let socket;
      let mediaRecorder;
      let audioChunks = [];
      let isRecording = false;
      let isPlaying = false;
      let currentAudio = null;
      let reconnectAttempts = 0;
      const maxReconnectAttempts = 5;
      let reconnectTimeout;
      
      // Set up volume control
      volumeSlider.addEventListener('input', () => {
        if (currentAudio) {
          currentAudio.volume = volumeSlider.value / 100;
        }
      });
      
      // Initialize WebSocket connection
      function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
          console.log('WebSocket connected');
          statusEl.textContent = 'Connected';
          reconnectAttempts = 0;
          socket.send(JSON.stringify({ type: 'start_session' }));
          startBtn.disabled = false;
        };
        
        socket.onmessage = async (event) => {
          const data = JSON.parse(event.data);
          console.log('Received message:', data);
          
          if (data.type === 'session_started') {
            console.log('Session started successfully');
          }
          else if (data.type === 'audio_response') {
            // Display the text response
            addMessage('assistant', data.text);
            
            // Play the audio response
            if (data.audio && data.audio.length > 0) {
              // Server provided audio, play it
              playAudioFromBase64(data.audio, 'audio/mp3');
            } else {
              // No audio from server, use browser's TTS
              speakText(data.text);
            }
          } 
          else if (data.type === 'error') {
            statusEl.textContent = `Error: ${data.message}`;
            startBtn.disabled = false;
            interruptBtn.disabled = true;
            isRecording = false;
            isPlaying = false;
          }
        };
        
        socket.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          statusEl.textContent = 'Disconnected';
          startBtn.disabled = true;
          interruptBtn.disabled = true;
          
          // Attempt to reconnect
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
            statusEl.textContent = `Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`;
            
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
              initWebSocket();
            }, 2000 * reconnectAttempts);
          } else {
            statusEl.textContent = 'Connection failed. Please refresh the page.';
          }
        };
        
        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          statusEl.textContent = 'Connection error';
        };
      }
      
      // Play audio from base64 data
      function playAudioFromBase64(base64Audio, mimeType) {
        isPlaying = true;
        startBtn.disabled = true;
        interruptBtn.disabled = false;
        
        try {
          const audioBlob = base64ToBlob(base64Audio, mimeType);
          const audioUrl = URL.createObjectURL(audioBlob);
          
          // Stop any currently playing audio
          if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
          }
          
          // Create and play new audio
          currentAudio = new Audio(audioUrl);
          currentAudio.volume = volumeSlider.value / 100;
          
          currentAudio.onended = () => {
            isPlaying = false;
            startBtn.disabled = false;
            interruptBtn.disabled = true;
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
          };
          
          currentAudio.onerror = (error) => {
            console.error('Audio playback error:', error);
            isPlaying = false;
            startBtn.disabled = false;
            interruptBtn.disabled = true;
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
          };
          
          currentAudio.play().catch(error => {
            console.error('Error playing audio:', error);
            isPlaying = false;
            startBtn.disabled = false;
            interruptBtn.disabled = true;
          });
        } catch (error) {
          console.error('Error processing audio data:', error);
          isPlaying = false;
          startBtn.disabled = false;
          interruptBtn.disabled = true;
        }
      }
      
      // Use browser's built-in text-to-speech
      function speakText(text) {
        if ('speechSynthesis' in window) {
          isPlaying = true;
          startBtn.disabled = true;
          interruptBtn.disabled = false;
          
          // Cancel any ongoing speech
          window.speechSynthesis.cancel();
          
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.volume = volumeSlider.value / 100;
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          
          utterance.onend = () => {
            isPlaying = false;
            startBtn.disabled = false;
            interruptBtn.disabled = true;
          };
          
          utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            isPlaying = false;
            startBtn.disabled = false;
            interruptBtn.disabled = true;
          };
          
          window.speechSynthesis.speak(utterance);
        } else {
          console.log('Speech synthesis not supported in this browser');
          isPlaying = false;
          startBtn.disabled = false;
          interruptBtn.disabled = true;
        }
      }
      
      // Initialize audio recording
      async function initAudioRecording() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          
          // Try to use a compatible audio format
          let options = { mimeType: 'audio/webm;codecs=opus' };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.log('opus not supported, trying webm');
            options = { mimeType: 'audio/webm' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              console.log('webm not supported, using default');
              options = {};
            }
          }
          
          mediaRecorder = new MediaRecorder(stream, options);
          console.log('Using MIME type:', mediaRecorder.mimeType);
          
          mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
          };
          
          mediaRecorder.onstop = () => {
            // Determine the MIME type based on what was actually used
            let mimeType = mediaRecorder.mimeType || 'audio/webm';
            if (mimeType.includes('audio')) {
              // Extract just the MIME type without parameters
              mimeType = mimeType.split(';')[0];
            }
            
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            const reader = new FileReader();
            
            reader.onloadend = () => {
              const base64Audio = reader.result.split(',')[1];
              // Include the MIME type so the server knows what format to expect
              const message = {
                type: 'audio', 
                audio: base64Audio,
                mimeType: mimeType
              };
              console.log('Sending audio message');
              socket.send(JSON.stringify(message));
            };
            
            reader.readAsDataURL(audioBlob);
            audioChunks = [];
          };
        } catch (error) {
          statusEl.textContent = 'Microphone access denied';
          console.error('Error accessing microphone:', error);
        }
      }
      
      // Add message to conversation
      function addMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.textContent = text;
        conversationEl.appendChild(messageDiv);
        conversationEl.scrollTop = conversationEl.scrollHeight;
      }
      
      // Convert base64 to Blob
      function base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
      }
      
      // Start button click handler
      startBtn.addEventListener('click', () => {
        if (!isRecording && !isPlaying) {
          isRecording = true;
          startBtn.textContent = '⏹️';
          statusEl.textContent = 'Listening...';
          mediaRecorder.start();
          
          // Stop recording after 5 seconds if not manually stopped
          setTimeout(() => {
            if (isRecording) {
              mediaRecorder.stop();
              isRecording = false;
              startBtn.textContent = '🎤';
              statusEl.textContent = 'Processing...';
            }
          }, 5000);
        } else if (isRecording) {
          mediaRecorder.stop();
          isRecording = false;
          startBtn.textContent = '🎤';
          statusEl.textContent = 'Processing...';
        }
      });
      
      // Interrupt button click handler
      interruptBtn.addEventListener('click', () => {
        if (isPlaying) {
          if (currentAudio) {
            // Stop the currently playing audio
            currentAudio.pause();
            currentAudio = null;
          }
          
          // Cancel any ongoing speech synthesis
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
          
          // Send interrupt signal to server
          socket.send(JSON.stringify({ type: 'interrupt' }));
          
          isPlaying = false;
          startBtn.disabled = false;
          interruptBtn.disabled = true;
          statusEl.textContent = 'Interrupted. Ready for new input.';
        }
      });
      
      // Initialize the application
      initWebSocket();
      initAudioRecording();
    });