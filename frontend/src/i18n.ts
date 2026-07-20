import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      dashboard: 'Dashboard',
      public: 'Public Safety',
      network: 'Network',
      alerts: 'Alerts',
      overview: 'Overview',
      hotspots: 'Hotspots',
      trends: 'Trend View',
      admin: 'Admin Intelligence',
      map: 'Map Analysis',
      crimeIntensity: 'Crime Intensity',
      veryHigh: 'Very High',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      veryLow: 'Very Low',
    },
  },
  kn: {
    translation: {
      dashboard: 'ಡ್ಯಾಶ್ಬೋರ್ಡ್',
      public: 'ಸಾರ್ವಜನಿಕ ಸುರಕ್ಷತೆ',
      network: 'ನೆಟ್ವರ್ಕ್',
      alerts: 'ಅಲಾರ್ಟ್‌ಗಳು',
      overview: 'ಒಂದು ನೋಟ',
      hotspots: 'ಹಾಟ್ ಸ್ಪಾಟ್‌ಗಳು',
      trends: 'ಪ್ರವೃತ್ತಿ ನೋಟ',
      admin: 'ಅಡ್ಮಿನ್ ಇಂಟೆಲಿಜೆನ್ಸ್',
      map: 'ನಕ್ಷೆ ವಿಶ್ಲೇಷಣೆ',
      crimeIntensity: 'ಅಪರಾಧ ತೀವ್ರತೆ',
      veryHigh: 'ಅತಿ ಹೆಚ್ಚು',
      high: 'ಹೆಚ್ಚು',
      medium: 'ಮಧ್ಯಮ',
      low: 'ಕಡಿಮೆ',
      veryLow: 'ಅತಿ ಕಡಿಮೆ',
    },
  },
};

i18next.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18next;
