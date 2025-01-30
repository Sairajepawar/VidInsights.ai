const config = {
  apiBaseUrl: import.meta.env.DEV 
    ? 'http://localhost:8000' 
    : 'https://vidinsights-ai.onrender.com'
};

export default config;
