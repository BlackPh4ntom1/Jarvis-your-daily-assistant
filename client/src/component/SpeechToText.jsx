import { useState, useEffect, useRef } from 'react';

function useSpeechToText(wakeCommand = 'hey assistant') {
  const [isListening, setIsListening] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [rawTranscript, setRawTranscript] = useState(''); // For debugging
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const wakeTimeoutRef = useRef(null);

  // Configuration
  const WAKE_TIMEOUT = 10000; // 10 seconds of inactivity before going back to sleep

  useEffect(() => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech Recognition not supported');
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;
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

      const fullTranscript = finalTranscript + interimTranscript;
      setRawTranscript(fullTranscript);

      // Check for wake command
      if (!isAwake && fullTranscript.toLowerCase().includes(wakeCommand.toLowerCase())) {
        setIsAwake(true);
        
        // Remove the wake command from the transcript and set the cleaned version
        const wakeIndex = fullTranscript.toLowerCase().indexOf(wakeCommand.toLowerCase());
        const beforeWake = fullTranscript.substring(0, wakeIndex);
        const afterWake = fullTranscript.substring(wakeIndex + wakeCommand.length);
        const cleanedTranscript = (beforeWake + afterWake).trim();
        
        setTranscript(cleanedTranscript);

        // Set timeout to go back to sleep
        if (wakeTimeoutRef.current) {
          clearTimeout(wakeTimeoutRef.current);
        }
        wakeTimeoutRef.current = setTimeout(() => {
          setIsAwake(false);
          setTranscript('');
        }, WAKE_TIMEOUT);
      } else if (isAwake) {
        // If awake, capture all speech but still remove wake command if it appears
        let cleanedTranscript = fullTranscript;
        if (fullTranscript.toLowerCase().includes(wakeCommand.toLowerCase())) {
          const wakeIndex = fullTranscript.toLowerCase().indexOf(wakeCommand.toLowerCase());
          const beforeWake = fullTranscript.substring(0, wakeIndex);
          const afterWake = fullTranscript.substring(wakeIndex + wakeCommand.length);
          cleanedTranscript = (beforeWake + afterWake).trim();
        }
        
        setTranscript(cleanedTranscript);
        
        // Reset sleep timeout
        if (wakeTimeoutRef.current) {
          clearTimeout(wakeTimeoutRef.current);
        }
        wakeTimeoutRef.current = setTimeout(() => {
          setIsAwake(false);
          setTranscript('');
        }, WAKE_TIMEOUT);
      }
    };

    recognition.onerror = (event) => {
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    // Clean up on unmount
    return () => {
      if (wakeTimeoutRef.current) {
        clearTimeout(wakeTimeoutRef.current);
      }
      recognition.stop();
    };
  }, [wakeCommand, isAwake]);

  // Controls
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
    setIsAwake(false);
    if (wakeTimeoutRef.current) {
      clearTimeout(wakeTimeoutRef.current);
    }
  };

  const toggleListening = () => {
    isListening ? stopListening() : startListening();
  };

  const clearTranscript = () => {
    setTranscript('');
    setRawTranscript('');
  };

  const sleep = () => {
    setIsAwake(false);
    setTranscript('');
    if (wakeTimeoutRef.current) {
      clearTimeout(wakeTimeoutRef.current);
    }
  };

  const wake = () => {
    setIsAwake(true);
    if (wakeTimeoutRef.current) {
      clearTimeout(wakeTimeoutRef.current);
    }
    wakeTimeoutRef.current = setTimeout(() => {
      setIsAwake(false);
      setTranscript('');
    }, WAKE_TIMEOUT);
  };

  return {
    isListening,
    isAwake,
    transcript,
    rawTranscript, // For debugging - shows all speech
    error,
    wakeCommand,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript,
    sleep,
    wake
  };
}

export default useSpeechToText;