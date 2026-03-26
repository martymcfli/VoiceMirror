import { ResponseState, VoiceScore } from '../types';

export class VoiceIntelligenceService {
  /**
   * Calculates the current voice completeness score based on session history.
   */
  public static calculateVoiceScore(history: ResponseState[]): VoiceScore {
    if (history.length === 0) {
      return { coverage: 0, variability: 0, consistency: 0, depth: 0, adaptability: 0, finalScore: 0 };
    }

    const coverage = this.calculateCoverage(history);
    const variability = this.calculateVariability(history);
    const consistency = this.calculateConsistency(history);
    const depth = this.calculateDepth(history);
    const adaptability = this.calculateAdaptability(history);

    const finalScore = (
      0.2 * coverage +
      0.2 * variability +
      0.2 * consistency +
      0.15 * depth +
      0.25 * adaptability
    );

    return { coverage, variability, consistency, depth, adaptability, finalScore };
  }

  private static calculateCoverage(history: ResponseState[]): number {
    const categories = new Set(history.map(h => h.category));
    const totalCategories = 7; // warmup, storytelling, explanation, emotion, opinion, humor, reflection
    return Math.min(categories.size / totalCategories, 1);
  }

  private static calculateVariability(history: ResponseState[]): number {
    if (history.length < 3) return 0;
    
    const sentenceLengths = history.map(h => h.avg_sentence_length);
    const emotionalIntensities = history.map(h => h.emotional_intensity);
    const formalityScores = history.map(h => h.formality_score);

    const v1 = this.calculateVariance(sentenceLengths);
    const v2 = this.calculateVariance(emotionalIntensities);
    const v3 = this.calculateVariance(formalityScores);

    // Normalize variance to 0-1 (heuristic)
    return Math.min((v1 + v2 + v3) / 3, 1);
  }

  private static calculateConsistency(history: ResponseState[]): number {
    if (history.length < 5) return 0;
    
    // Check for stable cadence patterns (speech rate and pause density)
    const speechRates = history.map(h => h.speech_rate);
    const pauseDensities = history.map(h => h.pause_density);

    const cv1 = this.calculateCoefficientOfVariation(speechRates);
    const cv2 = this.calculateCoefficientOfVariation(pauseDensities);

    // Lower CV means more consistency. 1 - CV = consistency score.
    return Math.max(1 - (cv1 + cv2) / 2, 0);
  }

  private static calculateDepth(history: ResponseState[]): number {
    const avgLength = history.reduce((sum, h) => sum + h.response_length, 0) / history.length;
    // Heuristic: 200 chars is "good" depth
    return Math.min(avgLength / 200, 1);
  }

  private static calculateAdaptability(history: ResponseState[]): number {
    const transformations = history.filter(h => h.isTransformation);
    if (transformations.length === 0) return 0;

    // Check if user successfully shifted style when prompted
    // For MVP, we'll just check if they provided a response to the transformation prompt
    return Math.min(transformations.length / 4, 1);
  }

  private static calculateVariance(values: number[]): number {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  private static calculateCoefficientOfVariation(values: number[]): number {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg === 0) return 1;
    const stdDev = Math.sqrt(this.calculateVariance(values));
    return stdDev / avg;
  }

  /**
   * Extracts basic metrics from a single response.
   * In a real app, this would be much more sophisticated (NLP, etc.)
   */
  public static analyzeResponse(text: string, category: string, isTransformation: boolean = false): ResponseState {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    return {
      response_length: text.length,
      sentence_count: sentences.length,
      avg_sentence_length: sentences.length > 0 ? words.length / sentences.length : 0,
      speech_rate: words.length / 0.5, // Mock: assume 30s per response
      pause_density: text.split('...').length - 1,
      emotional_intensity: this.estimateEmotion(text),
      formality_score: this.estimateFormality(text),
      category,
      isTransformation
    };
  }

  private static estimateEmotion(text: string): number {
    const emotionalWords = ['love', 'hate', 'angry', 'happy', 'excited', 'annoyed', 'frustrated', 'wild', 'amazing'];
    const count = emotionalWords.filter(w => text.toLowerCase().includes(w)).length;
    return Math.min(count / 3, 1);
  }

  private static estimateFormality(text: string): number {
    const informalWords = ['like', 'you know', 'actually', 'basically', 'honestly', 'stuff', 'thing'];
    const count = informalWords.filter(w => text.toLowerCase().includes(w)).length;
    // More informal words = lower formality score
    return Math.max(1 - (count / 5), 0);
  }
}
