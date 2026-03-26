import { ResponseState, VoiceScore } from '../types';

export const PROMPT_CATEGORIES = {
  WARMUP: [
    "Alright, let’s just start easy — what’d you do today?",
    "How would you normally describe yourself to someone new?",
    "What’s something you’ve been thinking about a lot lately?",
    "What kind of stuff do you usually talk about with friends?",
    "What’s your go-to way of explaining what you do?",
    "What’s something small that made your day better recently?"
  ],
  STORYTELLING: [
    "Tell me about a time something totally unexpected happened.",
    "What’s a story you tell a lot?",
    "Tell me about a moment you were really proud of.",
    "Describe a situation that didn’t go as planned.",
    "Tell me about a time you changed your mind about something.",
    "What’s a funny thing that’s happened to you recently?",
    "Tell me about a time you felt out of place.",
    "Describe a chaotic or stressful moment.",
    "Tell me about a time you took a risk.",
    "What’s a story that says a lot about who you are?"
  ],
  EXPLANATION: [
    "Explain something you’re really good at like I’m a beginner.",
    "Walk me through how you usually solve a problem.",
    "Explain something complicated in your own way.",
    "How would you teach someone your job?",
    "Break down a topic you care about into simple terms.",
    "What’s something people misunderstand a lot?",
    "Explain how you make an important decision.",
    "Teach me something in under a minute.",
    "Explain something you recently learned.",
    "How do you usually give advice?"
  ],
  EMOTION: [
    "Tell me about something that annoyed you recently.",
    "What’s something that made you really happy?",
    "What stresses you out more than it should?",
    "Talk about something you’re excited about.",
    "What’s something you find frustrating about people?",
    "Describe a moment you felt misunderstood.",
    "What motivates you when you’re feeling stuck?",
    "What drains your energy the most?",
    "What’s something you care deeply about?",
    "What’s something you wish people understood about you?"
  ],
  OPINION: [
    "Convince me of something you believe strongly.",
    "What’s an opinion you have that most people disagree with?",
    "What’s something people overcomplicate?",
    "What’s something you think is underrated?",
    "What’s something you think is overrated?",
    "If you had to argue for something, how would you do it?",
    "What’s a hill you’d die on?",
    "What’s something you’ve changed your opinion on recently?"
  ],
  HUMOR: [
    "What kind of humor do you naturally lean toward?",
    "Tell a story in the most dramatic way possible.",
    "Explain something boring but make it interesting.",
    "What’s your version of sarcasm like?",
    "Make a simple topic sound way more important than it is.",
    "Tell me something in a way that would make your friends laugh.",
    "What’s something you joke about a lot?",
    "Explain something like you’re ranting about it."
  ],
  REFLECTION: [
    "How do you think you come across to people?",
    "What’s your communication style like?",
    "How do you talk differently depending on who you’re with?",
    "What version of yourself shows up at work vs with friends?",
    "What do you wish people noticed about how you communicate?",
    "When do you feel most like yourself?",
    "How do you usually express strong opinions?",
    "If someone had to imitate you, what would they get right or wrong?"
  ]
};

export const FOLLOW_UPS = [
  "Wait, say more about that",
  "Why did that matter to you?",
  "How would you normally say that to a friend?",
  "Can you say that again more casually?",
  "What would that sound like if you were annoyed?",
  "Short version?",
  "Now exaggerate that a bit"
];

export class PromptEngine {
  private history: { category: string; prompt: string; isTransformation: boolean }[] = [];
  private categoryCounts: Record<string, number> = {};

  constructor() {
    Object.keys(PROMPT_CATEGORIES).forEach(cat => {
      this.categoryCounts[cat] = 0;
    });
  }

  /**
   * Selects the next prompt based on the current session state and voice score.
   */
  public getNextPrompt(history: ResponseState[], score: VoiceScore): { prompt: string; category: string; isTransformation: boolean } {
    const totalPrompts = this.history.length;

    // 1. First 2 prompts MUST be warmup
    if (totalPrompts < 2) {
      return this.pickFromCategory("WARMUP");
    }

    // 2. Follow-up Injection (Transformations)
    // After ~40% of prompts, inject transformations to capture intra-user variation
    if (Math.random() < 0.4 && totalPrompts > 4 && score.adaptability < 0.8) {
      const prompt = FOLLOW_UPS[Math.floor(Math.random() * FOLLOW_UPS.length)];
      const isTransformation = true;
      this.history.push({ category: "TRANSFORMATION", prompt, isTransformation });
      return { prompt, category: "TRANSFORMATION", isTransformation };
    }

    // 3. Intelligent Prompt Targeting (Feedback Loop)
    const weights: Record<string, number> = {
      STORYTELLING: 1.0,
      EXPLANATION: 1.0,
      EMOTION: 1.0,
      OPINION: 1.0,
      HUMOR: 1.0,
      REFLECTION: 1.0
    };

    // Prioritize weakest dimension
    if (score.variability < 0.6) {
      weights.EMOTION += 1.0;
      weights.HUMOR += 1.0;
    }
    if (score.depth < 0.6) {
      weights.STORYTELLING += 1.0;
    }
    if (score.coverage < 0.8) {
      // Boost categories not yet sampled
      Object.keys(weights).forEach(cat => {
        if (this.categoryCounts[cat] === 0) weights[cat] += 2.0;
      });
    }

    // 4. Constraints
    // No >2 same category consecutively
    const lastTwo = this.history.slice(-2);
    if (lastTwo.length === 2 && lastTwo[0].category === lastTwo[1].category) {
      weights[lastTwo[0].category] = 0;
    }

    // Reflection appears in final 30% (if score is high enough)
    if (score.finalScore < 0.5) {
      weights.REFLECTION = 0.1;
    } else {
      weights.REFLECTION += 1.0;
    }

    // Emotion follows storytelling when possible
    const lastCategory = this.history[totalPrompts - 1]?.category;
    if (lastCategory === "STORYTELLING") {
      weights.EMOTION += 1.5;
    }

    // 5. Pick based on weights
    const categories = Object.keys(weights).filter(cat => weights[cat] > 0);
    const totalWeight = categories.reduce((sum, cat) => sum + weights[cat], 0);
    let random = Math.random() * totalWeight;
    
    let selectedCategory = categories[0];
    for (const cat of categories) {
      if (random < weights[cat]) {
        selectedCategory = cat;
        break;
      }
      random -= weights[cat];
    }

    return this.pickFromCategory(selectedCategory);
  }

  private pickFromCategory(category: string): { prompt: string; category: string; isTransformation: boolean } {
    const prompts = PROMPT_CATEGORIES[category as keyof typeof PROMPT_CATEGORIES] || [];
    if (prompts.length === 0) return { prompt: "Tell me more.", category: "WARMUP", isTransformation: false };

    const unusedPrompts = prompts.filter(p => !this.history.some(h => h.prompt === p));
    const finalPrompts = unusedPrompts.length > 0 ? unusedPrompts : prompts;
    const prompt = finalPrompts[Math.floor(Math.random() * finalPrompts.length)];
    
    this.history.push({ category, prompt, isTransformation: false });
    this.categoryCounts[category] = (this.categoryCounts[category] || 0) + 1;
    
    return { prompt, category, isTransformation: false };
  }
}
