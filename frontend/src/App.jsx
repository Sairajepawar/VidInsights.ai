import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Box, TextField, Button, Select, MenuItem, Typography, IconButton, Paper, Slider, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import config from './config';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';

const getTheme = (mode) => createTheme({
  palette: {
    mode,
    ...(mode === 'light' 
      ? {
          primary: {
            main: '#6EE7B7',
          },
          secondary: {
            main: '#3B82F6',
          },
          background: {
            default: '#F8FAFC',
            paper: 'rgba(255, 255, 255, 0.8)',
          },
          text: {
            primary: '#1E293B',
            secondary: '#64748B',
          },
        }
      : {
          primary: {
            main: '#6EE7B7',
          },
          secondary: {
            main: '#3B82F6',
          },
          background: {
            default: '#0F172A',
            paper: 'rgba(30, 41, 59, 0.7)',
          },
          text: {
            primary: '#F8FAFC',
            secondary: '#94A3B8',
          },
        }),
  },
  typography: {
    fontFamily: "'Inter', -apple-system, sans-serif",
    h4: {
      fontWeight: 700,
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backdropFilter: 'blur(12px)',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          padding: '2rem',
          '&:hover': {
            border: '1px solid rgba(148, 163, 184, 0.2)',
          },
          transition: 'all 0.2s ease-in-out',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          textTransform: 'none',
          fontWeight: 600,
          padding: '10px 20px',
          background: 'linear-gradient(135deg, #6EE7B7 0%, #3B82F6 100%)',
          color: mode === 'light' ? '#1E293B' : '#0F172A',
          '&:hover': {
            background: 'linear-gradient(135deg, #34D399 0%, #2563EB 100%)',
          },
          '&:disabled': {
            background: mode === 'light' ? '#E2E8F0' : '#334155',
            color: mode === 'light' ? '#94A3B8' : '#64748B',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '8px',
            '& fieldset': {
              borderColor: 'rgba(148, 163, 184, 0.2)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(148, 163, 184, 0.3)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#6EE7B7',
            },
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: '#6EE7B7',
          height: 8,
          '& .MuiSlider-track': {
            border: 'none',
          },
          '& .MuiSlider-thumb': {
            height: 24,
            width: 24,
            backgroundColor: '#fff',
            border: '2px solid currentColor',
            '&:focus, &:hover, &.Mui-active, &.Mui-focusVisible': {
              boxShadow: 'inherit',
            },
            '&:before': {
              display: 'none',
            },
          },
        },
      },
    },
  },
});

