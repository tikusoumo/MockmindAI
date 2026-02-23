<div align="center">

# MockMind

### AI-Powered Mock Interview Platform

**Practice like it's real. Improve like it's personal.**

MockMind is an intelligent mock interview platform that simulates real interview rounds — Technical, Behavioural, HR, and Machine Coding — using a live AI voice agent. It analyses your speech patterns, detects filler words, measures tone firmness and confidence, and optionally evaluates facial expressions through computer vision. After every session, you receive a detailed performance report with personalised improvement resources and a scheduled reminder system to keep you on track before your next interview.

---

</div>

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Personalised Resource Hub](#personalised-resource-hub)
- [Interview Modes](#interview-modes)
- [AI & Analysis Pipeline](#ai--analysis-pipeline)
- [Architecture](#architecture)
- [Monorepo Structure](#monorepo-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running in Development](#running-in-development)
- [Running with Docker](#running-with-docker)
- [Running with Vagrant (Recommended for Windows)](#running-with-vagrant-recommended-for-windows)
- [API Reference](#api-reference)
- [Roadmap](#roadmap)
- [B2B Product — HireMind](#b2b-product--hiremind)
- [Contributing](#contributing)

---

## Overview

MockMind is a **B2C SaaS platform** where candidates can practice job interviews with an AI-driven voice agent that behaves exactly like a real interviewer. The platform covers the full spectrum of interview rounds, delivers real-time conversation, and produces in-depth post-session reports powered by NLP and computer vision.

The system runs as a cloud-ready monorepo containing three independently deployable applications:

| App | Technology | Purpose |
|-----|-----------|---------|
| `apps/platform` | Next.js 15 | User-facing web application |
| `apps/api` | NestJS + Prisma | REST API gateway & business logic |
| `apps/ai-services` | FastAPI + LiveKit Agents | Voice AI, NLP analysis, CV analysis, RAG |

---

## Key Features

### Live AI Voice Interviewer
- Real-time voice conversation powered by LiveKit WebRTC
- Multilingual turn detection and Voice Activity Detection (VAD) via Silero
- Noise cancellation built into the pipeline
- Supports multiple STT backends: **Deepgram**, **OpenAI Whisper**, **Google STT**
- Supports multiple TTS backends: **ElevenLabs**, **Google TTS**, **OpenAI TTS**
- LLM backends: **Google Gemini**, **Groq**, **OpenAI GPT**

### Interview Round Simulation
- **Technical** — Data structures, algorithms, system design questions
- **Behavioural** — STAR-method responses, interpersonal skills
- **HR** — Culture fit, salary negotiation, career goals
- **Machine Coding** — Live coding walkthrough and explanation
- **Custom Rounds** — Users can create fully custom interview templates

### Two Interview Modes
| Mode | Description |
|------|-------------|
| **Strict Mode** | Simulates a real interview — no coaching during the session; all feedback is saved to the post-session report |
| **Learning Mode** | Active coaching — the AI gives real-time feedback, STAR-method guidance, and follow-up questions |

### NLP Speech Analysis
After every session the platform analyses the candidate's speech transcript:
- **Filler word detection** — "um", "uh", "like", "you know", "basically", etc.
- **Words-per-minute (WPM)** calculation and pacing timeline
- **Fluency score** and **clarity score** (0–100)
- **Confidence tone** analysis via semantic scoring
- **Answer relevance** and depth scoring via LLM semantic analysis
- **STAR-method coverage** detection in behavioural answers

### Computer Vision Analysis
Using MediaPipe face mesh via the candidate's webcam:
- **Eye contact rating** — tracking gaze direction relative to camera
- **Confidence score** — head pose and facial expression signals
- **Engagement score** — micro-expression and attention analysis
- **Posture quality** rating

### Detailed Post-Session Report
Each completed interview generates a report containing:
- Overall score and category breakdown (Communication, Technical Depth, Confidence, Engagement)
- Per-question scores with model answers and gap commentary
- Speech analysis charts — WPM pacing timeline, filler word frequency heatmap
- Behavioural/CV analysis summary — eye contact, posture, confidence rating
- Directional feedback per weaknesses identified in the session
- **Personalised Resource Hub** — curated links to practice materials, tailored to exactly where the candidate fell short (see section below)

---

## Personalised Resource Hub

After every completed interview MockMind automatically builds a **Personalised Resource Hub** — a curated collection of external practice materials mapped directly to the weaknesses surfaced in that session's report. No generic advice; every link is selected because of a specific gap the AI detected in your answers.

### How It Works

1. The report generator scores each competency area (e.g. System Design, Behavioural, Communication, Problem Solving).
2. Any area that falls below the target threshold is flagged as a **growth zone**.
3. The system queries a knowledge graph of hand-curated and community-sourced resources and returns the most relevant matches for each growth zone.
4. Resources are ranked by type, quality rating, and community upvotes.

### Resource Categories

| Category | Examples |
|----------|----------|
| **Articles & Guides** | In-depth written explainers, cheat sheets, structured study guides from sources like freeCodeCamp, Dev.to, Medium, and official documentation |
| **Videos & Courses** | YouTube tutorials, Udemy/Coursera course recommendations, conference talks — matched to the specific topic you struggled with (e.g. "recursion", "conflict resolution", "system design") |
| **Practice Platforms** | Direct links to relevant problem sets on LeetCode, HackerRank, Exercism, Pramp, interviewing.io — filtered by topic and difficulty |
| **Books & Reading Lists** | Curated book recommendations (e.g. *Cracking the Coding Interview*, *System Design Interview*, *The STAR Interview*) with chapter-level suggestions |
| **People to Follow** | Engineers, hiring managers, career coaches, and educators on LinkedIn, X (Twitter), and YouTube who regularly post content relevant to your weak areas |
| **Communities & Forums** | Subreddits (r/cscareerquestions, r/ExperiencedDevs), Discord servers, Slack communities, and LinkedIn groups where you can ask questions and get peer feedback |
| **Podcasts & Newsletters** | Relevant episodes and newsletters filtered by topic so you can learn passively during commutes |
| **Mock Interview Partners** | Links to peer matching platforms (Pramp, interviewing.io, Meetapro) where you can practise with real humans |

### Example — What You Might See After a Session

```
┌──────────────────────────────────────────────────────────────────┐
│  Your Growth Zones This Session                                  │
├──────────────────────────────────────────────────────────────────┤
│  ⚠ System Design        Score: 42/100                           │
│  ⚠ Filler Words         "um"/"like" used 23 times               │
│  ⚠ STAR Structure       Missing "Result" in 3/4 answers         │
└──────────────────────────────────────────────────────────────────┘

📚 Resources for System Design
  → Article : "Grokking System Design" — educative.io
  → Video   : "System Design Interview" playlist — Gaurav Sen (YouTube)
  → Practice: system-design-primer — GitHub (donnemartin)
  → Book    : System Design Interview Vol. 1 & 2 — Alex Xu
  → Follow  : @GergelyOrosz, @alexxubyte on X for daily system design posts
  → Community: r/ExperiencedDevs — weekly system design discussion threads

🎙 Resources for Filler Words & Fluency
  → Article : "How to stop saying um and uh" — Toastmasters.org
  → Video   : "Eliminate Filler Words" — Jefferson Fisher (YouTube)
  → Practice: Orai app — AI speech coach with real-time filler word feedback
  → Follow  : @JeffersonFisher on Instagram/YouTube — communication coach
  → Community: r/PublicSpeaking — weekly speaking challenges

⭐ Resources for STAR Method
  → Article : "STAR Method Explained with Examples" — The Muse
  → Video   : "Behavioural Interview Questions" — Dan Croitor (YouTube)
  → Practice: MockMind Learning Mode — replay this session in Learning Mode
  → Book    : "The STAR Interview" — Misha Yurchenko
```

### Scheduler Integration

Resources don't just live in the report — they feed directly into your **Study Planner**. You can:
- Add any resource to your **daily practice queue** with one click
- Set a **daily reminder** (Email or SMS via cron job) that delivers one resource link each day leading up to your interview date
- Track which resources you've completed and mark them done
- Get a **weekly digest** summarising your study progress across all flagged areas

### RAG-Powered Question Bank
- Upload your **CV/resume** or a **job description** and the AI agent anchors its questions to those documents
- Built on **LangChain + Qdrant** vector search with local sentence-transformer embeddings
- Ensures questions are contextually relevant to the specific role the candidate is targeting

### Scheduler & Notification System
- Built-in **cron job scheduler** to set daily or weekly practice reminders
- Notifications delivered via **Email** and/or **SMS**
- Configurable reminder frequency and time slots
- Countdown-to-interview feature: ramps up notification frequency as interview date approaches

### Custom Interview Builder
Users can:
- Define their own question sets per round type
- Set difficulty level, time limit, and topic focus
- Save and reuse templates
- Share templates with the community

### Dashboard & Progress Tracking
- Skills radar chart across multiple competency areas
- Session history with side-by-side score comparisons
- Progress trend charts over time
- Upcoming scheduled sessions calendar view
- Latest AI-generated insights panel

---

## Interview Modes

```
┌─────────────────────────────────────────────────────────────────┐
│                        Session Setup                            │
│  Choose round type + mode + optional CV/JD upload               │
└────────────────────────┬────────────────────────────────────────┘
                         │
           ┌─────────────▼─────────────┐
           │                           │
    ┌──────▼──────┐             ┌──────▼──────┐
    │  STRICT     │             │  LEARNING   │
    │  MODE       │             │  MODE       │
    │             │             │             │
    │ Real        │             │ Coaching    │
    │ interview   │             │ + feedback  │
    │ simulation  │             │ mid-session │
    └──────┬──────┘             └──────┬──────┘
           └─────────────┬─────────────┘
                         │
           ┌─────────────▼─────────────┐
           │     Post-Session Report   │
           │  Scores + NLP + CV + Tips │
           └───────────────────────────┘
```

---

## AI & Analysis Pipeline

```
Candidate Audio ──► Deepgram/Whisper STT ──► Transcript
                                                  │
                          ┌───────────────────────┤
                          │                       │
                    NLP Analysis            LLM (Gemini/
                    ┌────────────┐          Groq/OpenAI)
                    │ Filler     │               │
                    │ Words      │          Interview
                    │ WPM/Pacing │          Questions &
                    │ Fluency    │          Follow-ups
                    │ Clarity    │               │
                    └────────────┘          TTS Response
                          │            (ElevenLabs/Google)
                    Semantic Analyzer          │
                    ┌────────────┐         Candidate
                    │ STAR check │         hears AI voice
                    │ Confidence │
                    │ Relevance  │
                    └────────────┘
                          │
Candidate Video ──► MediaPipe CV ──► BehavioralAnalysis
                    ┌────────────┐
                    │ Eye contact│
                    │ Confidence │
                    │ Engagement │
                    │ Posture    │
                    └────────────┘
                          │
                    ┌─────▼──────┐
                    │  REPORT    │
                    │ Generator  │
                    └─────┬──────┘
                          │
              ┌───────────▼───────────┐
              │  Personalised Report  │
              │  + Resources + Cron   │
              │    Reminders          │
              └───────────────────────┘
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          MockMind Platform                       │
│                                                                  │
│   ┌──────────────┐     ┌──────────────┐     ┌────────────────┐  │
│   │  Next.js 15  │────►│  NestJS API  │────►│  PostgreSQL    │  │
│   │  (Platform)  │     │  (Gateway)   │     │  (Prisma ORM)  │  │
│   │  Port 3000   │     │  Port 3001   │     │  Port 5432     │  │
│   └──────┬───────┘     └──────────────┘     └────────────────┘  │
│          │                                                       │
│          │ LiveKit WebRTC                                        │
│          ▼                                                       │
│   ┌──────────────┐     ┌──────────────┐     ┌────────────────┐  │
│   │  LiveKit     │────►│  FastAPI     │────►│  Qdrant        │  │
│   │  Server      │     │  AI Services │     │  Vector Store  │  │
│   │  (WebRTC)    │     │  Port 8000   │     │  (RAG)         │  │
│   └──────────────┘     └──────┬───────┘     └────────────────┘  │
│                               │                                  │
│              ┌────────────────┼────────────────┐                 │
│              ▼                ▼                ▼                 │
│        ┌──────────┐   ┌──────────┐   ┌──────────────┐           │
│        │ STT      │   │  LLM     │   │  TTS         │           │
│        │ Deepgram │   │  Gemini  │   │  ElevenLabs  │           │
│        │ Whisper  │   │  Groq    │   │  Google TTS  │           │
│        └──────────┘   └──────────┘   └──────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
MockMind/
├── apps/
│   ├── platform/              # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── page.tsx           # Dashboard
│   │   │   ├── interview/         # Live interview room
│   │   │   ├── report/            # Post-session reports
│   │   │   ├── schedule/          # Session scheduler & cron reminders
│   │   │   ├── history/           # Past sessions & progress
│   │   │   ├── templates/         # Interview template browser
│   │   │   ├── study-planner/     # Resource library & study plan
│   │   │   ├── community/         # Community templates
│   │   │   ├── settings/          # Account & notification settings
│   │   │   └── admin/             # Admin management panel
│   │   └── components/
│   │       ├── dashboard/         # ProgressChart, SkillsRadar, Insights
│   │       ├── interview/         # Live interview UI components
│   │       └── ui/                # shadcn/ui design system
│   │
│   ├── api/                   # NestJS REST API gateway
│   │   ├── src/
│   │   │   ├── livekit/           # Room & token management
│   │   │   ├── data/              # Templates, users, progress data
│   │   │   └── reports/           # Report storage & retrieval
│   │   └── prisma/
│   │       └── schema.prisma      # DB schema (Users, Templates, Reports…)
│   │
│   └── ai-services/           # FastAPI + LiveKit Agents (Python)
│       └── agent/
│           ├── voice_agent.py         # LiveKit AgentSession — core AI loop
│           ├── session_collector.py   # Records transcripts & metadata
│           ├── models.py              # Pydantic models
│           ├── settings.py            # Environment config
│           ├── analysis/
│           │   ├── speech_analyzer.py     # Filler words, WPM, fluency
│           │   ├── semantic_analyzer.py   # STAR, confidence, relevance
│           │   ├── cv_analyzer.py         # MediaPipe face/pose analysis
│           │   └── report_generator.py    # Assembles final report
│           ├── rag/                   # LangChain + Qdrant RAG pipeline
│           └── routers/               # FastAPI route handlers
│
├── packages/
│   ├── ui/                    # Shared React component library
│   ├── eslint-config/         # Shared ESLint configs
│   └── typescript-config/     # Shared tsconfig presets
│
├── docker-compose.yml         # Standard stack
├── docker-compose.gpu.yml     # GPU-accelerated variant
├── docker-compose.cloud.yml   # Cloud deployment variant
├── turbo.json                 # Turborepo pipeline config
└── Vagrantfile                # Linux VM for Windows developers
```

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| Next.js 15 (App Router) | React framework with SSR |
| TypeScript | Type safety across all UI code |
| Tailwind CSS | Utility-first styling |
| shadcn/ui | Accessible component system |
| Lucide React | Icon library |
| LiveKit React SDK | WebRTC room & audio/video UI |

### API Gateway
| Technology | Purpose |
|-----------|---------|
| NestJS | Modular Node.js HTTP framework |
| Prisma ORM | Type-safe database access |
| PostgreSQL 16 | Primary relational database |
| pgAdmin 4 | Database management UI |

### AI Services
| Technology | Purpose |
|-----------|---------|
| FastAPI | High-performance Python HTTP framework |
| LiveKit Agents SDK | Voice agent lifecycle & session management |
| Silero VAD | Voice activity detection |
| Deepgram | Premium speech-to-text |
| OpenAI Whisper | On-device speech-to-text |
| Google STT/TTS | Google Cloud speech services |
| ElevenLabs | High-fidelity text-to-speech |
| Google Gemini | Primary LLM for interview logic |
| Groq | Ultra-fast LLM inference |
| OpenAI GPT | Alternative LLM backend |
| LangChain + LangGraph | RAG orchestration & agentic workflows |
| Qdrant | Vector database for document search |
| Sentence Transformers | Local document embeddings |
| MediaPipe | Face mesh & pose estimation (CV) |
| OpenCV | Video frame processing |
| NumPy | Numerical analysis |

### DevOps & Infrastructure
| Technology | Purpose |
|-----------|---------|
| Docker + Docker Compose | Containerised local development |
| Turborepo | Monorepo build orchestration |
| Vagrant + VirtualBox | Linux VM for Windows-host developers |
| Bun | Fast JavaScript package manager |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20 and **Bun** (or npm)
- **Python** ≥ 3.11
- **Docker** + **Docker Compose**
- A **LiveKit** account → [cloud.livekit.io](https://cloud.livekit.io)
- At least one LLM API key (Gemini, Groq, or OpenAI)
- At least one STT API key (Deepgram or Google)

---

## Environment Variables

Copy `.env.example` to `.env` at the repo root and fill in the values:

```env
# ─── Database ──────────────────────────────────────────────
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres

# ─── LiveKit ───────────────────────────────────────────────
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# ─── LLM Providers (at least one required) ─────────────────
GOOGLE_API_KEY=your_google_gemini_key
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key

# ─── STT / TTS Providers (at least one required) ───────────
DEEPGRAM_API_KEY=your_deepgram_key
ELEVENLABS_API_KEY=your_elevenlabs_key

# ─── Notifications (optional) ──────────────────────────────
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@mockmind.ai
SMTP_PASS=your_smtp_password
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_FROM_NUMBER=+12345678900

# ─── App ────────────────────────────────────────────────────
CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:3001
APP_ENV=dev
```

### Obtaining API Keys

| Service | Sign-up URL |
|---------|------------|
| LiveKit Cloud | https://cloud.livekit.io |
| Google AI (Gemini + STT/TTS) | https://console.cloud.google.com |
| Deepgram | https://console.deepgram.com |
| Groq | https://console.groq.com |
| OpenAI | https://platform.openai.com |
| ElevenLabs | https://elevenlabs.io |
| Twilio (SMS) | https://www.twilio.com |

---

## Running in Development

Install all dependencies from the repo root:

```sh
bun install
```

Run all services concurrently with Turborepo:

```sh
bun run dev
```

Or start each service individually:

```sh
# Frontend (Next.js) — http://localhost:3000
cd apps/platform && bun run dev

# API gateway (NestJS) — http://localhost:3001
cd apps/api && bun run start:dev

# AI services (FastAPI) — http://localhost:8000
cd apps/ai-services
python -m uvicorn agent.main:app --reload --host 0.0.0.0 --port 8000

# AI voice agent worker
cd apps/ai-services
python -m agent.voice_agent start
```

---

## Running with Docker

```sh
# Standard stack (CPU inference)
docker compose up --build

# GPU-accelerated stack (CUDA required)
docker compose -f docker-compose.gpu.yml up --build

# Cloud-optimised stack
docker compose -f docker-compose.cloud.yml up --build
```

Services after startup:

| Service | URL |
|---------|-----|
| Platform (frontend) | http://localhost:3000 |
| AI Services API | http://localhost:8000/docs |
| API Gateway | http://localhost:3001 |
| pgAdmin | http://localhost:5050 |

---

## Running with Vagrant (Recommended for Windows)

Vagrant boots a fully configured Ubuntu VM with Docker pre-installed — no WSL2 or manual Linux setup required.

**Install prerequisites on your Windows host:**
- [Vagrant](https://www.vagrantup.com/downloads)
- [VirtualBox](https://www.virtualbox.org/wiki/Downloads)

```powershell
# 1. Boot the VM (first run takes ~5 minutes)
vagrant up

# 2. SSH into the VM
vagrant ssh

# 3. Navigate to the project and start the stack
cd /vagrant
docker compose up --build
```

Open from your Windows browser: **http://localhost:3000**  
The Vagrantfile forwards all relevant ports to your Windows host automatically.

---

## API Reference

The FastAPI AI Services expose an interactive Swagger UI at **http://localhost:8000/docs**.

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Health check |
| `POST` | `/livekit/rooms` | Create a LiveKit interview room |
| `POST` | `/livekit/token` | Generate a participant token |
| `POST` | `/livekit/agent-token` | Generate an agent token |
| `POST` | `/documents/upload` | Upload CV or JD for RAG question grounding |
| `GET` | `/reports/{session_id}` | Retrieve a post-interview report |
| `GET` | `/data/interview-templates` | List all available interview templates |
| `GET` | `/data/progress-stats` | Get progress statistics for the logged-in user |

---

## Roadmap

### Phase 1 — Core Platform ✅
- [x] LiveKit real-time voice interview agent
- [x] Technical, Behavioural, HR round templates
- [x] Strict and Learning interview modes
- [x] Speech analysis: filler words, WPM, fluency score
- [x] Computer vision: eye contact, confidence, posture
- [x] Post-interview report generation
- [x] RAG pipeline: CV/JD document grounding
- [x] Custom interview template builder
- [x] Dashboard with progress tracking

### Phase 2 — Growth Features 🚧
- [ ] Machine Coding round with code execution sandbox
- [ ] Scheduler & cron-based Email/SMS reminders
- [ ] Personalised resource recommendations (articles, courses, LeetCode)
- [ ] Study planner with daily practice goals
- [ ] Community template sharing marketplace
- [ ] Mobile-responsive PWA

### Phase 3 — Platform Maturity 📋
- [ ] Fine-tuned models for deeper confidence & tone analysis
- [ ] Multi-language support
- [ ] Peer mock interview matching (human-to-human)
- [ ] Resume/CV scoring and improvement suggestions
- [ ] Company-specific interview prep packs
- [ ] Subscription billing (Stripe integration)

---

## B2B Product — HireMind

> **HireMind** is the enterprise companion product to MockMind, planned for development after the core B2C platform reaches maturity.

HireMind targets **companies and recruitment teams** who want to automate first-round candidate screening using the same AI interview engine.

### Planned HireMind Capabilities

| Feature | Description |
|---------|-------------|
| **AI Screening Campaigns** | Companies post a role; candidates receive an async AI interview link |
| **Bulk Candidate Scoring** | Automated ranking of hundreds of candidates by skill, communication, and behaviour |
| **Custom Rubric Builder** | HR teams define scoring rubrics aligned to their competency frameworks |
| **ATS Integrations** | Push ranked candidates directly into Greenhouse, Lever, Workday, etc. |
| **Bias Reduction Layer** | Anonymised scoring to reduce unconscious hiring bias |
| **Recruiter Dashboard** | Side-by-side candidate comparison with report deep-dives |
| **White-label Support** | Host the interviewer under your own brand and domain |
| **Compliance & Data Privacy** | GDPR / SOC 2 compliant data handling and candidate consent flows |

HireMind will be offered as a separate SaaS subscription targeting SMBs and enterprise recruiting teams.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Install dependencies: `bun install`
4. Make your changes and add tests where applicable
5. Run the linter: `bun run lint`
6. Commit using conventional commits: `git commit -m "feat: add machine coding round"`
7. Open a Pull Request against `main`

Please read [AGENTS.md](./AGENTS.md) for agent-specific development guidelines, including how to work with the LiveKit MCP documentation server.

---

<div align="center">

**MockMind** · Practice like it's real. Improve like it's personal.

</div>

## Quick Start (Vagrant VM)

1. **Start the VM:**
   ```sh
   vagrant up
   ```

2. **Configure LiveKit & Google API:**
   - Edit `.env` in the project root
   - Add your `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - Add your `GOOGLE_API_KEY` (already configured)

3. **Run the stack:**
   ```sh
   vagrant ssh
   cd /vagrant
   docker compose up --build
   ```

4. **Access the services:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000/docs
   - pgAdmin: http://localhost:5050
   - Agent Worker: Runs automatically in background

## Architecture

The project includes:
- **Frontend** (Next.js): User interface at `apps/platform`
- **Backend** (FastAPI): REST API at `apps/backend`
- **Agent Worker**: LiveKit voice agent with Google STT/TTS
- **Database**: PostgreSQL with pgAdmin
- **LiveKit**: Real-time voice communication
- **Google APIs**: Speech-to-Text, Text-to-Speech, Gemini LLM

## Services

### Backend API (Port 8000)
REST endpoints for room creation and token generation:
- `POST /livekit/rooms` - Create a LiveKit room
- `POST /livekit/token` - Generate participant token
- `POST /livekit/agent-token` - Generate agent token

### Agent Worker
Automatically connects to LiveKit rooms and provides:
- Speech recognition (Google STT)
- Natural language understanding (Google Gemini)
- Speech synthesis (Google TTS)
- Real-time voice interaction

## Getting API Keys

### LiveKit
1. Sign up at [LiveKit Cloud](https://cloud.livekit.io)
2. Create a new project
3. Copy the WebSocket URL, API Key, and API Secret
4. Add to `.env` in project root

### Google API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project and enable:
   - Cloud Speech-to-Text API
   - Cloud Text-to-Speech API
   - Vertex AI API (for Gemini)
3. Create an API key in "Credentials"
4. Add to `.env` as `GOOGLE_API_KEY`

## Vagrant Setup

Start Linux VM: vagrant up
Run stack inside VM: ```vagrant ssh``` then cd ```/vagrant && docker compose up --build```
Open on your Windows host browser: http://localhost:3000 (camera access uses your host browser/device)

## Run the whole app on Linux (Vagrant)

This repo includes a `Vagrantfile` that boots an Ubuntu VM and installs Docker + Compose.

1) Install prerequisites on your host:
- Vagrant
- VirtualBox

2) Boot the VM:

```sh
vagrant up
```

3) Run the full stack inside the VM:

```sh
vagrant ssh
cd /vagrant
docker compose up --build
```

4) Open from your host browser:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000/docs
- pgAdmin: http://localhost:5050

If any of those ports are already in use on your host, run `vagrant port` to see the auto-corrected host port mappings.

### Public vs private forwarded ports

By default:
- **Public (LAN)**: `3000` (frontend), `8000` (backend) bind to `0.0.0.0`
- **Private (localhost-only)**: `5050` (pgAdmin), `5432` (Postgres) bind to `127.0.0.1`

You can override the bind IPs:

```sh
PUBLIC_HOST_IP=127.0.0.1 vagrant up
```

This Turborepo starter is maintained by the Turborepo core team.

## Using this example

Run the following command:

```sh
npx create-turbo@latest
```

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app
- `web`: another [Next.js](https://nextjs.org/) app
- `@repo/ui`: a stub React component library shared by both `web` and `docs` applications
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo build

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo build
yarn dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo build --filter=docs

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo build --filter=docs
yarn exec turbo build --filter=docs
pnpm exec turbo build --filter=docs
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev
yarn exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev --filter=web

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev --filter=web
yarn exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo login

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo login
yarn exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo link

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo link
yarn exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)
