import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  StopCircle, 
  Settings, 
  User, 
  History, 
  Sparkles, 
  ChevronRight, 
  LogOut, 
  Plus, 
  Trash2, 
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  MessageSquare,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  orderBy,
  limit,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { VoiceSession, VoiceProfile, TranscriptChunk, VoiceProfileData, ResponseState, VoiceScore } from './types';
import { analyzeTranscripts, generateVoiceProfile, rewriteText, generateConversationResponse } from './services/geminiService';
import { PromptEngine } from './services/promptEngine';
import { VoiceIntelligenceService } from './services/voiceIntelligence';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger', size?: 'sm' | 'md' | 'lg' | 'icon' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-black text-white hover:bg-zinc-800',
      secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
      outline: 'border border-zinc-200 bg-transparent hover:bg-zinc-50',
      ghost: 'bg-transparent hover:bg-zinc-100',
      danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
    };
    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2',
      lg: 'px-6 py-3 text-lg font-medium',
      icon: 'p-2 flex items-center justify-center'
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn('bg-white border border-zinc-200 rounded-2xl overflow-hidden', className)}>
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [activeSession, setActiveSession] = useState<VoiceSession | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptChunk[]>([]);
  const [view, setView] = useState<'landing' | 'onboarding' | 'dashboard' | 'session' | 'profile'>('landing');
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [voiceGoal, setVoiceGoal] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<VoiceProfile | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [rewriteInput, setRewriteInput] = useState('');
  const [rewriteOutput, setRewriteOutput] = useState('');
  const [isRewriting, setIsRewriting] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('Tell me about your day.');
  const [currentCategory, setCurrentCategory] = useState('WARMUP');
  const [responseHistory, setResponseHistory] = useState<ResponseState[]>([]);
  const [voiceScore, setVoiceScore] = useState<VoiceScore>({
    coverage: 0,
    variability: 0,
    consistency: 0,
    depth: 0,
    adaptability: 0,
    finalScore: 0
  });
  const [userInput, setUserInput] = useState('');
  const promptEngine = useRef(new PromptEngine());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Only sync to Firestore for real Firebase users, not local guests
        if (!u.uid.startsWith('guest-')) {
          const userRef = doc(db, 'users', u.uid);
          setDoc(userRef, {
            email: u.email,
            createdAt: new Date().toISOString()
          }, { merge: true }).catch(e => console.warn('User sync error:', e));
        }
        setView('dashboard');
      } else {
        setView('landing');
      }
    });
    return () => unsubscribe();
  }, []);

  // Helper to check if this is a real Firebase user (not our local guest fallback)
  const isRealFirebaseUser = (u: FirebaseUser | null): boolean => {
    return !!u && !u.uid.startsWith('guest-');
  };

  useEffect(() => {
    if (!user || !isRealFirebaseUser(user)) return;

    const profilesQuery = query(collection(db, 'profiles'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeProfiles = onSnapshot(profilesQuery, (snapshot) => {
      setProfiles(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as VoiceProfile)));
    }, (e) => console.warn('Profiles query error (expected for guests):', e));

    const sessionsQuery = query(collection(db, 'sessions'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as VoiceSession)));
    }, (e) => console.warn('Sessions query error (expected for guests):', e));

    return () => {
      unsubscribeProfiles();
      unsubscribeSessions();
    };
  }, [user]);

  useEffect(() => {
    if (!activeSession) return;
    const transcriptsQuery = query(collection(db, `sessions/${activeSession.id}/transcripts`), orderBy('startTime', 'asc'));
    const unsubscribeTranscripts = onSnapshot(transcriptsQuery, (snapshot) => {
      setTranscripts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TranscriptChunk)));
    }, (e) => handleFirestoreError(e, OperationType.LIST, `sessions/${activeSession.id}/transcripts`));
    return () => unsubscribeTranscripts();
  }, [activeSession]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      // If popup blocked or unauthorized domain, try redirect
      if (error?.code === 'auth/unauthorized-domain' || error?.code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectError) {
          console.error('Redirect login also failed', redirectError);
        }
      } else {
        console.error('Login failed', error);
      }
    }
  };

  const handleGuestLogin = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Anonymous auth failed, using local guest mode', error);
      // Create a fake local user object so the app still works
      const guestUser = {
        uid: 'guest-' + Date.now(),
        email: 'guest@voicemirror.demo',
        displayName: 'Guest User',
        isAnonymous: true,
      } as unknown as FirebaseUser;
      setUser(guestUser);
      setView('dashboard');
    }
  };

  const handleLogout = () => {
    if (user?.uid?.startsWith('guest-')) {
      setUser(null);
      setView('landing');
      setProfiles([]);
      setSessions([]);
      return;
    }
    signOut(auth);
  };

  const isGuest = user?.uid?.startsWith('guest-') || false;

  const startSession = async (mode: 'guided' | 'freeform') => {
    if (!user) return;
    try {
      const sessionData = {
        userId: user.uid,
        mode,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      let sessionId: string;
      if (isGuest) {
        sessionId = 'local-' + Date.now();
      } else {
        const docRef = await addDoc(collection(db, 'sessions'), sessionData);
        sessionId = docRef.id;
      }

      setActiveSession({ id: sessionId, ...sessionData } as VoiceSession);
      setTranscripts([]);
      setResponseHistory([]);
      setVoiceScore({ coverage: 0, variability: 0, consistency: 0, depth: 0, adaptability: 0, finalScore: 0 });
      promptEngine.current = new PromptEngine();

      const firstPrompt = promptEngine.current.getNextPrompt([], { coverage: 0, variability: 0, consistency: 0, depth: 0, adaptability: 0, finalScore: 0 });
      setCurrentPrompt(firstPrompt.prompt);
      setCurrentCategory(firstPrompt.category);

      setView('session');
      setIsRecording(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sessions');
    }
  };

  const endSession = async () => {
    if (!activeSession) return;
    setIsRecording(false);
    try {
      if (!isGuest) {
        const sessionRef = doc(db, 'sessions', activeSession.id);
        await updateDoc(sessionRef, {
          status: 'processing',
          endedAt: new Date().toISOString()
        });
      }

      // Trigger analysis (works for both guests and real users - Gemini API call)
      const analysis = await analyzeTranscripts(transcripts);
      const profileData = await generateVoiceProfile(analysis);

      let profileId: string;
      if (isGuest) {
        profileId = 'local-profile-' + Date.now();
      } else {
        const profileRef = await addDoc(collection(db, 'profiles'), {
          userId: user?.uid,
          name: `Voice Profile ${profiles.length + 1}`,
          profileJson: profileData,
          createdAt: new Date().toISOString()
        });
        profileId = profileRef.id;

        const sessionRef = doc(db, 'sessions', activeSession.id);
        await updateDoc(sessionRef, { status: 'completed' });
      }

      const newProfile = {
        id: profileId,
        userId: user?.uid || '',
        name: `Voice Profile ${profiles.length + 1}`,
        profileJson: profileData,
        createdAt: new Date().toISOString()
      };

      // For guests, also add to local profiles state
      if (isGuest) {
        setProfiles(prev => [newProfile, ...prev]);
      }

      setSelectedProfile(newProfile);
      setView('profile');
      setActiveSession(null);
    } catch (error) {
      console.error('Session end failed', error);
    }
  };

  const handleRewrite = async () => {
    if (!selectedProfile || !rewriteInput) return;
    setIsRewriting(true);
    try {
      const result = await rewriteText(selectedProfile.profileJson, rewriteInput);
      setRewriteOutput(result);
    } catch (error) {
      console.error('Rewrite failed', error);
    } finally {
      setIsRewriting(false);
    }
  };

  const deleteProfile = async (id: string) => {
    try {
      if (isGuest) {
        setProfiles(prev => prev.filter(p => p.id !== id));
      } else {
        await deleteDoc(doc(db, 'profiles', id));
      }
      if (selectedProfile?.id === id) {
        setSelectedProfile(null);
        setView('dashboard');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'profiles');
    }
  };

  const handleUserSpeech = async (text: string) => {
    if (!activeSession || !text.trim()) return;

    try {
      const userTranscript: TranscriptChunk = {
        id: 'local-' + Date.now(),
        sessionId: activeSession.id,
        text,
        role: 'user',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        confidence: 1.0
      } as TranscriptChunk;

      // 1. Save user transcript
      if (isGuest) {
        setTranscripts(prev => [...prev, userTranscript]);
      } else {
        await addDoc(collection(db, `sessions/${activeSession.id}/transcripts`), {
          sessionId: activeSession.id,
          text,
          role: 'user',
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          confidence: 1.0
        });
      }

      // 2. Analyze response and update score
      const responseState = VoiceIntelligenceService.analyzeResponse(text, currentCategory, currentCategory === "TRANSFORMATION");

      let updatedHistory: ResponseState[] = [];
      setResponseHistory(prev => {
        updatedHistory = [...prev, responseState];
        const newScore = VoiceIntelligenceService.calculateVoiceScore(updatedHistory);
        setVoiceScore(newScore);
        return updatedHistory;
      });

      // 3. Get AI response using Gemini
      setIsThinking(true);

      // Build conversation history from local state or Firestore
      let history: { role: 'user' | 'model'; text: string }[];
      if (isGuest) {
        history = [...transcripts, userTranscript].map(t => ({
          role: (t as any).role === 'user' ? 'user' : 'model' as 'user' | 'model',
          text: t.text
        }));
      } else {
        const historyQuery = query(collection(db, `sessions/${activeSession.id}/transcripts`), orderBy('startTime', 'asc'));
        const historySnapshot = await getDocs(historyQuery);
        history = historySnapshot.docs.map(d => ({
          role: d.data().role === 'user' ? 'user' : 'model' as 'user' | 'model',
          text: d.data().text
        }));
      }

      const aiResponse = await generateConversationResponse(history, currentPrompt, voiceScore);

      // 4. Save AI transcript
      if (isGuest) {
        setTranscripts(prev => [...prev, {
          id: 'local-ai-' + Date.now(),
          sessionId: activeSession.id,
          text: aiResponse,
          role: 'model',
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          confidence: 1.0
        } as TranscriptChunk]);
      } else {
        await addDoc(collection(db, `sessions/${activeSession.id}/transcripts`), {
          sessionId: activeSession.id,
          text: aiResponse,
          role: 'model',
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          confidence: 1.0
        });
      }

      // 5. Update prompt if needed
      if (updatedHistory.length % 3 === 0) {
        const nextPrompt = promptEngine.current.getNextPrompt(updatedHistory, voiceScore);
        setCurrentPrompt(nextPrompt.prompt);
        setCurrentCategory(nextPrompt.category);
      }

    } catch (error) {
      console.error('Conversation failed', error);
    } finally {
      setIsThinking(false);
      setUserInput('');
    }
  };

  // --- Speech Recognition Setup ---
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      handleUserSpeech(text);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
    };

    recognition.start();
  };

  // --- Remove Mock Transcription ---

  const renderOnboarding = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl mx-auto space-y-8 py-12"
    >
      {onboardingStep === 1 && (
        <Card className="p-8 space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-3xl font-bold">Microphone Access</h2>
            <p className="text-zinc-500">We analyze your speech patterns, not just words. This requires microphone access.</p>
          </div>
          <Button className="w-full" size="lg" onClick={() => setOnboardingStep(2)}>
            Enable mic & continue
          </Button>
        </Card>
      )}

      {onboardingStep === 2 && (
        <Card className="p-8 space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-3xl font-bold">Select Your Voice Goal</h2>
            <p className="text-zinc-500">What kind of communication style are we capturing today?</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {['Default', 'Work', 'Casual', 'Custom'].map(goal => (
              <button 
                key={goal}
                onClick={() => { setVoiceGoal(goal); setOnboardingStep(3); }}
                className="p-6 border border-zinc-200 rounded-2xl hover:border-black transition-all text-left"
              >
                <h3 className="font-bold">{goal} Voice</h3>
                <p className="text-xs text-zinc-500">Capture your {goal.toLowerCase()} persona.</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {onboardingStep === 3 && (
        <Card className="p-8 space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-3xl font-bold">Quick Calibration</h2>
            <p className="text-zinc-500">Just talk for a few seconds so I can tune things.</p>
          </div>
          <div className="bg-zinc-50 p-6 rounded-2xl text-center italic text-xl">
            "What did you do yesterday?"
          </div>
          <Button className="w-full" size="lg" onClick={() => startSession('guided')}>
            Start Calibration
          </Button>
        </Card>
      )}
    </motion.div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
      </div>
    );
  }

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-black text-white mb-4">
              <Sparkles size={32} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">VoiceMirror</h1>
            <p className="text-zinc-500 text-lg">
              Your unique communication style, captured and mirrored for the AI era.
            </p>
          </div>
          
          <Card className="p-8 space-y-6">
            <div className="space-y-4 text-left">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                  <Mic size={16} />
                </div>
                <div>
                  <h3 className="font-medium">Capture your voice</h3>
                  <p className="text-sm text-zinc-500">Guided sessions to learn your tone, cadence, and phrasing.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="font-medium">AI Personality Layer</h3>
                  <p className="text-sm text-zinc-500">Generate structured profiles for Claude, OpenAI, and more.</p>
                </div>
              </div>
            </div>
            
            <Button onClick={handleLogin} className="w-full" size="lg">
              Continue with Google
            </Button>
            <div className="relative flex items-center justify-center">
              <div className="border-t border-zinc-200 w-full"></div>
              <span className="bg-white px-3 text-xs text-zinc-400 absolute">or</span>
            </div>
            <Button onClick={handleGuestLogin} variant="outline" className="w-full" size="lg">
              Try as Guest
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (view === 'onboarding') {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200">
          <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <span className="font-bold text-xl tracking-tight">VoiceMirror</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut size={16} />
            </Button>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-12">
          {renderOnboarding()}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer" 
            onClick={() => { setView('dashboard'); setSelectedProfile(null); }}
          >
            <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <span className="font-bold text-xl tracking-tight">VoiceMirror</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 text-sm font-medium">
              <User size={14} />
              <span>{user?.displayName}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-12"
            >
              <div className="flex items-end justify-between">
                <div className="space-y-1">
                  <h2 className="text-3xl font-bold tracking-tight">Your Voice Profiles</h2>
                  <p className="text-zinc-500">Manage and refine your AI communication layers.</p>
                </div>
                <Button onClick={() => startSession('guided')} className="gap-2">
                  <Plus size={18} />
                  New Session
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profiles.map((profile) => (
                  <Card key={profile.id} className="group hover:border-zinc-400 transition-all cursor-pointer" >
                    <div className="p-6 space-y-4" onClick={() => { setSelectedProfile(profile); setView('profile'); }}>
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors">
                          <Mic size={20} />
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-zinc-400 hover:text-red-600"
                          onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{profile.name}</h3>
                        <p className="text-sm text-zinc-500 line-clamp-2">{profile.profileJson.tone}</p>
                      </div>
                      <div className="pt-4 flex items-center justify-between text-xs text-zinc-400 font-medium uppercase tracking-wider">
                        <span>{new Date(profile.createdAt).toLocaleDateString()}</span>
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  </Card>
                ))}
                
                {profiles.length === 0 && (
                  <div className="col-span-full py-20 text-center space-y-4 border-2 border-dashed border-zinc-200 rounded-3xl">
                    <div className="mx-auto w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                      <Mic size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">No voice profiles yet</p>
                      <p className="text-sm text-zinc-500">Start a session to capture your unique style.</p>
                    </div>
                    <Button variant="outline" onClick={() => startSession('guided')}>
                      Start First Session
                    </Button>
                  </div>
                )}
              </div>

              {sessions.length > 0 && (
                <div className="space-y-6 pt-12">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <History size={18} />
                    <h3 className="font-bold uppercase tracking-widest text-xs">Recent Sessions</h3>
                  </div>
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div key={session.id} className="flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-xl">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            session.status === 'completed' ? 'bg-green-500' : 'bg-zinc-300'
                          )} />
                          <div>
                            <p className="font-medium capitalize">{session.mode} Session</p>
                            <p className="text-xs text-zinc-400">{new Date(session.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "text-xs font-bold uppercase px-2 py-1 rounded-md",
                            session.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-zinc-100 text-zinc-500'
                          )}>
                            {session.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'session' && activeSession && (
            <motion.div 
              key="session"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="flex flex-col items-center gap-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 text-red-600 font-bold text-sm animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-red-600" />
                    LIVE RECORDING
                  </div>
                  
                  <div className="w-full max-w-xs space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      <span>Voice Confidence</span>
                      <span>{Math.round(voiceScore.finalScore * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${voiceScore.finalScore * 100}%` }}
                        className="h-full bg-black"
                      />
                    </div>
                  </div>
                </div>
                <h2 className="text-4xl font-bold tracking-tight">Guided Voice Capture</h2>
                <p className="text-zinc-500">Speak naturally. We're listening for your unique rhythm and tone.</p>
              </div>

              <Card className="p-8 min-h-[500px] flex flex-col">
                <div className="flex-1 overflow-y-auto space-y-6 pb-6">
                  {transcripts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-zinc-400">
                      <Mic size={48} className="animate-bounce" />
                      <p>Start by saying something or typing below.</p>
                      <div className="p-4 bg-zinc-50 rounded-xl text-sm text-zinc-500 max-w-xs">
                        {currentPrompt}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {transcripts.map((t, i) => (
                        <motion.div 
                          key={t.id || i}
                          initial={{ opacity: 0, x: t.role === 'user' ? 20 : -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cn(
                            "flex flex-col max-w-[80%]",
                            t.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                          )}
                        >
                          <div className={cn(
                            "p-4 rounded-2xl text-lg",
                            t.role === 'user' ? "bg-zinc-900 text-white rounded-tr-none" : "bg-zinc-100 text-zinc-900 rounded-tl-none"
                          )}>
                            {t.text}
                          </div>
                          <span className="text-[10px] uppercase tracking-widest text-zinc-400 mt-1">
                            {t.role === 'user' ? 'You' : 'VoiceMirror'}
                          </span>
                        </motion.div>
                      ))}
                      {isThinking && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-2 text-zinc-400"
                        >
                          <div className="flex gap-1">
                            {[1, 2, 3].map(i => (
                              <motion.div 
                                key={i}
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.2 }}
                                className="w-1.5 h-1.5 bg-zinc-300 rounded-full"
                              />
                            ))}
                          </div>
                          <span className="text-xs font-medium italic">VoiceMirror is thinking...</span>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-zinc-100 space-y-4">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUserSpeech(userInput)}
                      placeholder="Type your response..."
                      className="flex-1 bg-zinc-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-black transition-all"
                      disabled={isThinking}
                    />
                    <Button 
                      size="icon" 
                      className="rounded-xl h-12 w-12"
                      onClick={() => handleUserSpeech(userInput)}
                      disabled={isThinking || !userInput.trim()}
                    >
                      <Send size={18} />
                    </Button>
                    <Button 
                      variant="outline"
                      size="icon" 
                      className="rounded-xl h-12 w-12"
                      onClick={startListening}
                      disabled={isThinking}
                    >
                      <Mic size={18} />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-zinc-500">
                      <span className="text-xs font-medium uppercase tracking-widest">{transcripts.length} segments captured</span>
                    </div>
                    <Button variant="danger" size="sm" className="gap-2" onClick={endSession}>
                      <StopCircle size={16} />
                      End & Analyze
                    </Button>
                  </div>
                </div>
              </Card>

              <div className="bg-zinc-900 text-white p-6 rounded-3xl space-y-2">
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Current Prompt</p>
                <p className="text-xl font-medium italic">"{currentPrompt}"</p>
              </div>
            </motion.div>
          )}

          {view === 'profile' && selectedProfile && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-4xl font-bold tracking-tight">{selectedProfile.name}</h2>
                    <p className="text-zinc-500">Generated on {new Date(selectedProfile.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download size={16} />
                      Export
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-6 space-y-4">
                    <h4 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Tone & Style</h4>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-zinc-400 mb-1">Dominant Tone</p>
                        <p className="font-medium text-lg capitalize">{selectedProfile.profileJson.tone}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 mb-1">Sentence Structure</p>
                        <p className="text-zinc-600">{selectedProfile.profileJson.sentence_style}</p>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6 space-y-4">
                    <h4 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Cadence</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-500">Speech Rate</span>
                        <span className="font-bold">{selectedProfile.profileJson.cadence.speech_rate}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-500">Pause Frequency</span>
                        <span className="font-bold">{selectedProfile.profileJson.cadence.pause_frequency}</span>
                      </div>
                    </div>
                  </Card>
                </div>

                <Card className="p-6 space-y-4">
                  <h4 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Signature Patterns</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.profileJson.signature_patterns.map((p, i) => (
                      <span key={i} className="px-3 py-1.5 bg-zinc-100 rounded-full text-sm font-medium">
                        {p}
                      </span>
                    ))}
                  </div>
                </Card>

                <Card className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm uppercase tracking-widest text-zinc-400">System Prompt</h4>
                    <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(selectedProfile.profileJson.personality_prompt)}>
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-zinc-50 p-4 rounded-xl text-xs font-mono text-zinc-600 whitespace-pre-wrap border border-zinc-100">
                    {selectedProfile.profileJson.personality_prompt}
                  </pre>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="p-6 bg-black text-white space-y-6 sticky top-24">
                  <div className="flex items-center gap-2">
                    <Sparkles size={20} className="text-zinc-400" />
                    <h3 className="font-bold text-lg">Test Your Voice</h3>
                  </div>
                  <p className="text-zinc-400 text-sm">
                    Enter any text and see how VoiceMirror rewrites it in your unique style.
                  </p>
                  
                  <div className="space-y-4">
                    <textarea 
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-700 min-h-[120px]"
                      placeholder="e.g. Explain quantum computing simply."
                      value={rewriteInput}
                      onChange={(e) => setRewriteInput(e.target.value)}
                    />
                    <Button 
                      className="w-full bg-white text-black hover:bg-zinc-200" 
                      onClick={handleRewrite}
                      disabled={isRewriting || !rewriteInput}
                    >
                      {isRewriting ? 'Mirroring...' : 'Rewrite in My Voice'}
                    </Button>
                  </div>

                  <AnimatePresence>
                    {rewriteOutput && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pt-6 border-t border-zinc-800 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Result</span>
                          <MessageSquare size={14} className="text-zinc-500" />
                        </div>
                        <p className="text-sm leading-relaxed italic text-zinc-200">
                          "{rewriteOutput}"
                        </p>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={() => setRewriteOutput('')}>
                            Clear
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-zinc-200 text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-zinc-400">
          <Sparkles size={16} />
          <span className="font-bold text-sm tracking-tight">VoiceMirror</span>
        </div>
        <p className="text-xs text-zinc-400">
          Built with Gemini 3.1 Pro & Firebase. All voice data is encrypted and user-owned.
        </p>
      </footer>
    </div>
  );
}
