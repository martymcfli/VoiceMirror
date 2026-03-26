/**
 * AI Service - calls server-side Claude API proxy
 * All AI calls go through /api/v1/ai/* so the API key stays server-side
 */

import { AnalysisResult, VoiceProfileData, TranscriptChunk, VoiceScore } from "../types";

export async function analyzeTranscripts(transcripts: TranscriptChunk[]): Promise<AnalysisResult> {
  const response = await fetch("/api/v1/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcripts }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Analysis failed: ${response.status}`);
  }

  return response.json();
}

export async function generateVoiceProfile(analysis: AnalysisResult): Promise<VoiceProfileData> {
  const response = await fetch("/api/v1/ai/generate-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Profile generation failed: ${response.status}`);
  }

  return response.json();
}

export async function generateConversationResponse(
  history: { role: 'user' | 'model'; text: string }[],
  currentGoal: string,
  voiceScore: VoiceScore
): Promise<string> {
  const response = await fetch("/api/v1/ai/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history, currentGoal, voiceScore }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Conversation failed: ${response.status}`);
  }

  const data = await response.json();
  return data.text;
}

export async function rewriteText(profile: VoiceProfileData, inputText: string): Promise<string> {
  const response = await fetch("/api/v1/ai/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, inputText }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Rewrite failed: ${response.status}`);
  }

  const data = await response.json();
  return data.text;
}
