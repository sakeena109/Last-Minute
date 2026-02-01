
import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import { RevisionTime, RevisionResult, HistoryItem, MCQ, FileData, StudentProfile, LearningStyle } from './types';
import { generateRevision, askTutor } from './services/geminiService';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { auth } from './services/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  updateProfile, 
  sendEmailVerification,
  sendPasswordResetEmail,
  User
} from "firebase/auth";

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    mermaid: any;
    aistudio?: AIStudio;
  }
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

type AppView = 'home' | 'profile';

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const Mermaid: React.FC<{ chart: string }> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: true,
        theme: 'neutral',
        securityLevel: 'loose',
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      });
      ref.current.removeAttribute('data-processed');
      ref.current.innerHTML = chart;
      window.mermaid.contentLoaded();
    }
  }, [chart]);

  return (
    <div className="mermaid flex justify-center w-full p-6 overflow-x-auto bg-slate-50/50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800" ref={ref}>
      {chart}
    </div>
  );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showVerificationScreen, setShowVerificationScreen] = useState(false);
  const [showResetScreen, setShowResetScreen] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [resetEmail, setResetEmail] = useState('');
  const [signUpForm, setSignUpForm] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    confirmPassword: '',
    photo: null as File | null,
    photoPreview: null as string | null
  });

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authStep, setAuthStep] = useState('');
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    includeMCQs: true,
    includeMap: true,
    includeFormulas: true,
    inkSaver: false,
    includeHeader: true
  });
  
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('prepmaster_theme') === 'dark' || 
           (!('prepmaster_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [profile, setProfile] = useState<StudentProfile>(() => {
    const saved = localStorage.getItem('prepmaster_profile');
    return saved ? JSON.parse(saved) : {
      name: '',
      email: '',
      grade: 'Year 1',
      major: 'Undeclared',
      university: 'Global Institute of Technology',
      studentId: 'ID-882910',
      studyGoal: 'Top 1% Class Standing',
      avatarSeed: Math.random().toString(36).substring(7),
      joinedDate: new Date().toLocaleDateString(),
      preferredStudyTime: 'Morning',
      learningStyle: 'Reading/Writing',
      academicStrengths: 'Analytical Thinking, Speed Reading'
    };
  });

  const [content, setContent] = useState('');
  const [time, setTime] = useState<RevisionTime>(RevisionTime.FIVE_MINS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RevisionResult | null>(null);
  
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('prepmaster_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<FileData | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [tutorInput, setTutorInput] = useState('');
  const [isTutorThinking, setIsTutorThinking] = useState(false);

  // Dictation States
  const [isDictating, setIsDictating] = useState(false);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.emailVerified) {
        setIsAuthenticated(true);
        setProfile(prev => ({
          ...prev,
          name: user.displayName || prev.name || 'Student',
          email: user.email || prev.email,
          avatarSeed: user.photoURL || prev.avatarSeed
        }));
      } else {
        setIsAuthenticated(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTutorThinking]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('prepmaster_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('prepmaster_theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('prepmaster_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('prepmaster_history', JSON.stringify(history));
  }, [history]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthenticating(true);
    setAuthStep('Validating Credentials...');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
      if (!userCredential.user.emailVerified) {
        setAuthError("Email not verified. Please check your inbox.");
        setVerificationEmail(userCredential.user.email || loginForm.email);
        setShowVerificationScreen(true);
        await signOut(auth);
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      const errorCode = err.code;
      if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password' || errorCode === 'auth/user-not-found') {
        setAuthError("Invalid credentials. Please check your email and password.");
      } else if (errorCode === 'auth/too-many-requests') {
        setAuthError("Too many failed attempts. Please try again later.");
      } else if (errorCode === 'auth/network-request-failed') {
        setAuthError("Network error. Please check your connection.");
      } else {
        setAuthError("Authentication failed. Please try again.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (signUpForm.password !== signUpForm.confirmPassword) {
      setAuthError("Passwords do not match");
      return;
    }

    setIsAuthenticating(true);
    setAuthStep('Creating Account...');
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, signUpForm.email, signUpForm.password);
      await updateProfile(userCredential.user, {
        displayName: signUpForm.name,
        photoURL: signUpForm.photoPreview || ''
      });
      
      setAuthStep('Sending Verification Email...');
      await sendEmailVerification(userCredential.user);
      
      setVerificationEmail(signUpForm.email);
      setShowVerificationScreen(true);
      await signOut(auth);
    } catch (err: any) {
      console.error("SignUp Error:", err);
      const errCode = err.code || "";
      if (errCode === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists.');
      } else if (errCode === 'auth/weak-password') {
        setAuthError('Password is too weak. Use at least 6 characters.');
      } else if (errCode === 'auth/invalid-email') {
        setAuthError('The email address is invalid.');
      } else if (errCode === 'auth/network-request-failed') {
        setAuthError("Network error. Please check your connection.");
      } else {
        setAuthError("Failed to create account. Please try again.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthenticating(true);
    setAuthStep('Requesting Reset...');
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err: any) {
      console.error("Reset Password Error:", err);
      const errorCode = err.code;
      if (errorCode === 'auth/user-not-found' || errorCode === 'auth/invalid-email') {
        setAuthError("No user found with this email address.");
      } else if (errorCode === 'auth/network-request-failed') {
        setAuthError("Network error. Please check your connection.");
      } else {
        setAuthError("Could not send reset link. Please try again.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAuthenticated(false);
      setIsSignUp(false);
      setShowVerificationScreen(false);
      setShowResetScreen(false);
      setResetSent(false);
      setResult(null);
      setChatMessages([]);
      setCurrentView('home');
      stopDictation();
      setUploadedFile(null);
      setUserAnswers({});
      setError(null);
      setAuthError(null);
      setContent('');
      setLoginForm({ email: '', password: '' });
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSignUpForm(prev => ({ ...prev, photo: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignUpForm(prev => ({ ...prev, photoPreview: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const ensureApiKey = async () => {
    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
    }
  };

  const handleGenerate = async () => {
    if (!content.trim() && !uploadedFile) {
      setError("Input material is required for Blitz generation.");
      return;
    }

    await ensureApiKey();

    setLoading(true);
    setError(null);
    setUserAnswers({});
    setChatMessages([]);
    try {
      const revision = await generateRevision(content, time, profile, uploadedFile || undefined);
      setResult(revision);
      
      const titlePrefix = uploadedFile ? uploadedFile.name : (content.length > 30 ? content.slice(0, 30) + '...' : content);
      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        title: titlePrefix,
        result: revision,
        time: time
      };
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 15));
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found")) {
        window.aistudio?.openSelectKey();
      }
      setError("AI Engine encountered a bottleneck. Try a shorter snippet.");
    } finally {
      setLoading(false);
    }
  };

  const handleAskTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorInput.trim() || !result || isTutorThinking) return;

    const question = tutorInput;
    setTutorInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: question }]);
    setIsTutorThinking(true);

    try {
      const answer = await askTutor(question, content, result, chatMessages);
      setChatMessages(prev => [...prev, { role: 'model', text: answer }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', text: "Signal lost. Please re-query." }]);
    } finally {
      setIsTutorThinking(false);
    }
  };

  const startDictation = async () => {
    try {
      await ensureApiKey();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = inputAudioContext;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsDictating(true);
            const source = inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
          },
          onmessage: (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setContent((prev) => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + text);
            }
          },
          onerror: (e) => {
            console.error('Dictation error:', e);
            stopDictation();
          },
          onclose: () => {
            setIsDictating(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          systemInstruction: 'You are a transcription assistant. Only provide text transcriptions of the user input audio. Do not respond with audio yourself unless necessary to confirm operation.'
        }
      });

      liveSessionRef.current = sessionPromise;
    } catch (err) {
      console.error('Failed to start dictation:', err);
      setError('Microphone access or connection failed.');
    }
  };

  const stopDictation = () => {
    if (liveSessionRef.current) {
      liveSessionRef.current.then((session: any) => session.close());
      liveSessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsDictating(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setUploadedFile({ base64, mimeType: file.type, name: file.name });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const loadExample = () => {
    setContent("Quantum entanglement is a physical phenomenon that occurs when a group of particles are generated, interact, or share spatial proximity in a way such that the quantum state of each particle of the group cannot be described independently of the state of the others, including when the particles are separated by a large distance. The topic of quantum entanglement is at the heart of the disparity between classical and quantum physics: entanglement is a primary feature of quantum mechanics lacking in classical mechanics.");
    setTime(RevisionTime.FIVE_MINS);
  };

  const handleOptionSelect = (mcqIdx: number, optIdx: number) => {
    setUserAnswers(prev => ({ ...prev, [mcqIdx]: optIdx }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const handleDownload = (format: 'md' | 'txt') => {
    if (!result) return;
    const contentStr = constructMarkdown(result);
    const blob = new Blob([contentStr], { type: format === 'md' ? 'text/markdown' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Revision_${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportModalOpen(false);
  };

  const executePrint = () => {
    const b = document.body;
    if (!exportOptions.includeMCQs) b.classList.add('print-hide-mcqs');
    if (!exportOptions.includeMap) b.classList.add('print-hide-map');
    if (!exportOptions.includeFormulas) b.classList.add('print-hide-formulas');
    if (exportOptions.inkSaver) b.classList.add('print-ink-saver');
    
    setIsExportModalOpen(false);
    
    setTimeout(() => {
      window.print();
      b.classList.remove('print-hide-mcqs', 'print-hide-map', 'print-hide-formulas', 'print-ink-saver');
    }, 300);
  };

  const constructMarkdown = (res: RevisionResult): string => {
    let md = `# Academic Revision Report\n`;
    md += `**Student:** ${profile.name} (${profile.studentId})\n`;
    md += `**University:** ${profile.university}\n`;
    md += `**Date:** ${new Date().toLocaleString()}\n\n`;
    md += `## Revision Blitz\n${res.revisionNotes}\n\n`;
    md += `## Glossary\n`;
    res.definitions.forEach(d => { md += `* **${d.term}**: ${d.definition}\n`; });
    md += `\n## Formula Vault\n`;
    res.formulas.forEach(f => { md += `* \`${f}\`\n`; });
    md += `\n## Exam Strategy\n`;
    res.examTips.forEach((t, i) => { md += `${i+1}. ${t}\n`; });
    if (exportOptions.includeMCQs) {
      md += `\n## Practice Arena (MCQs)\n`;
      res.mcqs.forEach((m, i) => {
        md += `### Q${i+1}: ${m.question}\n`;
        m.options.forEach((o, j) => { md += `  ${j === m.correctAnswerIndex ? '* [x]' : '* [ ]'} ${o}\n`; });
        md += `\n**Explanation:** ${m.explanation}\n\n`;
      });
    }
    md += `\n---\nGenerated by LastMinute AI Assistant`;
    return md;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-md w-full animate-in fade-in zoom-in duration-700">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl p-10 rounded-[2.5rem] shadow-2xl border border-white dark:border-slate-800 relative overflow-hidden transition-all duration-500">
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
            
            {showVerificationScreen ? (
              <div className="relative z-10 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4">
                <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-8 shadow-inner">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-4">Check Your Inbox</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                  We have sent a verification email to <br/>
                  <span className="font-black text-indigo-600 dark:text-indigo-400">{verificationEmail}</span>. <br/>
                  Verify your account to access your revision suite.
                </p>
                <button 
                  onClick={() => { setShowVerificationScreen(false); setIsSignUp(false); setAuthError(null); }}
                  className="w-full py-5 bg-indigo-600 dark:bg-white dark:text-slate-900 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest text-xs transition-all"
                >
                  Return to Login
                </button>
              </div>
            ) : showResetScreen ? (
              <div className="relative z-10 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4">
                <div className="w-20 h-20 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400 mb-8 shadow-inner">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                
                {resetSent ? (
                  <>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-4">Reset Link Sent</h1>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                      We sent you a password change link to <br/>
                      <span className="font-black text-indigo-600 dark:text-indigo-400">{resetEmail}</span>.
                    </p>
                    <button 
                      onClick={() => { setShowResetScreen(false); setResetSent(false); setAuthError(null); }}
                      className="w-full py-5 bg-indigo-600 dark:bg-white dark:text-slate-900 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest text-xs transition-all"
                    >
                      Sign In
                    </button>
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-4">Reset Security Key</h1>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed mb-8">
                      Enter your email to receive a recovery link.
                    </p>
                    {authError && (
                      <div className="mb-6 p-4 w-full bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800 rounded-xl">
                        <p className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">{authError}</p>
                      </div>
                    )}
                    <form onSubmit={handleResetPassword} className="w-full space-y-5">
                      <input 
                        type="email" 
                        required 
                        placeholder="student@university.edu" 
                        value={resetEmail} 
                        onChange={(e) => setResetEmail(e.target.value)} 
                        className="w-full px-6 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 dark:text-white font-bold transition-all outline-none" 
                      />
                      <button 
                        type="submit" 
                        disabled={isAuthenticating} 
                        className="w-full py-5 bg-indigo-600 dark:bg-white dark:text-slate-900 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest text-xs"
                      >
                        {isAuthenticating ? authStep : "Get Reset Link"}
                      </button>
                      <button 
                        type="button"
                        onClick={() => { setShowResetScreen(false); setAuthError(null); }}
                        className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                      >
                        Return to login
                      </button>
                    </form>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center mb-8 relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-cyan-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/20 mb-6 group transition-all duration-500 hover:rotate-6">
                    <svg className="w-8 h-8 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight text-center">LastMinute</h1>
                  <p className="text-slate-400 dark:text-slate-500 mt-2 font-bold text-center text-[10px] uppercase tracking-[0.3em]">
                    {isSignUp ? "Create Academic Profile" : "Establish Secure Access"}
                  </p>
                </div>

                {authError && (
                  <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800 rounded-xl animate-in slide-in-from-top-2 text-center">
                    <p className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest leading-relaxed">
                      {authError}
                    </p>
                    {(authError.includes('already exists') || authError.includes('already-in-use')) && (
                       <button 
                         onClick={() => { setIsSignUp(false); setAuthError(null); }}
                         className="mt-3 text-[10px] font-black text-indigo-600 dark:text-indigo-400 underline uppercase tracking-widest hover:text-indigo-800 transition-colors"
                       >
                         Switch to Login
                       </button>
                    )}
                  </div>
                )}

                {!isSignUp ? (
                  <form onSubmit={handleLogin} className="space-y-5 relative z-10">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest ml-1">Academic Email</label>
                      <input 
                        type="email" 
                        required 
                        placeholder="student@university.edu" 
                        value={loginForm.email} 
                        onChange={(e) => setLoginForm({...loginForm, email: e.target.value})} 
                        className="w-full px-6 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 dark:text-white font-bold transition-all outline-none" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest ml-1 flex justify-between">
                        Security Key
                        <button 
                          type="button"
                          onClick={() => { setShowResetScreen(true); setResetEmail(loginForm.email); setAuthError(null); }}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline capitalize tracking-normal font-bold"
                        >
                          Forgot password?
                        </button>
                      </label>
                      <input 
                        type="password" 
                        required 
                        placeholder="••••••••" 
                        value={loginForm.password} 
                        onChange={(e) => setLoginForm({...loginForm, password: e.target.value})} 
                        className="w-full px-6 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 dark:text-white font-bold transition-all outline-none" 
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={isAuthenticating} 
                      className="w-full py-5 bg-indigo-600 dark:bg-white dark:text-slate-900 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                    >
                      {isAuthenticating ? authStep : "Connect"}
                    </button>
                    <div className="mt-8 text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Don't have an account?</p>
                      <button 
                        type="button" 
                        onClick={() => { setIsSignUp(true); setAuthError(null); }} 
                        className="w-full py-4 border-2 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-black rounded-2xl transition-all hover:bg-indigo-50 dark:hover:bg-indigo-900/10 uppercase tracking-widest text-[10px]"
                      >
                        Sign up
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSignUp} className="space-y-4 relative z-10">
                    <div className="flex justify-center mb-4">
                      <div 
                        onClick={() => photoInputRef.current?.click()}
                        className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-indigo-400 transition-all group"
                      >
                        {signUpForm.photoPreview ? (
                          <img src={signUpForm.photoPreview} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-2">
                            <svg className="w-6 h-6 mx-auto text-slate-400 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Avatar</span>
                          </div>
                        )}
                        <input type="file" ref={photoInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <input 
                        type="text" 
                        required 
                        placeholder="Full Academic Name" 
                        value={signUpForm.name} 
                        onChange={(e) => setSignUpForm({...signUpForm, name: e.target.value})} 
                        className="w-full px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 dark:text-white font-bold text-xs outline-none" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <input 
                        type="email" 
                        required 
                        placeholder="Official Email Address" 
                        value={signUpForm.email} 
                        onChange={(e) => setSignUpForm({...signUpForm, email: e.target.value})} 
                        className="w-full px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 dark:text-white font-bold text-xs outline-none" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input 
                        type="password" 
                        required 
                        placeholder="Access Key" 
                        value={signUpForm.password} 
                        onChange={(e) => setSignUpForm({...signUpForm, password: e.target.value})} 
                        className="w-full px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 dark:text-white font-bold text-xs outline-none" 
                      />
                      <input 
                        type="password" 
                        required 
                        placeholder="Repeat Key" 
                        value={signUpForm.confirmPassword} 
                        onChange={(e) => setSignUpForm({...signUpForm, confirmPassword: e.target.value})} 
                        className="w-full px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 dark:text-white font-bold text-xs outline-none" 
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={isAuthenticating} 
                      className="w-full py-4 bg-indigo-600 dark:bg-white dark:text-slate-900 text-white font-black rounded-xl transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest text-[10px]"
                    >
                      {isAuthenticating ? authStep : "Establish Profile"}
                    </button>
                    <div className="mt-6 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Already have an account?</p>
                      <button 
                        type="button" 
                        onClick={() => { setIsSignUp(false); setAuthError(null); }} 
                        className="text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-widest text-[10px] hover:underline"
                      >
                        Log in
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Header onLogout={handleLogout} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(!darkMode)} onOpenProfile={() => setCurrentView('profile')} userName={profile.name} />
      
      <div className="print-academic-header">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Academic Revision Blitz</h1>
            <p className="text-sm font-bold text-slate-500 uppercase">LastMinute AI Assistant • Internal Education Document</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm uppercase">{profile.name} ({profile.studentId})</p>
            <p className="text-xs text-slate-500 uppercase">{profile.university}</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase">Generated: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {currentView === 'home' ? (
          <div className="grid lg:grid-cols-12 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-4 flex flex-col gap-8 no-print">
              <section className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2rem] shadow-xl border border-white dark:border-slate-800 overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-indigo-600 via-cyan-500 to-indigo-600"></div>
                <div className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-extrabold flex items-center gap-3">Material</h2>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => isDictating ? stopDictation() : startDictation()} 
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-md ${isDictating ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'}`}
                        title={isDictating ? "Stop Dictation" : "Start Dictation"}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      </button>
                      <button onClick={loadExample} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white transition-all">Sample</button>
                      <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 hover:bg-cyan-600 hover:text-white transition-all">Upload</button>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      className="w-full h-80 p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border-none focus:ring-2 focus:ring-indigo-500/50 text-sm leading-relaxed placeholder:text-slate-400 dark:text-slate-200 transition-all outline-none"
                      placeholder={isDictating ? "Listening... start speaking your study material." : "Paste your notes or complex textbook chapters here..."}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                    {uploadedFile && (
                      <div className="absolute top-4 right-4 animate-in slide-in-from-right-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-[10px] font-black shadow-lg">
                          {uploadedFile.name.slice(0, 10)}...
                          <button onClick={() => setUploadedFile(null)} className="ml-1 text-white/50 hover:text-white">×</button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-8 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Blitz Intensity</p>
                    <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl gap-1">
                      <button onClick={() => setTime(RevisionTime.FIVE_MINS)} className={`py-3 rounded-xl text-[10px] font-black transition-all ${time === RevisionTime.FIVE_MINS ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>5M ULTRA</button>
                      <button onClick={() => setTime(RevisionTime.TEN_MINS)} className={`py-3 rounded-xl text-[10px] font-black transition-all ${time === RevisionTime.TEN_MINS ? 'bg-white dark:bg-slate-800 text-cyan-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>10M CORE</button>
                    </div>
                  </div>

                  <button onClick={handleGenerate} disabled={loading} className="w-full mt-10 py-5 bg-indigo-600 dark:bg-white dark:text-slate-900 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-4">
                    {loading ? <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100"></div><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200"></div></div> : <>EXECUTE BLITZ <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></>}
                  </button>
                </div>
              </section>

              <section className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl rounded-[2rem] border border-white dark:border-slate-800 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Library</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">{history.length}</span>
                </div>
                <div className="p-4 flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {history.map(item => (
                    <div key={item.id} className="group relative">
                      <button onClick={() => { setResult(item.result); setChatMessages([]); setUserAnswers({}); }} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${result === item.result ? 'bg-white dark:bg-slate-800 border-indigo-600 shadow-lg' : 'bg-transparent border-transparent hover:border-slate-200 dark:hover:border-slate-700'}`}>
                        <p className={`text-sm font-extrabold truncate ${result === item.result ? 'text-indigo-600' : 'text-slate-700 dark:text-slate-300'}`}>{item.title}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{item.time}</p>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="lg:col-span-8 print-full-width">
              {result ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                  <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white dark:border-slate-800 overflow-hidden relative card-break">
                    <div className="absolute top-0 right-0 p-8 no-print">
                      <button onClick={() => copyToClipboard(result.revisionNotes)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">Copy</button>
                    </div>
                    <div className="p-10">
                      <h3 className="text-2xl font-black mb-8 tracking-tight flex items-center gap-4"><span className="w-2 h-8 bg-indigo-600 rounded-full"></span>Revision Blitz</h3>
                      <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed">
                        {result.revisionNotes}
                      </div>
                    </div>
                  </div>

                  {result.flowchart && (
                    <div className="logic-map-section bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-white dark:border-slate-800 overflow-hidden card-break">
                      <div className="p-10">
                        <h3 className="text-sm font-black uppercase tracking-widest mb-8 text-slate-400">Conceptual Logic Map</h3>
                        <Mermaid chart={result.flowchart} />
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-xl border border-white dark:border-slate-800 card-break">
                      <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-3"><span className="w-4 h-1 bg-cyan-500 rounded-full"></span>Glossary</h3>
                      <div className="space-y-6">
                        {result.definitions.map((def, idx) => (
                          <div key={idx} className="group">
                            <span className="text-sm font-black group-hover:text-cyan-600 transition-colors">{def.term}</span>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{def.definition}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="formula-vault-section bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-xl border border-white dark:border-slate-800 card-break">
                      <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-3"><span className="w-4 h-1 bg-indigo-500 rounded-full"></span>Formula Vault</h3>
                      <div className="space-y-3">
                        {result.formulas.map((f, idx) => (
                          <div key={idx} className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl font-mono text-[11px] text-indigo-600 dark:text-indigo-400 border border-slate-100 dark:border-slate-800 text-center">{f}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-10 shadow-xl border border-white dark:border-slate-800 card-break">
                    <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-3"><span className="w-4 h-1 bg-amber-500 rounded-full"></span>Exam Strategy</h3>
                    <div className="grid sm:grid-cols-3 gap-6">
                      {result.examTips.map((tip, idx) => (
                        <div key={idx} className="relative p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 group">
                          <span className="absolute -top-3 -left-3 w-8 h-8 bg-white dark:bg-slate-900 border-2 border-amber-500 rounded-lg flex items-center justify-center text-[10px] font-black text-amber-600">{idx + 1}</span>
                          <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="practice-arena-section bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-white dark:border-slate-800 overflow-hidden card-break">
                    <div className="bg-indigo-600/5 dark:bg-indigo-500/5 px-10 py-8 border-b border-slate-100 dark:border-slate-800 no-print">
                      <h3 className="text-lg font-black flex items-center gap-4">Practice Arena</h3>
                    </div>
                    <div className="p-10 space-y-12">
                      {result.mcqs.map((item, mcqIdx) => {
                        const isSelected = userAnswers[mcqIdx] !== undefined;
                        const selectedOpt = userAnswers[mcqIdx];
                        const isCorrect = selectedOpt === item.correctAnswerIndex;
                        return (
                          <div key={mcqIdx} className="space-y-5 card-break">
                            <p className="text-lg font-black leading-snug">{item.question}</p>
                            <div className="grid md:grid-cols-2 gap-3 no-print">
                              {item.options.map((opt, optIdx) => (
                                <button key={optIdx} onClick={() => handleOptionSelect(mcqIdx, optIdx)} disabled={isSelected} className={`w-full text-left p-5 rounded-2xl border-2 font-bold transition-all ${!isSelected ? 'bg-slate-50 dark:bg-slate-950 border-transparent hover:border-indigo-400' : optIdx === item.correctAnswerIndex ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 text-emerald-700 dark:text-emerald-400' : selectedOpt === optIdx ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-500 text-rose-700 dark:text-rose-400' : 'opacity-40 grayscale'}`}>
                                  {opt}
                                </button>
                              ))}
                            </div>
                            {isSelected && !window.matchMedia('print').matches && (
                              <div className={`p-6 rounded-2xl animate-in zoom-in duration-300 ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-800'}`}>
                                <p className="text-sm font-medium leading-relaxed italic">{item.explanation}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-indigo-500/20 overflow-hidden no-print">
                    <div className="bg-indigo-600 px-10 py-6 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-white">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                        </div>
                        <div>
                          <h4 className="font-black uppercase tracking-widest text-xs">AI Tutor Support</h4>
                          <p className="text-[9px] font-bold opacity-70 uppercase">High Fidelity Reasoning Engine Active</p>
                        </div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                    </div>
                    
                    <div className="p-8 space-y-6 max-h-[500px] overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-950/50">
                      {chatMessages.length === 0 && (
                        <div className="text-center py-10">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Awaiting questions regarding your blitz...</p>
                        </div>
                      )}
                      {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                          <div className={`max-w-[85%] p-5 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white font-bold' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800'}`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                          </div>
                        </div>
                      ))}
                      {isTutorThinking && (
                        <div className="flex justify-start">
                          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex gap-1">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-100"></div>
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-200"></div>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    <form onSubmit={handleAskTutor} className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-4">
                      <input 
                        type="text" 
                        value={tutorInput}
                        onChange={(e) => setTutorInput(e.target.value)}
                        placeholder="Ask the Tutor about a specific term or concept..." 
                        className="flex-1 px-6 py-4 rounded-xl bg-slate-100 dark:bg-slate-800 border-none font-bold text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                      />
                      <button type="submit" disabled={isTutorThinking || !tutorInput.trim()} className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 disabled:opacity-50 transition-all">
                        Query
                      </button>
                    </form>
                  </div>

                  <div className="flex justify-center gap-4 no-print py-10">
                    <button onClick={() => setIsExportModalOpen(true)} className="px-10 py-5 bg-indigo-600 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-widest rounded-2xl shadow-2xl hover:scale-[1.05] transition-all flex items-center gap-3">
                      Export & Print Suite
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </button>
                    <button onClick={() => setCurrentView('profile')} className="px-10 py-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-100 dark:border-slate-800 text-xs font-black uppercase tracking-widest rounded-2xl shadow-sm hover:bg-slate-50 transition-all">
                      Go to Profile
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-16 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-[3rem] border-4 border-dashed border-slate-200 dark:border-slate-800">
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Awaiting Material</h3>
                  <p className="text-slate-400 max-w-xs mt-4 text-sm font-medium">Input study notes to generate a high-speed revision Blitz.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-right-8 duration-500">
            <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-cyan-500 h-48 relative">
                <button onClick={() => setCurrentView('home')} className="absolute top-8 left-8 flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-md text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/40 transition-all">
                  ← Back to Blitz
                </button>
                <div className="absolute -bottom-16 left-12 w-32 h-32 rounded-[2.5rem] bg-white dark:bg-slate-900 p-2 shadow-2xl">
                  <div className="w-full h-full rounded-[2rem] bg-gradient-to-tr from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center text-4xl font-black text-slate-400 overflow-hidden">
                    {profile.avatarSeed ? (
                      <img src={profile.avatarSeed} className="w-full h-full object-cover" />
                    ) : (
                      profile.name.charAt(0).toUpperCase()
                    )}
                  </div>
                </div>
              </div>
              
              <div className="pt-20 px-12 pb-12">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                  <div>
                    <h2 className="text-4xl font-black tracking-tighter">{profile.name}</h2>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Session Active • {profile.email}
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500 px-1">Academic Credentials</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">University</label>
                          <input type="text" value={profile.university} onChange={(e) => setProfile({...profile, university: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Student ID</label>
                          <input type="text" value={profile.studentId} onChange={(e) => setProfile({...profile, studentId: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500 px-1 text-xs">Learning DNA</h4>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Learning Style</label>
                          <select 
                            value={profile.learningStyle} 
                            onChange={(e) => setProfile({...profile, learningStyle: e.target.value as any})}
                            className="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all appearance-none"
                          >
                            <option value="Reading/Writing">Reading/Writing</option>
                            <option value="Visual">Visual</option>
                            <option value="Auditory">Auditory</option>
                            <option value="Kinesthetic">Kinesthetic</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Academic Strengths</label>
                          <textarea 
                            value={profile.academicStrengths} 
                            onChange={(e) => setProfile({...profile, academicStrengths: e.target.value})}
                            className="w-full px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all min-h-[100px]"
                            placeholder="e.g., Mathematics, Critical Thinking, Memorization..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800">
                      <h4 className="text-xl font-black mb-6">Learning Analytics</h4>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-500">Blitz Cycles Executed</span>
                          <span className="text-2xl font-black text-indigo-600">{history.length}</span>
                        </div>
                        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Current Goal</p>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{profile.studyGoal}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-12 flex flex-col sm:flex-row justify-center gap-4">
                  <button onClick={() => setCurrentView('home')} className="px-16 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-2xl shadow-indigo-600/20 uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all">Save & Finalize Profile</button>
                  <button onClick={handleLogout} className="px-16 py-5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-black rounded-2xl border border-red-100 dark:border-red-900/30 uppercase tracking-widest text-xs hover:bg-red-100 transition-all">Sign Out</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {isExportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-800 max-w-lg w-full overflow-hidden">
            <div className="p-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-black uppercase tracking-tighter">Export Options</h3>
                <button onClick={() => setIsExportModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 hover:text-slate-900">×</button>
              </div>

              <div className="space-y-4 mb-10">
                <label className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer group">
                  <input type="checkbox" checked={exportOptions.includeHeader} onChange={(e) => setExportOptions({...exportOptions, includeHeader: e.target.checked})} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div className="flex-1">
                    <p className="text-sm font-black uppercase tracking-widest group-hover:text-indigo-600">Include Academic Branding</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Adds name, ID, university, and date to PDF</p>
                  </div>
                </label>
                <label className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer group">
                  <input type="checkbox" checked={exportOptions.includeMCQs} onChange={(e) => setExportOptions({...exportOptions, includeMCQs: e.target.checked})} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div className="flex-1">
                    <p className="text-sm font-black uppercase tracking-widest group-hover:text-indigo-600">Export Practice Arena</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Includes all multiple choice questions</p>
                  </div>
                </label>
                <label className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer group">
                  <input type="checkbox" checked={exportOptions.inkSaver} onChange={(e) => setExportOptions({...exportOptions, inkSaver: e.target.checked})} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div className="flex-1">
                    <p className="text-sm font-black uppercase tracking-widest group-hover:text-indigo-600">Ink-Saver Mode</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Removes background colors and gradients</p>
                  </div>
                </label>
              </div>

              <div className="space-y-3">
                <button onClick={executePrint} className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Generate PDF Report
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => handleDownload('md')} className="py-4 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-black rounded-2xl uppercase tracking-widest text-[9px] hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                    Download .MD
                  </button>
                  <button onClick={() => handleDownload('txt')} className="py-4 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-black rounded-2xl uppercase tracking-widest text-[9px] hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                    Download .TXT
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-20 border-t border-slate-100 dark:border-slate-900 py-16 text-center no-print">
        <p className="text-slate-400 dark:text-slate-600 font-bold uppercase tracking-[0.3em] text-[10px] mb-4">LastMinute • End-to-End Secure Education</p>
        <p className="text-[9px] font-bold text-slate-300 dark:text-zinc-800 uppercase tracking-[0.5em]">© 2024 LastMinute AI Studio • Neural Engine v3.0</p>
      </footer>
    </div>
  );
};

export default App;
