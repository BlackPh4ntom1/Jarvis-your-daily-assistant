import { useState, useEffect, useRef } from 'react';

function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech Recognition not supported');
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;
    recognition.continuous = true;       // Keep listening continuously
    recognition.interimResults = true;   // Get partial results
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const speech = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += speech + ' ';
        } else {
          interimTranscript += speech;
        }
      }
      setTranscript(finalTranscript + interimTranscript);
    };

    recognition.onerror = (event) => {
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    // Clean up on unmount
    return () => recognition.stop();
  }, []);

  // Controls
  const startListening = () => {
    if (recognitionRef.current && !isListening) recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) recognitionRef.current.stop();
  };

  const toggleListening = () => {
    isListening ? stopListening() : startListening();
  };

  const clearTranscript = () => setTranscript('');

  return { isListening, transcript, error, startListening, stopListening, toggleListening, clearTranscript };
}

export default useSpeechToText;
