# How MockMind Works

MockMind is an intelligent mock interview platform designed to simulate realistic interview environments using a live conversational AI voice agent. It operates via a modern microservices-styled monorepo, separating the core user web platform, the primary CRUD API, and the specialized AI logic into distinct services.

This document serves as a comprehensive end-to-end breakdown of how the entire MockMind application is structured and how data flows through the system during its core operational cycles.

---

## 1. High-Level Architecture

The platform follows a multi-tier microservice architecture housed in a single monorepo:

### 📱 1. Frontend (`apps/platform`)
- **Framework:** Next.js 15 (React)
- **Role:** Handles the user-facing web platform. Provides dashboards, interview setup flows, session histories, study planners, scheduling interfaces, and the live interview room.
- **Key Modules:** 
  - **LiveKit Client SDK:** Connects securely to the WebRTC LiveKit server for real-time bi-directional audio/video.
  - **MediaPipe CV:** Extracts client-side camera features (head tracking, eye contact, and posture indicators) without transmitting heavy raw video payloads over the network.

### 🔌 2. API Gateway (`apps/api`)
- **Framework:** NestJS
- **Database:** PostgreSQL (via Prisma ORM)
- **Role:** The core backend application that anchors standard business logic. It handles HTTP REST traffic for:
  - User authentication and settings.
  - Managing custom interview templates, questions, and templates matching.
  - Storing structured performance history and finalized session reports.
  - Orchestrating Cron Jobs for the reminder scheduler and weekly digest planner.

### 🧠 3. AI Services Engine (`apps/ai-services`)
- **Framework:** FastAPI + LiveKit Agents Library (Python)
- **Role:** The AI application brain. This service acts directly as the "voice participant" inside the WebRTC room.
- **Stack / Providers:** 
  - **STT (Speech-to-Text):** Deepgram, Whisper (OpenAI)
  - **LLM Context Engine:** Gemini, Groq, OpenAI GPT 
  - **TTS (Text-to-Speech):** ElevenLabs, Google TTS
  - **VAD (Voice Activity Detection):** Silero (for detecting accurate turn-taking, pauses/interruptions)
  - **RAG & Vector Store:** Qdrant with local sentence-transformers (for context parsing against uploaded CVs/JDs and mapping resources).

---

## 2. Core User Experience Flow

The application works by mapping business logic onto four main stages of the user's journey:

### Stage 1: Pre-Interview (Setup & Ingress)
1. The user logs into the Next.js **Platform** and navigates to the Dashboard.
2. They select a template (e.g., HR, System Design, Data Structures) or create a custom round, optionally uploading their Resume/CV or a specific Job Description.
3. They choose between **Strict Mode** (realistic, no nudges) or **Learning Mode** (real-time coaching and soft guidance).
4. **Backend Action:** The `Platform` calls the `NestJS API` to provision a session and fetch a **LiveKit Session Token**. The API triggers `ai-services` to stand up an `AgentSession` initialized with a contextual prompt.

### Stage 2: The Live Mock Interview (The Pipeline)
1. **Connection:** User joins the room. `apps/ai-services` joins as the interviewer.
2. **Audio Intake:** The user's browser begins piping mic audio directly to `LiveKit Server`.
3. **Turn Detection:** The server forwards chunks to `ai-services`. The **Silero** VAD quickly evaluates speaking/pausing endpoints to ensure the agent only interrupts at logical stopping points and understands user interruptions.
4. **Transcription (STT):** Audio buffers are sent to Whisper/Deepgram to get raw text.
5. **Language Processing (LLM):** The transcribed text is sent to the LLM backend (carrying the system prompt rules for the role, user CV constraints, and past turns).
6. **Synthesis (TTS):** The LLM's response is streamed back via ElevenLabs/Google to generate low-latency high-quality voice audio sent back to the candidate's browser.
7. **Client-Side Video Analysis:** In parallel, the user's video feed passes through **MediaPipe** on the `Platform` app frame to log metrics about eye contact, gaze fixation, and engagement scores (bypassing the need to store massive video files backend).

### Stage 3: Post-Interview Processing (Review & Analysis)
Once the participant leaves the room, a processing task is triggered in `ai-services`:
1. **NLP Transcript Analysis:** The entire conversation script is analyzed for:
   - **Pacing:** Words-Per-Minute (WPM) calculations relative to ideal speaking traits.
   - **Filler Word Heatmap:** Extracts "ums," "ahs," "likes," etc.
   - **STAR Compliance:** Cross-references behavioral answers ensuring Situation, Task, Action, Result framing.
2. **Scoring:** Aggregates LLM scoring rubrics paired with the Client-Side Video Analysis payload to assign numerical metrics across (System Design, Communication, Problem Solving).
3. **Data Persisting:** The finalized processed JSON blob is relayed back to `apps/api` and written to the Postgres database through Prisma.

### Stage 4: Personalised Resource Hub & Study Planner
After processing, the Next.js Dashboard populates a high-detail `/report` interface:
1. **Gap Mining:** The Nest API identifies which competencies fell below an acceptable threshold (e.g., "Weak in System Design" or "High use of Filler Words").
2. **Curation:** It uses Qdrant RAG matching to find curated learning resources (Videos, Articles, LeetCode sections, Podcasts) tailored specifically to the user's failed zones.
3. **Study Planner Integrations:** These resources feed into the `apps/api` Cron Job logic. If enabled, MockMind actively emails or texts SMS daily digest study links counting down to their real-world scheduled job interview.

---

## 3. Directory Breakdown

- `apps/platform/`: Everything the user sees. The `app/interview` directory holds the heavily engineered LiveKit WebRTC client integration. The `app/report` holds data visualization mapping (using components like `ProgressChart` and `SkillsRadar`).
- `apps/api/`: Expressive CRUD API built on NestJS framework. You'll find standard `Controllers` and `Services` here defining user routes, reports formatting, RDBMS models, and data abstractions in the `src/` modules.
- `apps/ai-services/agent/`: The "Heart" of the Interviewer voice capability setup. `voice_agent.py` orchestrates LiveKit interactions, invoking tools and establishing LLM/voice plugins cleanly.

## 4. Summary

MockMind operates dynamically—**`Next.js`** provides the frontend canvas and visual feedback charts; **`NestJS`** controls security, long-term memory, and scheduling rules; while **`FastAPI/LiveKit (Python)`** serves as the computationally heavy streaming engine responsible for simulating real-time human interaction.