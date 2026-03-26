# VoiceMirror

VoiceMirror is a production-ready AI identity layer that models user communication styles. It goes beyond standard transcription to learn *how* users speak, capturing tone, cadence, phrasing, pauses, and emotional patterns, and converts those traits into a reusable LLM personality profile.

## Core Insight

We are not just modeling what users say; we are modeling **how they say it**.

VoiceMirror captures:
* **Rhythm & Cadence:** Short bursts vs. long explanations, speech rate, and pause frequency.
* **Linguistic Preferences:** Vocabulary uniqueness, slang, and filler words (e.g., "like", "you know").
* **Behavioral Traits:** Emotional tone shifts, hedging, emphasis, and assertiveness.

## Key Features

* **Real-Time Voice Capture:** Utilizes Wispr Flow WebSockets for live, highly accurate transcription with punctuation and timing metadata.
* **Guided Conversational Engine:** Engages users with dynamic, natural prompts ("Tell me a story," "Explain a complex topic") to draw out genuine emotional and tonal ranges.
* **Automated Voice Profiling:** Extracts linguistic, prosodic, and behavioral features into a structured JSON profile.
* **LLM Integration Layer:** Instantly converts the voice profile into optimized system prompts compatible with Claude, OpenAI, and other LLMs.
* **Real-Time Rewriting (MVP):** Test your profile immediately by passing generic AI text through your newly generated voice filter.

## System Architecture

* **Frontend:** Next.js (App Router) providing a clean, minimal, conversational UX.
* **Backend:** Node.js / FastAPI handling WebSocket streams, metadata extraction, and turn-taking logic.
* **Speech-to-Text:** Wispr Flow API for real-time transcription and pause/timing capture.
* **Database:** PostgreSQL (structured user data) + Vector DB (semantic clustering of phrases and stylistic habits).

## The Output: Voice Profiles

VoiceMirror generates highly structured, portable JSON profiles that can be injected directly into AI system prompts.

```json
{
  "tone": "casual, slightly irreverent, concise",
  "sentence_style": "short bursts with occasional long explanations",
  "signature_patterns": [
    "uses rhetorical questions",
    "frequent analogies",
    "light sarcasm"
  ],
  "fillers": ["like", "honestly"],
  "cadence": {
    "pause_frequency": "medium-high",
    "speech_rate": "fast"
  },
  "personality_prompt": "You are the user. Speak in a casual, sharp, slightly sarcastic tone..."
}
```

## Getting Started

### Prerequisites
* Node.js (v18+) or Python (v3.10+)
* PostgreSQL
* Wispr Flow API Key
* OpenAI / Anthropic API Keys (for the rewriting module)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/martymcfli/VoiceMirror.git
```

2. Install dependencies:
```bash
cd VoiceMirror
npm install
```

3. Set up your environment variables:
```bash
cp .env.example .env
# Add your DB credentials and API keys
```

4. Run the development server:
```bash
npm run dev
```

## Sociological & Psychological Considerations

People do not speak with a single, monolithic voice. VoiceMirror is designed to account for:

* **Contextual Shifts:** Allowing users to generate distinct profiles for different contexts (e.g., "Work Voice", "Casual Voice", "Persuasive Voice").
* **Code-Switching & Cultural Norms:** Capturing the authentic stylistic choices unique to the user's background without forcing them into a standardized linguistic box.
* **Avoiding the Uncanny Valley:** Optimizing for slight stylistic alignment rather than perfect mimicry to ensure outputs feel natural, not eerie.

## Privacy & Data Ownership

Voice data is highly sensitive. VoiceMirror operates on a strict user-owned data model. All raw conversational inputs are used solely for generating the local Voice Profile and can be deleted upon request. Clear consent flows are built into the onboarding process.

## Contributing

Contributions are welcome! If you are interested in expanding the linguistic extraction engine or adding new LLM export formats, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
