import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import admin from "firebase-admin";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "voicemirror-super-secret-key";

// Initialize Firebase Admin
// Note: In this environment, we might not have a service account file.
// We'll try to initialize with default credentials or just mock the DB if it fails.
try {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0999728960",
  });
} catch (e) {
  console.warn("Firebase Admin initialization failed. Using mock mode.", e);
}

const db = admin.firestore();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000");

  app.use(express.json());

  // --- Auth Middleware ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- Auth Routes ---
  app.post("/api/v1/auth/signup", async (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    try {
      const userRef = await db.collection("users").add({
        email,
        password_hash: hashedPassword,
        created_at: new Date().toISOString()
      });
      const token = jwt.sign({ userId: userRef.id, email }, JWT_SECRET);
      res.json({ user_id: userRef.id, token });
    } catch (e) {
      res.status(500).json({ error: "Signup failed" });
    }
  });

  app.post("/api/v1/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const snapshot = await db.collection("users").where("email", "==", email).limit(1).get();
      if (snapshot.empty) return res.status(400).json({ error: "User not found" });
      
      const user = snapshot.docs[0].data();
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) return res.status(400).json({ error: "Invalid password" });
      
      const token = jwt.sign({ userId: snapshot.docs[0].id, email }, JWT_SECRET);
      res.json({ user_id: snapshot.docs[0].id, token });
    } catch (e) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  // --- Session Routes ---
  app.post("/api/v1/sessions", authenticateToken, async (req: any, res) => {
    const { mode, profile_target } = req.body;
    try {
      const sessionRef = await db.collection("sessions").add({
        user_id: req.user.userId,
        mode,
        profile_target,
        status: "active",
        created_at: new Date().toISOString()
      });
      res.json({ 
        session_id: sessionRef.id, 
        ws_url: `ws://${req.get('host')}/ws/transcribe?sessionId=${sessionRef.id}` 
      });
    } catch (e) {
      res.status(500).json({ error: "Session creation failed" });
    }
  });

  app.get("/api/v1/sessions/:id", authenticateToken, async (req: any, res) => {
    try {
      const doc = await db.collection("sessions").doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: "Session not found" });
      
      const transcripts = await db.collection("sessions").doc(req.params.id).collection("transcripts").orderBy("start_time").get();
      res.json({ 
        ...doc.data(), 
        transcripts: transcripts.docs.map(d => d.data()) 
      });
    } catch (e) {
      res.status(500).json({ error: "Fetch failed" });
    }
  });

  app.post("/api/v1/sessions/:id/end", authenticateToken, async (req, res) => {
    try {
      await db.collection("sessions").doc(req.params.id).update({
        status: "ended",
        ended_at: new Date().toISOString()
      });
      res.json({ status: "ended" });
    } catch (e) {
      res.status(500).json({ error: "End failed" });
    }
  });

  // --- Profile Routes ---
  app.get("/api/v1/profiles", authenticateToken, async (req: any, res) => {
    try {
      const snapshot = await db.collection("voice_profiles").where("user_id", "==", req.user.userId).get();
      res.json(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      res.status(500).json({ error: "Fetch failed" });
    }
  });

  app.get("/api/v1/profiles/:id", authenticateToken, async (req, res) => {
    try {
      const doc = await db.collection("voice_profiles").doc(req.params.id).get();
      res.json({ id: doc.id, ...doc.data() });
    } catch (e) {
      res.status(500).json({ error: "Fetch failed" });
    }
  });

  // --- Analysis Routes ---
  app.post("/api/v1/analysis/run/:session_id", authenticateToken, async (req, res) => {
    // In a real app, this would trigger a background worker
    res.json({ status: "processing" });
  });

  app.get("/api/v1/analysis/:session_id", authenticateToken, async (req, res) => {
    // Mock analysis result
    res.json({
      linguistic: { avg_sentence_length: 12.4, vocab_uniqueness: 0.67, filler_words: ["like", "you know"] },
      prosodic: { speech_rate_wpm: 165, avg_pause_ms: 420 },
      behavioral: { assertiveness: 0.7, formality: 0.3 }
    });
  });

  // --- Profile Routes (Extended) ---
  app.put("/api/v1/profiles/:id", authenticateToken, async (req, res) => {
    try {
      await db.collection("voice_profiles").doc(req.params.id).update({
        ...req.body,
        updated_at: new Date().toISOString()
      });
      res.json({ status: "updated" });
    } catch (e) {
      res.status(500).json({ error: "Update failed" });
    }
  });

  // --- Rewrite Routes ---
  app.post("/api/v1/rewrite", authenticateToken, async (req, res) => {
    const { profile_id, input_text } = req.body;
    // This would call Gemini in a real implementation
    res.json({ output_text: `[Rewritten in voice ${profile_id}]: ${input_text}` });
  });

  // --- Export Routes ---
  app.get("/api/v1/profiles/:id/export", authenticateToken, async (req, res) => {
    const { format } = req.query;
    try {
      const doc = await db.collection("voice_profiles").doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: "Profile not found" });
      const profile = doc.data();
      
      if (format === "claude") {
        res.send(profile?.profileJson?.personality_prompt);
      } else {
        res.json(profile?.profileJson);
      }
    } catch (e) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  // --- Vite middleware for development ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // --- WebSocket for Transcription ---
  const wss = new WebSocketServer({ server, path: "/ws/transcribe" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      ws.close(1008, "Session ID required");
      return;
    }

    console.log(`WS Connected for session: ${sessionId}`);

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        // Internal message format from spec:
        // { session_id, text, start_time, end_time, confidence }
        
        await db.collection("sessions").doc(sessionId).collection("transcripts").add({
          ...message,
          created_at: new Date().toISOString()
        });

        // Echo back or acknowledge
        ws.send(JSON.stringify({ status: "received", timestamp: Date.now() }));
      } catch (e) {
        console.error("WS Message Error:", e);
      }
    });
  });
}

startServer();