function App() {
  const [videoUrl, setVideoUrl] = useState('');
  const [question, setQuestion] = useState('');
  const [summary, setSummary] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('english');
  const [wordCount, setWordCount] = useState(250);
  const [style, setStyle] = useState('normal');
  const [isRecording, setIsRecording] = useState(false);
  const [mode, setMode] = useState(() => localStorage.getItem('theme') || 'dark');
  const [selectedQA, setSelectedQA] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioInstance, setAudioInstance] = useState(null);
  const [pausedTime, setPausedTime] = useState(0);
  const [qaHistory, setQaHistory] = useState(() => {
    const saved = localStorage.getItem('qaHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Save theme preference
  useEffect(() => {
    localStorage.setItem('theme', mode);
  }, [mode]);

  // Save QA history whenever it changes
  useEffect(() => {
    localStorage.setItem('qaHistory', JSON.stringify(qaHistory));
  }, [qaHistory]);

  // Text-to-Speech Function
  const languageMap = {
    english: 'en',
    hindi: 'hi',
    marathi: 'mr',
    gujarati: 'gu',
    bengali: 'bn',
    kannada: 'kn',
  };
  
  const speakText = async (text) => {
    try {
      const langCode = languageMap[language];
      
      const response = await axios.post(`${config.apiBaseUrl}/text-to-speech`, {
        text: text,
        lang: langCode
      });
  
      const audioContent = response.data.audioContent;
      const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
  
      // Store the audio instance
      setAudioInstance(audio);
      setPausedTime(0); // Reset paused time when starting new audio
  
      audio.play();
      setIsSpeaking(true);
  
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
    } catch (error) {
      console.error('Error playing speech:', error);
    }
  };
  
  const pauseSpeaking = () => {
    if (audioInstance) {
      setPausedTime(audioInstance.currentTime); // Save the paused time
      audioInstance.pause();
      setIsSpeaking(false);
    }
  };
  
  

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/m4a' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          try {
            const response = await axios.post(`${config.apiBaseUrl}/speech-to-text`, {
              audio_data: base64Audio,
              language: language
            });
            setQuestion(response.data.text);
          } catch (error) {
            console.error('Error transcribing speech:', error);
          }
        };
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${config.apiBaseUrl}/process-video`, {
        video_url: videoUrl,
        style: style,
        word_count: wordCount,
        language: language
      });
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  };

  const handleQuestion = async () => {
    if (!question.trim()) return;
    
    try {
      setLoading(true);
      const response = await axios.post(`${config.apiBaseUrl}/ask-question`, {
        video_url: videoUrl,
        question: question,
        language: language,
        question_type: 'text'
      });
      
      const newAnswer = response.data.answer;
      setAnswer(newAnswer);
      
      // Update history with new Q/A pair while keeping last 3
      setQaHistory(prevHistory => {
        const newHistory = [
          {
            question,
            answer: newAnswer,
            timestamp: new Date().toISOString(),
            videoUrl // Store video URL with each Q/A pair
          },
          ...prevHistory
        ].slice(0, 3);
        return newHistory;
      });
      
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const truncateAnswer = (answer, wordLimit = 15) => {
    const words = answer.split(' ');
    if (words.length <= wordLimit) return answer;
    return words.slice(0, wordLimit).join(' ') + '...';
  };

  const toggleMode = () => {
    setMode(prevMode => prevMode === 'light' ? 'dark' : 'light');
  };

  const clearHistory = () => {
    setQaHistory([]);
    localStorage.removeItem('qaHistory');
  };

  return (
    <ThemeProvider theme={getTheme(mode)}>
      <Box
        sx={{
          minHeight: '100vh',
          minWidth: '100vw',
          background: mode === 'light' 
            ? 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)'
            : 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          color: mode === 'light' ? '#1E293B' : 'white',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header with Theme Toggle */}
        <Box sx={{ 
          padding: '2rem',
          borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Typography 
            variant="h4" 
            sx={{ 
              background: 'linear-gradient(135deg, #6EE7B7 0%, #3B82F6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            VidInsights.ai
          </Typography>
          <IconButton onClick={toggleMode} color="inherit">
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Box>

        {/* Main Content */}
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: '350px 1fr',
          gap: '2rem',
          padding: '2rem',
          flex: 1,
          width: '100%',
        }}>
          {/* Left Panel */}
          <Box>
            <Paper elevation={0}>
              <Typography variant="h6" gutterBottom>
                Generate Summary
              </Typography>

              <form onSubmit={handleSubmit}>
                <TextField
                  fullWidth
                  label="YouTube Video URL"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  sx={{ marginBottom: 2 }}
                />

                <Select
                  fullWidth
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  sx={{ marginBottom: 2 }}
                >
                  <MenuItem value="english">English</MenuItem>
                  <MenuItem value="hindi">हिंदी (Hindi)</MenuItem>
                  <MenuItem value="marathi">मराठी (Marathi)</MenuItem>
                  <MenuItem value="gujarati">ગુજરાતી (Gujarati)</MenuItem>
                  <MenuItem value="bengali">বাংলা (Bengali)</MenuItem>
                  <MenuItem value="kannada">ಕನ್ನಡ (Kannada)</MenuItem>
                </Select>

                <Typography gutterBottom color="text.secondary">
                  Word Count: {wordCount}
                </Typography>
                <Slider
                  value={wordCount}
                  onChange={(e, newValue) => setWordCount(newValue)}
                  min={100}
                  max={500}
                  step={50}
                  sx={{ marginBottom: 2 }}
                />

                <Select
                  fullWidth
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  sx={{ marginBottom: 2 }}
                >
                  <MenuItem value="concise">Concise</MenuItem>
                  <MenuItem value="normal">Normal</MenuItem>
                  <MenuItem value="explanatory">Explanatory</MenuItem>
                </Select>

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                >
                  Generate Summary
                </Button>
              </form>
            </Paper>

            {/* Q/A History */}
            {qaHistory.length > 0 && (
              <Paper elevation={0} sx={{ 
                marginTop: 2,
                height: 'auto',
                maxHeight: '400px',
                overflow: 'hidden'
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: 2 
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <HistoryIcon color="primary" />
                    <Typography variant="h6">Recent Questions</Typography>
                  </Box>
                  <IconButton 
                    onClick={clearHistory} 
                    size="small"
                    sx={{ 
                      color: 'text.secondary',
                      '&:hover': {
                        color: 'error.main'
                      }
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box sx={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  maxHeight: '320px',
                  overflowY: 'auto',
                  pr: 1,
                  '&::-webkit-scrollbar': {
                    width: '8px',
                  },
                  '&::-webkit-scrollbar-track': {
                    background: 'transparent',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: 'rgba(148, 163, 184, 0.3)',
                    borderRadius: '4px',
                  },
                  '&::-webkit-scrollbar-thumb:hover': {
                    background: 'rgba(148, 163, 184, 0.5)',
                  },
                }}>
                  {qaHistory.map((item, index) => (
                    <Box 
                      key={index} 
                      onClick={() => setSelectedQA(item)}
                      sx={{ 
                        padding: 2,
                        borderRadius: 1,
                        bgcolor: 'background.paper',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease-in-out',
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          borderColor: 'primary.main',
                        },
                      }}
                    >
                      <Typography 
                        variant="subtitle2" 
                        color="primary" 
                        gutterBottom
                        sx={{ 
                          fontWeight: 600,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {item.question}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {truncateAnswer(item.answer)}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        color="text.secondary" 
                        sx={{ 
                          display: 'block', 
                          marginTop: 1,
                          fontSize: '0.7rem'
                        }}
                      >
                        {new Date(item.timestamp).toLocaleString()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            )}
          </Box>

          {/* Right Panel */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Summary Section */}
            <Paper elevation={0} sx={{ flex: 1 }}>
              <Typography variant="h6" gutterBottom>
                Summary
              </Typography>
              {summary ? (
                <Box>
                  <Typography sx={{ 
                    whiteSpace: 'pre-wrap',
                    color: 'text.primary',
                    lineHeight: 1.7
                  }}>
                    {summary}
                  </Typography>
                  {/* speaking button */}
                  <IconButton 
                    onClick={() => {
                      if (isSpeaking) {
                        pauseSpeaking();
                      } else {
                        speakText(summary); // or speakText(answer) depending on the context
                      }
                    }}
                    color="primary"
                    sx={{ mt: 1 }}
                  >
                    {isSpeaking ? <PauseIcon /> : <PlayArrowIcon />}
                  </IconButton>
                </Box>
              ) : (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '200px',
                  color: 'text.secondary',
                  textAlign: 'center'
                }}>
                  <Typography>
                    Enter a YouTube URL and click "Generate Summary" to see the results here.
                  </Typography>
                </Box>
              )}
            </Paper>

            {/* Q&A Section */}
            <Paper elevation={0}>
              <Typography variant="h6" gutterBottom>
                Ask a Question
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                <TextField
                  fullWidth
                  label="Your Question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <IconButton 
                  onClick={isRecording ? stopRecording : startRecording}
                  sx={{
                    color: isRecording ? '#EF4444' : '#6EE7B7',
                    '&:hover': {
                      color: isRecording ? '#DC2626' : '#34D399',
                    },
                    transition: 'color 0.2s ease-in-out'
                  }}
                >
                  {isRecording ? <StopIcon /> : <MicIcon />}
                </IconButton>
              </Box>
              <Button
                onClick={handleQuestion}
                variant="contained"
                fullWidth
                disabled={loading || !question.trim()}
              >
                Ask Question
              </Button>

              {answer && (
                <Box sx={{ marginTop: 4 }}>
                  <Typography variant="h6" gutterBottom>
                    Answer:
                  </Typography>
                  <Typography sx={{ 
                    whiteSpace: 'pre-wrap',
                    color: 'text.primary',
                    lineHeight: 1.7
                  }}>
                    {answer}
                  </Typography>
                  {/* speaking button */}
                  <IconButton 
                    onClick={() => {
                      if (isSpeaking) {
                        pauseSpeaking();
                      } else {
                        speakText(answer); // or speakText(answer) depending on the context
                      }
                    }}
                    color="primary"
                    sx={{ mt: 1 }}
                  >
                    {isSpeaking ? <PauseIcon /> : <PlayArrowIcon />}
                  </IconButton>
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>

      {/* Q/A Dialog */}
      <Dialog 
        open={Boolean(selectedQA)} 
        onClose={() => setSelectedQA(null)}
        maxWidth="sm"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: '16px',
            bgcolor: 'background.paper',
          }
        }}
      >
        {selectedQA && (
          <>
            <DialogTitle sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              pb: 1
            }}>
              <Typography variant="h6" component="div">
                Question & Answer
              </Typography>
              <IconButton 
                onClick={() => setSelectedQA(null)}
                size="small"
                sx={{ color: 'text.secondary' }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" color="primary" gutterBottom>
                  Question:
                </Typography>
                <Typography variant="body1" paragraph>
                  {selectedQA.question}
                </Typography>
                {/* speaking button */}
                <IconButton 
                  onClick={() => {
                    if (isSpeaking) {
                      pauseSpeaking();
                    } else {
                      speakText(selectedQA.question); // or speakText(answer) depending on the context
                    }
                  }}
                  color="primary"
                  sx={{ mt: 1 }}
                >
                  {isSpeaking ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
              </Box>
              <Box>
                <Typography variant="subtitle1" color="primary" gutterBottom>
                  Answer:
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {selectedQA.answer}
                </Typography>
                {/* speaking button */}
                <IconButton 
                  onClick={() => {
                    if (isSpeaking) {
                      pauseSpeaking();
                    } else {
                      speakText(selectedQA.answer); // or speakText(answer) depending on the context
                    }
                  }}
                  color="primary"
                  sx={{ mt: 1 }}
                >
                  {isSpeaking ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
              </Box>
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ display: 'block', mt: 2 }}
              >
                {new Date(selectedQA.timestamp).toLocaleString()}
              </Typography>
            </DialogContent>
          </>
        )}
      </Dialog>
    </ThemeProvider>
  );
}

export default App;