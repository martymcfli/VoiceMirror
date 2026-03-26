import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, VoiceProfileData, TranscriptChunk, VoiceScore } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeTranscripts(transcripts: TranscriptChunk[]): Promise<AnalysisResult> {
  const fullText = transcripts.map(t => t.text).join(" ");
  
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `Analyze the following transcript for communication style features. 
    Return a JSON object matching the AnalysisResult schema.
    
    Transcript:
    ${fullText}
    
    Schema:
    {
      "linguistic": {
        "avg_sentence_length": number,
        "vocab_uniqueness": number (0-1),
        "filler_words": string[]
      },
      "prosodic": {
        "speech_rate_wpm": number,
        "avg_pause_ms": number
      },
      "behavioral": {
        "assertiveness": number (0-1),
        "formality": number (0-1)
      }
    }`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          linguistic: {
            type: Type.OBJECT,
            properties: {
              avg_sentence_length: { type: Type.NUMBER },
              vocab_uniqueness: { type: Type.NUMBER },
              filler_words: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["avg_sentence_length", "vocab_uniqueness", "filler_words"]
          },
          prosodic: {
            type: Type.OBJECT,
            properties: {
              speech_rate_wpm: { type: Type.NUMBER },
              avg_pause_ms: { type: Type.NUMBER }
            },
            required: ["speech_rate_wpm", "avg_pause_ms"]
          },
          behavioral: {
            type: Type.OBJECT,
            properties: {
              assertiveness: { type: Type.NUMBER },
              formality: { type: Type.NUMBER }
            },
            required: ["assertiveness", "formality"]
          }
        },
        required: ["linguistic", "prosodic", "behavioral"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function generateVoiceProfile(analysis: AnalysisResult): Promise<VoiceProfileData> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `Based on the following communication analysis, generate a structured Voice Profile JSON with multiple layers (baseline, emotional, casual, compressed).
    
    Analysis:
    ${JSON.stringify(analysis, null, 2)}
    
    Schema:
    {
      "baseline_voice": {
        "tone": string,
        "sentence_style": string,
        "cadence": { "pause_frequency": string, "speech_rate": string },
        "personality_prompt": string
      },
      "emotional_voice": { "tone": string, "personality_prompt": string },
      "casual_voice": { "tone": string, "personality_prompt": string },
      "compressed_voice": { "tone": string, "personality_prompt": string },
      "patterns": string[],
      "anti_patterns": string[],
      "signature_patterns": string[],
      "fillers": string[],
      "tone": string,
      "sentence_style": string,
      "cadence": { "pause_frequency": string, "speech_rate": string },
      "personality_prompt": string
    }`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          baseline_voice: {
            type: Type.OBJECT,
            properties: {
              tone: { type: Type.STRING },
              sentence_style: { type: Type.STRING },
              cadence: {
                type: Type.OBJECT,
                properties: {
                  pause_frequency: { type: Type.STRING },
                  speech_rate: { type: Type.STRING }
                },
                required: ["pause_frequency", "speech_rate"]
              },
              personality_prompt: { type: Type.STRING }
            },
            required: ["tone", "sentence_style", "cadence", "personality_prompt"]
          },
          emotional_voice: {
            type: Type.OBJECT,
            properties: {
              tone: { type: Type.STRING },
              personality_prompt: { type: Type.STRING }
            },
            required: ["tone", "personality_prompt"]
          },
          casual_voice: {
            type: Type.OBJECT,
            properties: {
              tone: { type: Type.STRING },
              personality_prompt: { type: Type.STRING }
            },
            required: ["tone", "personality_prompt"]
          },
          compressed_voice: {
            type: Type.OBJECT,
            properties: {
              tone: { type: Type.STRING },
              personality_prompt: { type: Type.STRING }
            },
            required: ["tone", "personality_prompt"]
          },
          patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
          anti_patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
          signature_patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
          fillers: { type: Type.ARRAY, items: { type: Type.STRING } },
          tone: { type: Type.STRING },
          sentence_style: { type: Type.STRING },
          cadence: {
            type: Type.OBJECT,
            properties: {
              pause_frequency: { type: Type.STRING },
              speech_rate: { type: Type.STRING }
            },
            required: ["pause_frequency", "speech_rate"]
          },
          personality_prompt: { type: Type.STRING }
        },
        required: ["baseline_voice", "emotional_voice", "casual_voice", "compressed_voice", "patterns", "anti_patterns", "signature_patterns", "fillers", "tone", "sentence_style", "cadence", "personality_prompt"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function generateConversationResponse(
  history: { role: 'user' | 'model'; text: string }[],
  currentGoal: string,
  voiceScore: VoiceScore
): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    config: {
      systemInstruction: `You are the VoiceMirror Interviewer. Your goal is to capture the user's unique "Voice DNA".
      
      CURRENT INTERVIEW GOAL: ${currentGoal}
      
      USER'S CURRENT VOICE SCORE:
      - Coverage: ${Math.round(voiceScore.coverage * 100)}%
      - Variability: ${Math.round(voiceScore.variability * 100)}%
      - Consistency: ${Math.round(voiceScore.consistency * 100)}%
      - Depth: ${Math.round(voiceScore.depth * 100)}%
      - Adaptability: ${Math.round(voiceScore.adaptability * 100)}%
      
      GUIDELINES:
      1. Be conversational, warm, and slightly inquisitive.
      2. Don't just ask the goal directly; weave it into the conversation.
      3. If the user's "Depth" is low, ask for more details or stories.
      4. If "Variability" is low, try to provoke a more emotional or humorous response.
      5. Keep your responses short (1-2 sentences) to keep the focus on the user speaking.
      6. Your primary job is to get the user to TALK as much as possible in their natural style.`
    }
  });

  return response.text;
}

export async function rewriteText(profile: VoiceProfileData, inputText: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `Rewrite the following text in the specified voice.
    
    Voice Profile:
    ${JSON.stringify(profile, null, 2)}
    
    Text to rewrite:
    ${inputText}`,
    config: {
      systemInstruction: profile.baseline_voice.personality_prompt
    }
  });

  return response.text;
}
