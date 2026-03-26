export interface UserProfile {
  id: string;
  email: string;
  createdAt: string;
}

export interface VoiceSession {
  id: string;
  userId: string;
  mode: 'guided' | 'freeform';
  profileTarget: string;
  status: 'active' | 'ended' | 'processing' | 'completed';
  createdAt: string;
  endedAt?: string;
  transcripts?: TranscriptChunk[];
}

export interface TranscriptChunk {
  id?: string;
  sessionId: string;
  text: string;
  role: 'user' | 'model';
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface VoiceProfile {
  id: string;
  userId: string;
  name: string;
  profileJson: VoiceProfileData;
  createdAt: string;
  updatedAt?: string;
}

export interface VoiceProfileData {
  baseline_voice: {
    tone: string;
    sentence_style: string;
    cadence: {
      pause_frequency: string;
      speech_rate: string;
    };
    personality_prompt: string;
  };
  emotional_voice: {
    tone: string;
    personality_prompt: string;
  };
  casual_voice: {
    tone: string;
    personality_prompt: string;
  };
  compressed_voice: {
    tone: string;
    personality_prompt: string;
  };
  patterns: string[];
  anti_patterns: string[];
  signature_patterns: string[];
  fillers: string[];
  tone: string;
  sentence_style: string;
  cadence: {
    pause_frequency: string;
    speech_rate: string;
  };
  personality_prompt: string;
}

export interface AnalysisResult {
  linguistic: {
    avg_sentence_length: number;
    vocab_uniqueness: number;
    filler_words: string[];
  };
  prosodic: {
    speech_rate_wpm: number;
    avg_pause_ms: number;
  };
  behavioral: {
    assertiveness: number;
    formality: number;
  };
}

export interface ResponseState {
  response_length: number;
  sentence_count: number;
  avg_sentence_length: number;
  speech_rate: number;
  pause_density: number;
  emotional_intensity: number;
  formality_score: number;
  category: string;
  isTransformation?: boolean;
}

export interface VoiceScore {
  coverage: number;
  variability: number;
  consistency: number;
  depth: number;
  adaptability: number;
  finalScore: number;
}

export interface VoiceModel {
  baseline_voice: any;
  emotional_voice: any;
  casual_voice: any;
  compressed_voice: any;
  patterns: string[];
  anti_patterns: string[];
}

export interface AuthResponse {
  user_id: string;
  token: string;
}
