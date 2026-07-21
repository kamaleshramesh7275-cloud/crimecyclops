import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      dashboard: 'Dashboard',
      public: 'Public Safety',
      network: 'Network Analysis',
      alerts: 'Alerts Feed',
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
      language: 'Language',
      logout: 'Log Out',
      welcome: 'Welcome to CrimeCyclops',
      search: 'Search...',
      cases: 'Total FIR Cases',
      districts: 'Districts',
      stations: 'Police Stations',
      openCases: 'Active Investigations',
      similarCases: 'Similar Cases',
      workload: 'Workload',
      status: 'Status',
    },
  },
  kn: {
    translation: {
      dashboard: 'ಡ್ಯಾಶ್ಬೋರ್ಡ್',
      public: 'ಸಾರ್ವಜನಿಕ ಸುರಕ್ಷತೆ',
      network: 'ಜಾಲ ವಿಶ್ಲೇಷಣೆ',
      alerts: 'ಅಲಾರ್ಟ್‌ಗಳ ಫೀಡ್',
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
      language: 'ಭಾಷೆ',
      logout: 'ನಿರ್ಗಮಿಸಿ',
      welcome: 'ಅಪರಾಧ ಸೈಕ್ಲೋಪ್ಸ್ ಗೆ ಸುಸ್ವಾಗತ',
      search: 'ಹುಡುಕಿ...',
      cases: 'ಒಟ್ಟು ಎಫ್ಐಆರ್ ಪ್ರಕರಣಗಳು',
      districts: 'ಜಿಲ್ಲೆಗಳು',
      stations: 'ಪೊಲೀಸ್ ಠಾಣೆಗಳು',
      openCases: 'ಸಕ್ರಿಯ ಪ್ರಕರಣಗಳು',
      similarCases: 'ಸದೃಶ ಪ್ರಕರಣಗಳು',
      workload: 'ಕಾರ್ಯಭಾರ',
      status: 'ಸ್ಥಿತಿ',
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
