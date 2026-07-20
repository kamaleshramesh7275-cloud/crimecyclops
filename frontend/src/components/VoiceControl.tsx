import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export default function VoiceControl() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (showToast) {
      timeout = setTimeout(() => {
        setShowToast(false);
      }, 3000);
    }
    return () => clearTimeout(timeout);
  }, [showToast, transcript]);

  const toggleListening = () => {
    if (listening) {
      setListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support the Web Speech API. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'kn-IN'; // Kannada
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setListening(true);
      setTranscript('ಆಲಿಸಲಾಗುತ್ತಿದೆ... (Listening...)');
      setShowToast(true);
    };

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript.trim().toLowerCase();
      setTranscript(`🗣️ ${text}`);
      setShowToast(true);
      processCommand(text);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setTranscript('ದೋಷ ಉಂಟಾಗಿದೆ (Error)');
      setShowToast(true);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
  };

  const processCommand = (text: string) => {
    // Navigation
    if (text.includes('ಡ್ಯಾಶ್ಬೋರ್ಡ್') || text.includes('dashboard')) {
      navigate('/dashboard');
    } else if (text.includes('ನಕ್ಷೆ') || text.includes('map')) {
      navigate('/map');
    } else if (text.includes('ಅಲಾರ್ಟ್') || text.includes('alert')) {
      navigate('/alerts');
    } else if (text.includes('ವರದಿ') || text.includes('report')) {
      navigate('/reports');
    } else if (text.includes('ನೆಟ್‌ವರ್ಕ್') || text.includes('network')) {
      navigate('/network');
    } 
    // Map Controls (Assuming we are on /map, calling imperative functions exposed on window)
    else if (text.includes('ಹಿಂದೆ') || text.includes('back')) {
      if ((window as any).__ccGoBack) (window as any).__ccGoBack();
    } else if (text.includes('ಮುಚ್ಚು') || text.includes('close')) {
      if ((window as any).__ccCloseDrawer) (window as any).__ccCloseDrawer();
    } else if (text.includes('ತೆರೆ') || text.includes('open')) {
      // Very basic entity extraction: "ಬೆಂಗಳೂರು ತೆರೆ" -> "ಬೆಂಗಳೂರು"
      const districtName = text.replace('ತೆರೆ', '').replace('open', '').trim();
      if ((window as any).__ccDrillToDistrict && districtName) {
        // Simple mapping for common districts if transliteration fails
        let englishTarget = districtName;
        if (districtName.includes('ಬೆಂಗಳೂರು')) englishTarget = 'Bengaluru';
        if (districtName.includes('ಮೈಸೂರು')) englishTarget = 'Mysuru';
        if (districtName.includes('ಹುಬ್ಬಳ್ಳಿ')) englishTarget = 'Hubballi';
        if (districtName.includes('ಕಲಬುರಗಿ')) englishTarget = 'Kalaburagi';
        if (districtName.includes('ಮಂಗಳೂರು')) englishTarget = 'Mangaluru';
        if (districtName.includes('ಬಳ್ಳಾರಿ')) englishTarget = 'Ballari';
        
        (window as any).__ccDrillToDistrict(englishTarget);
      }
    }
    // Language Toggle
    else if (text.includes('ಭಾಷೆ') || text.includes('language') || text.includes('english') || text.includes('ಕನ್ನಡ')) {
       i18n.changeLanguage(i18n.language === 'en' ? 'kn' : 'en');
    }
  };

  return (
    <>
      <button 
        className={`voice-fab ${listening ? 'listening' : ''}`}
        onClick={toggleListening}
        title="Kannada Voice Control"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="22"></line>
        </svg>
      </button>

      {showToast && (
        <div className="voice-toast">
          {transcript}
        </div>
      )}
    </>
  );
}
