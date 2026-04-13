"use client";

import { useState, useEffect, useCallback, Suspense, useRef, useMemo } from "react";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  MessageSquare,
  MoreVertical,
  Loader2,
  MonitorUp,
  X,
  Send,
  Users,
  LayoutGrid,
  User as UserIcon,
  Pin,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight,
  FileText,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { InterviewTemplate } from "@/data/mockData";
import {
  CodeEditor,
  type CodeExecutionEvent,
  type RemoteExecutionRequest,
} from "@/components/interview/CodeEditor";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { User } from "@/data/mockData";
import { backendPost, useBackendData } from "@/lib/backend";
import { fallbackCurrentUser } from "@/lib/fallback-data";
import { ParticipantVisualizer } from "@/components/interview/ParticipantVisualizer";
import { useMediaDevices } from "@/hooks/useMediaDevices";

import { 
  LiveKitRoom, 
  RoomAudioRenderer,
  useMaybeRoomContext,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import '@livekit/components-styles';

const DEFAULT_HISTORY_SNAPSHOT_INTERVAL_SECONDS = 30;
const MIN_HISTORY_SNAPSHOT_INTERVAL_SECONDS = 5;
const MAX_HISTORY_SNAPSHOT_INTERVAL_SECONDS = 300;

function parseHistorySnapshotInterval(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const parsed = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return Math.max(
    MIN_HISTORY_SNAPSHOT_INTERVAL_SECONDS,
    Math.min(MAX_HISTORY_SNAPSHOT_INTERVAL_SECONDS, rounded),
  );
}

function parseSystemPromptSettings(
  rawSystemPrompt: unknown,
): { historySnapshotIntervalSec?: number } {
  if (typeof rawSystemPrompt !== "string" || !rawSystemPrompt.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawSystemPrompt);
    if (parsed && typeof parsed === "object") {
      const interval = parseHistorySnapshotInterval(
        (parsed as Record<string, unknown>).historySnapshotIntervalSec,
      );
      return interval === null ? {} : { historySnapshotIntervalSec: interval };
    }
  } catch {
    // Non-JSON system prompts are valid; ignore parse failures.
  }

  return {};
}

type SessionParticipant = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  status?: string;
  micOn?: boolean;
  camOn?: boolean;
  speaking?: boolean;
};

type SessionRecord = {
  id?: string;
  title?: string;
  type?: string;
  focusAreas?: string;
  difficulty?: string;
  aiBehavior?: string;
  persona?: string;
  accessType?: string;
  historySnapshotIntervalSec?: number;
  systemPrompt?: string;
  template?: {
    systemPrompt?: string;
  };
  participants?: SessionParticipant[];
};

type SessionPromptAIAgent = {
  persona: string;
  designation: string;
};

type ModalReportSummary = {
  id?: string;
  overallScore?: number;
  hardSkillsScore?: number;
  softSkillsScore?: number;
  highlights?: string[];
  transcript?: Array<{ text?: string }>;
};

type InterviewParticipantCard = {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  isAI?: boolean;
  speaking?: boolean;
  isLocal?: boolean;
  camOn?: boolean;
  micOn?: boolean;
};

const INTERVIEW_TYPES: InterviewTemplate["type"][] = [
  "Technical",
  "Aptitude",
  "Machine Coding",
  "Behavioral",
  "HR",
  "Custom",
];

const INTERVIEW_DIFFICULTIES: InterviewTemplate["difficulty"][] = [
  "Easy",
  "Medium",
  "Hard",
];

function normalizeInterviewType(
  raw: unknown,
  fallback: InterviewTemplate["type"] = "Technical",
): InterviewTemplate["type"] {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === "machine coding" || normalized === "machine-coding") {
    return "Machine Coding";
  }

  if (normalized === "hr") {
    return "HR";
  }

  const matched = INTERVIEW_TYPES.find(
    (value) => value.toLowerCase() === normalized,
  );
  return matched || fallback;
}

function normalizeDifficulty(
  raw: unknown,
  fallback: InterviewTemplate["difficulty"] = "Medium",
): InterviewTemplate["difficulty"] {
  const normalized = String(raw || "").trim().toLowerCase();
  const matched = INTERVIEW_DIFFICULTIES.find(
    (value) => value.toLowerCase() === normalized,
  );
  return matched || fallback;
}

function normalizeInterviewMode(
  raw: unknown,
): NonNullable<InterviewTemplate["mode"]> {
  const normalized = String(raw || "strict").trim().toLowerCase();
  return normalized === "learning" ? "learning" : "strict";
}

function formatPersonaDisplayName(rawPersona: unknown): string {
  const cleaned = String(rawPersona || "Sarah")
    .trim()
    .replace(/[\-_]+/g, " ");
  if (!cleaned) {
    return "Sarah";
  }
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseAiAgentsFromSystemPrompt(
  rawSystemPrompt: unknown,
): SessionPromptAIAgent[] {
  if (typeof rawSystemPrompt !== "string" || !rawSystemPrompt.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawSystemPrompt);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    const rawAgents = (parsed as Record<string, unknown>).aiAgents;
    if (!Array.isArray(rawAgents)) {
      return [];
    }

    return rawAgents
      .map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const persona = String(record.persona || "sarah").trim().toLowerCase() || "sarah";
        const designation =
          String(record.designation || "").trim() || `Panel Interviewer ${index + 1}`;

        return { persona, designation };
      })
      .filter((entry): entry is SessionPromptAIAgent => Boolean(entry))
      .slice(0, 4);
  } catch {
    return [];
  }
}

export default function InterviewPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] w-full relative group">
      <Suspense
        fallback={
          <div className="flex min-h-[calc(100vh-8rem)] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <InterviewPageContent />
      </Suspense>
    </div>
  );
}

function InterviewPageContent() {
  const currentUser = useBackendData<User>("/api/user", fallbackCurrentUser);
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const customTitle = searchParams.get("title");
  const customType = searchParams.get("type");
  const customDescription = searchParams.get("description");
  const persistedSessionId = searchParams.get("sessionId");
  const [effectiveSessionId] = useState<string>(() =>
    persistedSessionId || `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const [sessionDbData, setSessionDbData] = useState<SessionRecord | null>(null);

  useEffect(() => {
     if (persistedSessionId) {
         import("@/lib/backend").then(({ backendGet }) => {
             backendGet<SessionRecord>(`/api/sessions/${persistedSessionId}`)
               .then(setSessionDbData)
               .catch(console.error);
         });
     }
  }, [persistedSessionId]);

  const effectiveType = sessionDbData?.type || customType;
  const normalizedEffectiveType = String(effectiveType || "").trim().toLowerCase();
  const isCodingRound =
    templateId === "machine-coding-round" ||
    templateId === "tech-round" ||
    normalizedEffectiveType === "machine coding" ||
    normalizedEffectiveType === "technical";
  const resolvedInterviewType =
    effectiveType ||
    (templateId === "machine-coding-round" ? "Machine Coding" : isCodingRound ? "Technical" : "Technical");
  const effectiveMode = sessionDbData?.aiBehavior || searchParams.get("mode") || "strict";
  const effectiveTitle = sessionDbData?.title || customTitle || "Interview";
  const effectiveDescription = sessionDbData?.focusAreas || customDescription || "Practice session";
  const historySnapshotIntervalSec = useMemo(() => {
    const queryInterval = parseHistorySnapshotInterval(searchParams.get("historyIntervalSec"));
    if (queryInterval !== null) {
      return queryInterval;
    }

    const directSessionInterval = parseHistorySnapshotInterval(
      sessionDbData?.historySnapshotIntervalSec,
    );
    if (directSessionInterval !== null) {
      return directSessionInterval;
    }

    const sessionPromptInterval = parseSystemPromptSettings(
      sessionDbData?.systemPrompt,
    ).historySnapshotIntervalSec;
    if (typeof sessionPromptInterval === "number") {
      return sessionPromptInterval;
    }

    const templatePromptInterval = parseSystemPromptSettings(
      sessionDbData?.template?.systemPrompt,
    ).historySnapshotIntervalSec;
    if (typeof templatePromptInterval === "number") {
      return templatePromptInterval;
    }

    return DEFAULT_HISTORY_SNAPSHOT_INTERVAL_SECONDS;
  }, [searchParams, sessionDbData]);

  const dummyTemplate: InterviewTemplate = {
    id: templateId || "dummy",
    title: sessionDbData?.title || customTitle || "Tech Round: React & System Design",
    type: normalizeInterviewType(
      effectiveType,
      isCodingRound ? "Machine Coding" : "Technical",
    ),
    mode: normalizeInterviewMode(effectiveMode),
    duration: "45 mins",
    difficulty: normalizeDifficulty(
      sessionDbData?.difficulty || searchParams.get("difficulty"),
      "Medium",
    ),
    questions: [],
    description: effectiveDescription,
    icon: isCodingRound ? "Code" : "Sparkles",
    color: isCodingRound ? "blue" : "blue",
    persona: sessionDbData?.persona || searchParams.get("persona") || "Sarah",
  };

  const [liveKitToken, setLiveKitToken] = useState<string>("");
  const [liveKitUrl, setLiveKitUrl] = useState<string>("");

  useEffect(() => {
     let mounted = true;
     if (persistedSessionId && !sessionDbData) {
       return () => {
         mounted = false;
       };
     }

     import("@/lib/backend").then(({ backendPost }) => {
        backendPost<{token: string, url: string}>("/api/livekit/token", {
          room_name: `interview-${effectiveSessionId}`,
           participant_name: currentUser?.name || "Candidate",            
           metadata: JSON.stringify({
          templateId: templateId || "",
          sessionId: effectiveSessionId,
            templateTitle: effectiveTitle,
            mode: effectiveMode,
            interviewType: resolvedInterviewType,
            customDescription: effectiveDescription,
            ideEnabled: isCodingRound,
            historySnapshotIntervalSec,
            participantName: currentUser?.name || "Candidate",
            })        }).then((data) => {
           if (mounted) {
              setLiveKitToken(data.token);
              setLiveKitUrl(data.url);
           }
        }).catch(() => {
           // We suppress LiveKit token errors for now so we can still view the Dummy UI!
           if (mounted) {
               console.warn("LiveKit offline. Rendering dummy UI mode.");
               setLiveKitToken("dummy"); // Bypass to allow rendering UI
           }
        });
     });
     return () => { mounted = false; };
  }, [
    currentUser?.name,
    effectiveDescription,
    effectiveMode,
    effectiveTitle,
    effectiveType,
    effectiveSessionId,
    isCodingRound,
    historySnapshotIntervalSec,
    persistedSessionId,
    resolvedInterviewType,
    sessionDbData,
    templateId,
  ]);

  if (!liveKitToken) {
      return <div className="flex min-h-[calc(100vh-8rem)] w-full flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="flex flex-col gap-1">
           <h3 className="font-semibold text-lg text-foreground">Preparing AI Interviewer</h3>
           <p className="text-muted-foreground text-sm">Bringing up the conversational agent...</p>
        </div>
     </div>
  }

  // If token is literally "dummy", we bypass actual LiveKit connection
  if (liveKitToken === "dummy") {
      return (
          <div className="flex flex-col gap-4 h-full w-full">
            <InterviewSession
              currentUser={currentUser}
              template={dummyTemplate}
              isDummyMode={true}
              sessionDbData={sessionDbData}
              sessionId={effectiveSessionId}
              historySnapshotIntervalSec={historySnapshotIntervalSec}
              tourMode={searchParams.get("tour")}
            />
          </div>
      );
  }

  return (
    <LiveKitRoom
      token={liveKitToken}
      serverUrl={liveKitUrl}
      connect={true}
      video={true}
      audio={true}
      className="flex flex-col gap-4 h-full w-full"
    >
      <InterviewSession
        currentUser={currentUser}
        template={dummyTemplate}
        isDummyMode={false}
        sessionDbData={sessionDbData}
        sessionId={effectiveSessionId}
        historySnapshotIntervalSec={historySnapshotIntervalSec}
        tourMode={searchParams.get("tour")}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function InterviewSession({
  currentUser,
  template,
  isDummyMode,
  sessionDbData,
  sessionId,
  historySnapshotIntervalSec,
  tourMode,
}: {
  currentUser: User;
  template?: InterviewTemplate;
  isDummyMode: boolean;
  sessionDbData?: SessionRecord | null;
  sessionId?: string;
  historySnapshotIntervalSec?: number;
  tourMode?: string | null;
}) {
  const router = useRouter();
  const reportLookupId = sessionId || template?.id || "latest";
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [isWorkflowTourOpen, setIsWorkflowTourOpen] = useState(false);
  const [workflowTourStep, setWorkflowTourStep] = useState(0);
  const [workflowTourRect, setWorkflowTourRect] = useState<DOMRect | null>(null);

  const [chatMessages, setChatMessages] = useState<{name: string, text: string, time: string}[]>([
      { name: "System", text: "Welcome to the interview session. Multiple participants can join.", time: "10:00 AM" }
  ]);
  const [chatInput, setChatInput] = useState("");

  const workflowTourStorageKey = useMemo(() => {
    const identitySource = currentUser as User & {
      id?: number;
      email?: string;
    };
    const identity =
      typeof identitySource.id === "number"
        ? `id-${identitySource.id}`
        : identitySource.email
          ? `email-${identitySource.email}`
          : `name-${currentUser?.name || "user"}`;
    return `platform-interview-workflow-tour:v1:${identity}`;
  }, [currentUser]);

  const notesStorageKey = useMemo(() => {
    return `platform-session-notes:v1:${reportLookupId}`;
  }, [reportLookupId]);

  const effectiveType = sessionDbData?.type || template?.type;
  const normalizedEffectiveType = String(effectiveType || "").trim().toLowerCase();
  const isCodingRound =
    normalizedEffectiveType === "machine coding" ||
    normalizedEffectiveType === "technical" ||
    template?.id === "machine-coding-round" ||
    template?.id === "tech-round";
  const [code, setCode] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("javascript");
  const [latestCodeSnapshot, setLatestCodeSnapshot] = useState<{ code: string; language: string }>({
    code: "",
    language: "javascript",
  });
  const [executionRequest, setExecutionRequest] = useState<RemoteExecutionRequest | null>(null);
  const [assistantIdeNotice, setAssistantIdeNotice] = useState<string>("");
  const codeRef = useRef(code);
  const assistantTypingFrameRef = useRef<number | null>(null);
  const assistantNoticeTimerRef = useRef<number | null>(null);
  const suppressIdePublishUntilRef = useRef<number>(0);
  const pendingCodeSnapshotRef = useRef<{ code: string; language: string } | null>(null);
  const lastPublishedCodeSnapshotRef = useRef<{ code: string; language: string } | null>(null);
  const effectiveHistorySnapshotIntervalSec =
    parseHistorySnapshotInterval(historySnapshotIntervalSec) ??
    DEFAULT_HISTORY_SNAPSHOT_INTERVAL_SECONDS;

  const workflowTourSteps = useMemo(() => {
    const steps = [
      {
        key: "ai-agent",
        target: "[data-tour='ai-agent-card']",
        title: "This is your AI interviewer",
        description:
          "This panel shows the AI interviewer state while it speaks and listens.",
      },
      {
        key: "media-controls",
        target: "[data-tour='media-controls']",
        title: "Control camera and microphone",
        description:
          "Toggle mic/camera instantly and select the exact input devices from dropdowns.",
      },
      {
        key: "notes",
        target: "[data-tour='session-notes-trigger']",
        title: "Take live notes",
        description:
          "Use notes to track key follow-ups and talking points during the interview.",
      },
      {
        key: "invite",
        target: "[data-tour='invite-users-trigger']",
        title: "Invite collaborators",
        description:
          "Invite people by email or copy a session link for observers/interviewers.",
      },
    ];

    if (isCodingRound) {
      steps.splice(1, 0, {
        key: "editor",
        target: "[data-tour='code-editor-pane']",
        title: "This is the live code editor",
        description:
          "Write, run, and iterate your code here while the AI evaluates your approach.",
      });
    }

    return steps;
  }, [isCodingRound]);

  useEffect(() => {
    try {
      const existingNotes = window.localStorage.getItem(notesStorageKey) || "";
      setSessionNotes(existingNotes);
    } catch {
      // Ignore storage access failures.
    }
  }, [notesStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(notesStorageKey, sessionNotes);
    } catch {
      // Ignore storage access failures.
    }
  }, [notesStorageKey, sessionNotes]);

  useEffect(() => {
    let shouldOpenTour = tourMode === "onboarding";
    try {
      const hasSeenTour =
        window.localStorage.getItem(workflowTourStorageKey) === "completed";
      if (!hasSeenTour) {
        shouldOpenTour = true;
      }
    } catch {
      // Ignore storage access failures.
    }

    if (shouldOpenTour) {
      setWorkflowTourStep(0);
      setIsWorkflowTourOpen(true);
    }
  }, [tourMode, workflowTourStorageKey]);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  const stopAssistantTypingAnimation = useCallback(() => {
    if (assistantTypingFrameRef.current !== null) {
      window.cancelAnimationFrame(assistantTypingFrameRef.current);
      assistantTypingFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAssistantTypingAnimation();
      if (assistantNoticeTimerRef.current !== null) {
        window.clearTimeout(assistantNoticeTimerRef.current);
      }
    };
  }, [stopAssistantTypingAnimation]);

  const applyAssistantCodeUpdate = useCallback(
    (payload: {
      code?: string;
      language?: string;
      intent?: string;
      explanation?: string;
      typingMs?: number;
      typing_ms?: number;
    }) => {
      const incomingCode = typeof payload?.code === "string" ? payload.code : "";
      if (!incomingCode) {
        return;
      }

      const intent = payload.intent === "append" ? "append" : "replace";
      const nextLanguage =
        typeof payload.language === "string" && payload.language.trim()
          ? payload.language
          : codeLanguage;
      const previousCode = codeRef.current || "";
      const targetCode = intent === "append" ? `${previousCode}${incomingCode}` : incomingCode;
      const typingMsRaw = Number(payload.typingMs ?? payload.typing_ms ?? 0);
      const typingMs = Number.isFinite(typingMsRaw) ? Math.max(0, Math.min(typingMsRaw, 5000)) : 0;

      suppressIdePublishUntilRef.current = Date.now() + Math.max(typingMs + 800, 1200);
      stopAssistantTypingAnimation();

      const finalize = (finalCode: string) => {
        setCode(finalCode);
        codeRef.current = finalCode;
        setCodeLanguage(nextLanguage || "javascript");
        setLatestCodeSnapshot({
          code: finalCode,
          language: nextLanguage || "javascript",
        });
        // Assistant-applied edits should not be attributed as candidate snapshots.
        pendingCodeSnapshotRef.current = null;
        lastPublishedCodeSnapshotRef.current = {
          code: finalCode,
          language: nextLanguage || "javascript",
        };
        setIsIdeCollapsed(false);
      };

      const targetLength = targetCode.length;
      if (typingMs <= 0 || targetLength > 12000) {
        finalize(targetCode);
      } else {
        let prefixLength = 0;
        const maxPrefix = Math.min(previousCode.length, targetCode.length);
        while (prefixLength < maxPrefix && previousCode[prefixLength] === targetCode[prefixLength]) {
          prefixLength += 1;
        }

        const startAt = performance.now();
        const animateStep = (now: number) => {
          const progress = Math.min(1, (now - startAt) / typingMs);
          const renderedLength = prefixLength + Math.floor((targetLength - prefixLength) * progress);
          const nextCode = targetCode.slice(0, renderedLength);
          setCode(nextCode);
          codeRef.current = nextCode;

          if (progress < 1) {
            assistantTypingFrameRef.current = window.requestAnimationFrame(animateStep);
            return;
          }

          assistantTypingFrameRef.current = null;
          finalize(targetCode);
        };

        assistantTypingFrameRef.current = window.requestAnimationFrame(animateStep);
      }

      const explanation = typeof payload?.explanation === "string" ? payload.explanation.trim() : "";
      if (explanation) {
        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setChatMessages((prev) => [
          ...prev,
          {
            name: `${sessionDbData?.persona || "AI"}`,
            text: `[IDE] ${explanation}`,
            time,
          },
        ]);
      }

      setAssistantIdeNotice("AI collaborator updated code.");
      if (assistantNoticeTimerRef.current !== null) {
        window.clearTimeout(assistantNoticeTimerRef.current);
      }
      assistantNoticeTimerRef.current = window.setTimeout(() => {
        setAssistantIdeNotice("");
      }, 2200);
    },
    [codeLanguage, sessionDbData?.persona, stopAssistantTypingAnimation],
  );
  
  // IDE Toggles
  const [isIdeCollapsed, setIsIdeCollapsed] = useState(false);
  const [isIdeFullscreen, setIsIdeFullscreen] = useState(false);
  const fullScreenContainerRef = useRef<HTMLDivElement>(null);

  // ─── Real hardware access for camera + mic ───
  const {
      stream,
      cameras,
      microphones,
      activeCameraId,
      setActiveCameraId,
      activeMicId,
      setActiveMicId,
      isCameraEnabled,
      setIsCameraEnabled,
      isMicEnabled,
      setIsMicEnabled,
  } = useMediaDevices();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const recordingSessionId = sessionId || template?.id || "practice";
  const livekitRoomName = `interview-${recordingSessionId}`;
  const roomRecordingEgressIdRef = useRef<string | null>(null);
  const roomRecordingStartPromiseRef = useRef<Promise<void> | null>(null);
  const hasStoppedRoomRecordingRef = useRef(false);
  const [isFinalizingRecording, setIsFinalizingRecording] = useState(false);

  // Attach camera stream to video element
  useEffect(() => {
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [stream, isCameraEnabled]);

  useEffect(() => {
    if (isDummyMode || roomRecordingEgressIdRef.current || roomRecordingStartPromiseRef.current) {
      return;
    }

    let cancelled = false;
    const startPromise = (async () => {
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        if (cancelled) {
          return;
        }

        try {
          const result = await backendPost<{ egressId: string }>("/api/livekit/recordings/start", {
            room_name: livekitRoomName,
            session_id: recordingSessionId,
          });
          if (!cancelled) {
            roomRecordingEgressIdRef.current = result.egressId;
          }
          return;
        } catch (error) {
          if (attempt === 8) {
            console.error("Failed to start LiveKit room recording", error);
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    })()
      .finally(() => {
        roomRecordingStartPromiseRef.current = null;
      });

    roomRecordingStartPromiseRef.current = startPromise;
    return () => {
      cancelled = true;
    };
  }, [isDummyMode, livekitRoomName, recordingSessionId]);

  const stopRoomRecording = useCallback(async () => {
    if (isDummyMode || hasStoppedRoomRecordingRef.current) {
      return;
    }

    hasStoppedRoomRecordingRef.current = true;

    try {
      if (roomRecordingStartPromiseRef.current) {
        await roomRecordingStartPromiseRef.current;
      }

      const egressId = roomRecordingEgressIdRef.current;
      if (!egressId) {
        return;
      }

      setIsFinalizingRecording(true);
      await backendPost("/api/livekit/recordings/stop", {
        egress_id: egressId,
      });
      roomRecordingEgressIdRef.current = null;
    } catch (error) {
      hasStoppedRoomRecordingRef.current = false;
      console.error("Failed to finalize LiveKit room recording", error);
    } finally {
      setIsFinalizingRecording(false);
    }
  }, [isDummyMode]);

  useEffect(() => {
    return () => {
      if (isDummyMode || hasStoppedRoomRecordingRef.current) {
        return;
      }

      const egressId = roomRecordingEgressIdRef.current;
      if (!egressId) {
        return;
      }

      hasStoppedRoomRecordingRef.current = true;
      void backendPost("/api/livekit/recordings/stop", {
        egress_id: egressId,
      }).catch((error) => {
        console.error("Failed to stop LiveKit room recording on cleanup", error);
      });
    };
  }, [isDummyMode]);

  // LiveKit WebRTC Hooks (only when connected)
  const livekitRoom = useMaybeRoomContext();
  const lkParticipant = livekitRoom?.localParticipant ?? null;
  const isScreenShareEnabled = lkParticipant?.isScreenShareEnabled ?? false;

  const toggleMic = useCallback(() => setIsMicEnabled(prev => !prev), [setIsMicEnabled]);
  const toggleCam = useCallback(() => setIsCameraEnabled(prev => !prev), [setIsCameraEnabled]);
  const toggleScreenShare = useCallback(() => {
     if (lkParticipant) lkParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: false }).catch(console.error);
  }, [lkParticipant, isScreenShareEnabled]);

  const publishIdeEventData = useCallback(
    (payload: Record<string, unknown>) => {
      if (isDummyMode || !lkParticipant) {
        return;
      }

      const encoder = new TextEncoder();
      lkParticipant
        .publishData(encoder.encode(JSON.stringify(payload)), { reliable: true })
        .catch((error) => {
          console.error("Failed to publish IDE collaboration event", error);
        });
    },
    [isDummyMode, lkParticipant],
  );

  const signalInterviewEndToAgent = useCallback(() => {
    if (isDummyMode || !lkParticipant) {
      return;
    }

    const payload = {
      type: "finalize_interview",
      sessionId: reportLookupId,
      timestamp: Date.now(),
    };

    publishIdeEventData(payload);
  }, [isDummyMode, lkParticipant, publishIdeEventData, reportLookupId]);

  useEffect(() => {
    if (isDummyMode || !isCodingRound || !lkParticipant) {
      return;
    }

    const lastPublished = lastPublishedCodeSnapshotRef.current;
    const hasChangedSinceLastPublish =
      !lastPublished ||
      lastPublished.code !== latestCodeSnapshot.code ||
      lastPublished.language !== latestCodeSnapshot.language;

    if (hasChangedSinceLastPublish) {
      pendingCodeSnapshotRef.current = {
        code: latestCodeSnapshot.code,
        language: latestCodeSnapshot.language,
      };
    }
  }, [
    isDummyMode,
    isCodingRound,
    latestCodeSnapshot.code,
    latestCodeSnapshot.language,
    lkParticipant,
  ]);

  useEffect(() => {
    if (isDummyMode || !isCodingRound || !lkParticipant) {
      return;
    }

    const publishPendingSnapshot = () => {
      if (Date.now() < suppressIdePublishUntilRef.current) {
        return;
      }

      const pendingSnapshot = pendingCodeSnapshotRef.current;
      if (!pendingSnapshot) {
        return;
      }

      publishIdeEventData({
        type: "ide_change",
        code: pendingSnapshot.code,
        language: pendingSnapshot.language,
        source: "candidate",
        timestamp: Date.now(),
        intervalSec: effectiveHistorySnapshotIntervalSec,
      });

      lastPublishedCodeSnapshotRef.current = pendingSnapshot;
      pendingCodeSnapshotRef.current = null;
    };

    const initialTimer = window.setTimeout(publishPendingSnapshot, 800);
    const interval = window.setInterval(
      publishPendingSnapshot,
      effectiveHistorySnapshotIntervalSec * 1000,
    );

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [
    effectiveHistorySnapshotIntervalSec,
    isCodingRound,
    isDummyMode,
    lkParticipant,
    publishIdeEventData,
  ]);

  const handleCodeExecutionEvent = useCallback(
    (event: CodeExecutionEvent) => {
      if (isDummyMode || !isCodingRound) {
        return;
      }

      const source = event.source === "ai" ? "ai" : "candidate";

      if (event.testCaseLabel) {
        publishIdeEventData({
          type: "ide_test_case",
          source,
          language: event.language,
          testCase: event.testCaseLabel,
          stdin: event.stdin,
          timestamp: event.timestamp || Date.now(),
        });
      }

      publishIdeEventData({
        type: "ide_test_run",
        source,
        status: event.status,
        statusDesc: event.statusDesc,
        language: event.language,
        time: event.time,
        memory: event.memory,
        stdin: event.stdin,
        testCase: event.testCaseLabel,
        stdoutPreview: event.stdoutPreview,
        stderrPreview: event.stderrPreview,
        compileOutputPreview: event.compileOutputPreview,
        codeSize: event.codeSize,
        timestamp: event.timestamp || Date.now(),
      });
    },
    [isCodingRound, isDummyMode, publishIdeEventData],
  );

  useEffect(() => {
    if (isDummyMode || !isCodingRound || !livekitRoom) {
      return;
    }

    const decoder = new TextDecoder();

    const onDataReceived = (
      payloadData: Uint8Array | ArrayBuffer | string,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      try {
        if (topic && topic !== "ide_assistant") {
          return;
        }

        let payloadText = "";
        if (payloadData instanceof Uint8Array) {
          payloadText = decoder.decode(payloadData);
        } else if (payloadData instanceof ArrayBuffer) {
          payloadText = decoder.decode(new Uint8Array(payloadData));
        } else if (typeof payloadData === "string") {
          payloadText = payloadData;
        } else {
          return;
        }

        const payload = JSON.parse(payloadText);
        if (!payload || typeof payload !== "object") {
          return;
        }

        if (payload.type === "ide_apply") {
          console.debug("[IDE] Received ide_apply", {
            topic: topic || "",
            hasCode: typeof payload.code === "string" && payload.code.length > 0,
            language: payload.language || "",
          });
          applyAssistantCodeUpdate(payload);
          return;
        }

        if (payload.type === "ide_execute_request") {
          const requestIdRaw = payload.requestId || payload.request_id;
          const requestId =
            typeof requestIdRaw === "string" && requestIdRaw.trim()
              ? requestIdRaw
              : `ide-exec-${Date.now()}`;

          const incomingTestCases = Array.isArray(payload.testCases)
            ? payload.testCases
            : Array.isArray(payload.test_cases)
              ? payload.test_cases
              : undefined;

          setExecutionRequest({
            id: requestId,
            source: "ai",
            stdin: typeof payload.stdin === "string" ? payload.stdin : undefined,
            testCases: incomingTestCases,
          });

          const note =
            typeof payload.note === "string"
              ? payload.note.trim()
              : typeof payload.explanation === "string"
                ? payload.explanation.trim()
                : "";

          if (note) {
            const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            setChatMessages((prev) => [
              ...prev,
              {
                name: `${sessionDbData?.persona || "AI"}`,
                text: `[IDE] ${note}`,
                time,
              },
            ]);
          }

          setAssistantIdeNotice("AI requested test execution.");
          if (assistantNoticeTimerRef.current !== null) {
            window.clearTimeout(assistantNoticeTimerRef.current);
          }
          assistantNoticeTimerRef.current = window.setTimeout(() => {
            setAssistantIdeNotice("");
          }, 2200);
        }
      } catch (error) {
        console.error("Failed to parse IDE collaboration event", error);
      }
    };

    livekitRoom.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      livekitRoom.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [applyAssistantCodeUpdate, isCodingRound, isDummyMode, livekitRoom, sessionDbData?.persona]);

  // Fullscreen effect listener for IDE
  useEffect(() => {
     const onFullscreenChange = () => setIsIdeFullscreen(!!document.fullscreenElement);
     document.addEventListener('fullscreenchange', onFullscreenChange);
     return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
      if (!isIdeFullscreen && fullScreenContainerRef.current) {
          fullScreenContainerRef.current.requestFullscreen().catch(console.error);
      } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(console.error);
      }
  };

  // Timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- View & Layout States ---
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "speaker">("grid");
  const [localScreenShare, setLocalScreenShare] = useState(false); // mock screen share state

  const isScreenShareActive = !isDummyMode ? isScreenShareEnabled : localScreenShare;

  const handleToggleScreenShare = useCallback(() => {
     if (!isDummyMode) {
         toggleScreenShare();
     } else {
         setLocalScreenShare(prev => !prev);
     }
  }, [isDummyMode, toggleScreenShare]);

  const handleEndInterviewClick = useCallback(() => {
    signalInterviewEndToAgent();
    setShowReportModal(true);
  }, [signalInterviewEndToAgent]);

  // --- Arrays for Layout ---
  const remoteParticipants = !isDummyMode && livekitRoom ? Array.from(livekitRoom.remoteParticipants.values()) : [];
  const isAgentSpeaking = remoteParticipants.some(p => p.identity.startsWith('agent-') && p.isSpeaking);
  const isAgentConnected = remoteParticipants.some(p => p.identity.startsWith('agent-'));
  const isAgentListening = isAgentConnected && !isAgentSpeaking;

  // --- Session End / Report Modal ---
  const [showReportModal, setShowReportModal] = useState(false);
  const [modalReportData, setModalReportData] = useState<ModalReportSummary | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  useEffect(() => {
    if (!showReportModal) {
      return;
    }

    signalInterviewEndToAgent();
    void stopRoomRecording();
  }, [showReportModal, signalInterviewEndToAgent, stopRoomRecording]);

  useEffect(() => {
    if (showReportModal) {
      let cancelled = false;
      const pollStartedAt = Date.now();
      const maxPollDurationMs = 8 * 60 * 1000;
      setIsLoadingReport(true);
      const isTimeoutFallbackReport = (
        report:
          | {
              overallScore?: number;
              transcript?: Array<{ text?: string }>;
            }
          | null
          | undefined,
      ) => {
        if (!report || Number(report.overallScore ?? 0) !== 0) {
          return false;
        }

        if (!Array.isArray(report.transcript)) {
          return false;
        }

        return report.transcript.some(
          (entry: { text?: string } | undefined) =>
            typeof entry?.text === "string" && /timed out|fallback report/i.test(entry.text),
        );
      };

      const pollInterval = window.setInterval(() => {
        import("@/lib/backend").then(({ backendGet }) => {
          backendGet<ModalReportSummary>(`/api/reports/${reportLookupId}`)
            .then((data) => {
              const isPendingReport = String(data?.id || "").startsWith("rep_pending");
              const isTimeoutFallback = isTimeoutFallbackReport(data);

              if ((isPendingReport || isTimeoutFallback) && Date.now() - pollStartedAt > maxPollDurationMs) {
                if (!cancelled) {
                  setModalReportData(data);
                  setIsLoadingReport(false);
                }
                clearInterval(pollInterval);
                return;
              }

              // Also check if id is not a pending report, which means it might be the actual mapped report in DB
              if (!cancelled && data) {
                // If the id doesn't start with "rep_pending" and we have an id, it's the real report from the DB
                if (data.id && !isPendingReport) {
                  setModalReportData(data);
                  setIsLoadingReport(false);
                  clearInterval(pollInterval);
                } else if (!isPendingReport && data.overallScore !== undefined && !isTimeoutFallback) {
                  setModalReportData(data);
                  setIsLoadingReport(false);
                  clearInterval(pollInterval);
                }
              }
            })
            .catch(() => {
              if (Date.now() - pollStartedAt > maxPollDurationMs) {
                if (!cancelled) {
                  setIsLoadingReport(false);
                }
                clearInterval(pollInterval);
              }
            });
        });
      }, 3000);
      
      return () => {
        cancelled = true;
        clearInterval(pollInterval);
      };
    }
  }, [reportLookupId, showReportModal]);

  const aiAgentsFromPrompt = parseAiAgentsFromSystemPrompt(
    sessionDbData?.systemPrompt,
  );
  const fallbackPersona = sessionDbData?.persona || template?.persona || "Sarah";

  const isSyntheticAiParticipant = (participant: SessionParticipant) =>
    String(participant.email || "").trim().toLowerCase().startsWith("ai-agent+");

  const toAiInterviewerCard = (
    agent: SessionPromptAIAgent,
    index: number,
  ): InterviewParticipantCard => {
    const displayName = formatPersonaDisplayName(agent.persona);
    const designation =
      String(agent.designation || "").trim() || `Panel Interviewer ${index + 1}`;
    const name = `${displayName} (${designation})`;
    const avatarSeed = `${agent.persona}-${designation}-${index + 1}`.toLowerCase();

    return {
      id: `ai-agent-${index + 1}`,
      name,
      role: "Interviewer",
      avatar: `https://i.pravatar.cc/150?u=${avatarSeed}`,
      speaking: index === 0 ? isAgentSpeaking : false,
      isAI: true,
    };
  };

  let interviewers: InterviewParticipantCard[];
  let candidates: InterviewParticipantCard[];

  if (Array.isArray(sessionDbData?.participants) && sessionDbData.participants.length > 0) {
    const sessionParts = sessionDbData.participants;

    const aiPanelInterviewers = sessionParts.filter((participant) => {
      const roleNormalized = String(participant?.role || "").toLowerCase();
      return roleNormalized === "interviewer" && isSyntheticAiParticipant(participant);
    });

    if (aiPanelInterviewers.length > 0) {
      interviewers = aiPanelInterviewers.map((participant, index) => ({
        id: participant.id || `ai-${index + 1}`,
        name:
          participant.name ||
          `${formatPersonaDisplayName(sessionDbData?.persona)} (AI Interviewer)`,
        role: participant.role || "AI Interviewer",
        avatar: `https://i.pravatar.cc/150?u=${String(
          participant.name || participant.email || `ai-${index + 1}`,
        ).toLowerCase()}`,
        speaking: index === 0 ? isAgentSpeaking : false,
        isAI: true,
      }));
    } else if (aiAgentsFromPrompt.length > 0) {
      interviewers = aiAgentsFromPrompt.map(toAiInterviewerCard);
    } else {
      interviewers = [
        {
          id: "ai-1",
          name: `${formatPersonaDisplayName(fallbackPersona)} (Lead)`,
          role: "AI Agent",
          avatar: `https://i.pravatar.cc/150?u=${String(fallbackPersona).toLowerCase()}`,
          speaking: isAgentSpeaking,
          isAI: true,
        },
      ];
    }

    sessionParts.forEach((participant) => {
      const roleNormalized = String(participant?.role || "").toLowerCase();
      if (
        (roleNormalized === "interviewer" || roleNormalized === "observer") &&
        !isSyntheticAiParticipant(participant)
      ) {
        interviewers.push({
          id: participant.id || `human-${participant.email || Math.random().toString(36).slice(2, 6)}`,
          name:
            participant.name ||
            String(participant.email || "").split("@")[0] ||
            "Unknown",
          role: participant.role || "Observer",
          avatar: `https://i.pravatar.cc/150?u=${participant.email || participant.name || "participant"}`,
          speaking: false,
          isAI: false,
        });
      }
    });

    candidates = [
      {
        id: "self",
        name: currentUser?.name || "You",
        role: "Candidate",
        avatar: currentUser?.avatar,
        isLocal: true,
        camOn: isCameraEnabled,
        micOn: isMicEnabled,
      },
    ];

    const currentUserProfile = currentUser as User & { email?: string };
    const currentUserEmail = String(currentUserProfile.email || "").trim().toLowerCase();
    const currentUserName = String(currentUser?.name || "").trim().toLowerCase();

    sessionParts.forEach((participant) => {
      const roleNormalized = String(participant?.role || "").toLowerCase();
      const participantEmail = String(participant.email || "").trim().toLowerCase();
      const participantName = String(participant.name || "").trim().toLowerCase();
      const isCurrentUserParticipant =
        participant.id === "self" ||
        (currentUserEmail
          ? participantEmail === currentUserEmail
          : participantName === currentUserName);

      if (roleNormalized === "candidate" && !isCurrentUserParticipant) {
        candidates.push({
          id:
            participant.id ||
            `cand-${participant.email || Math.random().toString(36).slice(2, 6)}`,
          name:
            participant.name ||
            String(participant.email || "").split("@")[0] ||
            "Unknown",
          role: participant.role || "Candidate",
          avatar: `https://i.pravatar.cc/150?u=${participant.email || participant.name || "candidate"}`,
          isLocal: false,
          camOn: true,
          micOn: false,
        });
      }
    });
  } else {
    if (aiAgentsFromPrompt.length > 0) {
      interviewers = aiAgentsFromPrompt.map(toAiInterviewerCard);
    } else {
      interviewers = [
        {
          id: "ai-1",
          name: `${formatPersonaDisplayName(fallbackPersona)} (Lead)`,
          role: "AI Agent",
          avatar: `https://i.pravatar.cc/150?u=${String(fallbackPersona).toLowerCase()}`,
          speaking: isAgentSpeaking,
          isAI: true,
        },
      ];
    }

    candidates = [
      {
        id: "self",
        name: currentUser?.name || "You",
        role: "Candidate",
        avatar: currentUser?.avatar,
        isLocal: true,
        camOn: isCameraEnabled,
        micOn: isMicEnabled,
      },
    ];
  }

  const allParticipants: InterviewParticipantCard[] = [...interviewers, ...candidates];

  // Helper derived states for layout
  const effectiveViewMode = isScreenShareActive ? "presentation" : isCodingRound ? "coding" : (pinnedId || viewMode === "speaker") ? "speaker" : "grid";
  
  const mainParticipant = pinnedId 
      ? allParticipants.find(p => p.id === pinnedId) 
      : allParticipants.find((p) => p.speaking) || allParticipants[0];

  const currentWorkflowTourStep =
    workflowTourSteps[workflowTourStep] || workflowTourSteps[0];

  const closeWorkflowTour = useCallback(() => {
    try {
      window.localStorage.setItem(workflowTourStorageKey, "completed");
    } catch {
      // Ignore storage access failures.
    }
    setIsWorkflowTourOpen(false);
  }, [workflowTourStorageKey]);

  useEffect(() => {
    if (!isWorkflowTourOpen || !currentWorkflowTourStep) {
      setWorkflowTourRect(null);
      return;
    }

    const updateHighlight = () => {
      const targetElement = document.querySelector(
        currentWorkflowTourStep.target,
      ) as HTMLElement | null;

      if (!targetElement) {
        setWorkflowTourRect(null);
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      setWorkflowTourRect(rect);
    };

    const timer = window.setTimeout(() => {
      updateHighlight();
    }, 120);

    window.addEventListener("resize", updateHighlight);
    window.addEventListener("scroll", updateHighlight, true);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateHighlight);
      window.removeEventListener("scroll", updateHighlight, true);
    };
  }, [
    currentWorkflowTourStep,
    effectiveViewMode,
    isChatOpen,
    isNotesOpen,
    isWorkflowTourOpen,
  ]);

  const handlePin = (id: string) => {
      setPinnedId(prev => prev === id ? null : id);
  };

  // Helper component to render a single participant card
    const renderParticipant = (p: InterviewParticipantCard, isMainView = false) => {
      const isAI = Boolean(p.isAI);
      const isLocal = Boolean(p.isLocal);
      const micOn = isLocal ? isMicEnabled : p.micOn ?? true;
      const speaking = isLocal ? isMicEnabled : Boolean(p.speaking);
      const hasCam = isLocal ? isCameraEnabled : Boolean(p.camOn);
      const isCamOff = !hasCam;
      const isPinned = pinnedId === p.id;

      return (
        <Card
          key={p.id}
          data-tour={isAI ? "ai-agent-card" : undefined}
          className={cn(
            "group relative flex flex-col items-center justify-center overflow-hidden transition-all duration-300 w-full h-full",
            isMainView ? "min-h-[300px]" : (effectiveViewMode === "coding" ? "h-[180px]" : "min-h-[200px]"),
            isAI 
                ? "bg-linear-to-b from-indigo-50 to-white dark:from-indigo-950 dark:to-slate-950" 
                : "bg-secondary/40 shadow-sm",
            speaking && isAI ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-background shadow-[0_0_30px_-5px_rgba(99,102,241,0.4)] z-10 border-transparent" : 
            speaking && !isAI ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] z-10 border-transparent" : "border-border"
        )}
        >
             {/* Pin Button */}
             <Button
                variant="secondary"
                size="icon"
                className={cn(
                    "absolute top-3 right-3 z-30 h-8 w-8 rounded-full shadow-md bg-black/40 hover:bg-black/60 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity",
                    isPinned && "opacity-100 bg-indigo-500/80 hover:bg-indigo-600",
                    isMainView && "opacity-100"
                )}
                onClick={() => handlePin(p.id)}
             >
                 <Pin className="h-4 w-4" />
             </Button>

             {isAI && (
                 <div className="absolute inset-0 flex items-center justify-center opacity-10 dark:opacity-20">
                    {speaking && (
                        <div className="h-20 w-48 flex items-center justify-center gap-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="w-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ height: '20px', animationDelay: `${i * 0.15}s` }} />
                            ))}
                        </div>
                    )}
                 </div>
             )}

             {/* Local user camera feed */}
             {isLocal && hasCam && (
                 <div className="absolute inset-0 z-0">
                     <video
                         ref={localVideoRef}
                         autoPlay
                         playsInline
                         muted
                         className="w-full h-full object-cover transform -scale-x-100"
                     />
                     <div className="absolute inset-0 bg-linear-to-t from-black/60 dark:from-black/80 via-transparent to-transparent" />
                 </div>
             )}

             {!hasCam && (
                <div className="z-10 relative">
                    {speaking && isAI && <div className="absolute -inset-2 rounded-full bg-indigo-500/20 blur-lg animate-pulse"></div>}
                    {speaking && !isAI && <div className="absolute -inset-2 rounded-full bg-emerald-500/10 blur-md animate-pulse"></div>}
                    
                    <Avatar className={cn(
                        "border-2 transition-all duration-300 shadow-md",
                        isMainView ? "h-32 w-32" : (!isCodingRound ? "h-20 w-20" : "h-14 w-14"),
                        speaking && isAI ? "border-indigo-500 scale-105" : 
                        speaking && !isAI ? "border-emerald-500 scale-105" : "border-muted"
                    )}>
                        <AvatarImage src={p.avatar} />
                        <AvatarFallback>{p.name?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                </div>
             )}

             <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2 px-1 transition-all duration-300">
                {/* Name and Role */}
                <div className="space-y-0.5 text-left">
                    <h3 className={cn(
                        "text-sm font-semibold flex items-center gap-1 drop-shadow-md",
                        hasCam ? "text-white" : "text-foreground"
                    )}>
                        {p.name} {p.id === 'self' && "(You)"}
                    </h3>
                    <p className={cn(
                        "text-xs font-medium transition-colors drop-shadow-md",
                        speaking && isAI ? "text-indigo-400 dark:text-indigo-300" : 
                        speaking && !isAI ? "text-emerald-500 dark:text-emerald-400" : "text-muted-foreground"
                    )}>
                        {p.role}{isAI && speaking ? " · Speaking..." : isAI && isAgentListening ? " · Listening..." : ""}
                    </p>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-1 mt-0.5">
                    {isCamOff && (
                        <Badge variant="secondary" className="bg-black/60 dark:bg-black/80 text-white border-none p-0 w-6 h-6 flex items-center justify-center rounded-md shadow-sm">
                            <VideoOff className="w-3.5 h-3.5" />
                        </Badge>
                    )}
                    {(!micOn || (!isLocal && p.micOn === false)) && (
                        <Badge variant="secondary" className="bg-black/60 dark:bg-black/80 text-white border-none py-0 px-1.5 h-6 text-[10px] shadow-sm">
                            <MicOff className="w-3 h-3 text-red-500 mr-1"/>Muted
                        </Badge>
                    )}
                </div>

                {/* Audio Visualizer */}
                {micOn && (
                    <ParticipantVisualizer
                        stream={isLocal ? stream : undefined}
                        isActive={speaking}
                        variant={isAI ? "indigo" : "emerald"}
                        align="left"
                    />
                )}
             </div>
        </Card>
      );
  };

  const workflowTourTooltipStyle = (() => {
    if (typeof window === "undefined") {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      } as const;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = Math.min(360, viewportWidth - 32);
    const cardHeight = 220;

    if (!workflowTourRect) {
      return {
        top: `${Math.max(16, (viewportHeight - cardHeight) / 2)}px`,
        left: `${Math.max(16, (viewportWidth - cardWidth) / 2)}px`,
      } as const;
    }

    let top = workflowTourRect.bottom + 16;
    if (top + cardHeight > viewportHeight - 16) {
      top = workflowTourRect.top - cardHeight - 16;
    }
    top = Math.max(16, top);

    const left = Math.max(
      16,
      Math.min(workflowTourRect.left, viewportWidth - cardWidth - 16),
    );

    return {
      top: `${top}px`,
      left: `${left}px`,
    } as const;
  })();

  const workflowTourHighlightStyle = workflowTourRect
    ? {
        top: `${Math.max(8, workflowTourRect.top - 8)}px`,
        left: `${Math.max(8, workflowTourRect.left - 8)}px`,
        width: `${workflowTourRect.width + 16}px`,
        height: `${workflowTourRect.height + 16}px`,
        boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.7)",
      }
    : undefined;

  return (
    <div className={cn("flex flex-col gap-4 min-h-full w-full relative transition-all duration-300", isIdeFullscreen && "fixed inset-0 z-[100] bg-background h-screen w-screen p-4")} ref={fullScreenContainerRef}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="min-w-0 truncate text-xl font-bold leading-none sm:text-2xl">
              {sessionDbData?.title || template?.title || "Session"}
            </h1>
            <Badge variant="outline" className="shrink-0 bg-green-500/10 text-green-500 border-green-500/20">Live</Badge>
            <span className="shrink-0 tabular-nums text-sm text-muted-foreground">{formatTime(elapsedTime)}</span>

            {/* Configurable Invite / Share Meeting Button */}
            <Dialog>
              <DialogTrigger asChild>
                <Button data-tour="invite-users-trigger" variant="outline" size="sm" className="h-6 gap-1 text-xs sm:ml-2">
                    <Users className="h-3 w-3" />
                    Invite Users
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Share Meeting Session</DialogTitle>
                  <DialogDescription>
                    Invite others to join this interview or change link access settings.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold">General Access</h4>
                    <Select defaultValue="restricted">
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Access Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="restricted">Restricted (Only invited can join)</SelectItem>
                        <SelectItem value="anyone">Anyone with link</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex flex-col gap-2 mt-2">
                    <h4 className="text-sm font-semibold">Invite via Email</h4>
                    <div className="flex w-full items-center space-x-2">
                      <Input type="email" placeholder="user@example.com" />
                      <Button variant="secondary" onClick={() => {
                        alert("Mock Email sent to participant!");
                      }}>Send Invite</Button>
                    </div>
                  </div>

                  <div className="mt-4 p-4 border rounded bg-secondary/30">
                    <p className="text-xs text-muted-foreground mb-2">Meeting Link</p>
                    <div className="flex items-center space-x-2">
                      <Input readOnly value={typeof window !== 'undefined' ? window.location.href : ''} className="text-xs" />
                      <Button size="sm" onClick={() => {
                        navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : '');
                        alert("Meeting link copied to clipboard!");
                      }}>Copy</Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div className="ml-1 flex -space-x-2 sm:ml-4">
                {allParticipants.slice(0, 3).map((p) => (
                    <Avatar key={p.id} className="h-6 w-6 border border-muted drop-shadow-sm">
                        <AvatarImage src={p.avatar} />
                        <AvatarFallback className="text-[10px]">{p.name[0]}</AvatarFallback>
                    </Avatar>
                ))}
                {allParticipants.length > 3 && (
                     <div className="h-6 w-6 rounded-full bg-secondary border border-muted flex items-center justify-center text-[10px] text-muted-foreground shadow-sm">+{allParticipants.length - 3}</div>
                )}
            </div>
          </div>
        </div>
        <div className="flex w-full items-center justify-end gap-2 md:w-auto">
            <div className="hidden items-center rounded-lg border border-border bg-card p-0.5 shadow-sm mr-2 sm:flex">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("h-7 w-7 rounded-md", viewMode === 'grid' && "bg-secondary text-foreground")}
                    onClick={() => { setViewMode('grid'); setPinnedId(null); }}
                    title="Grid View"
                >
                    <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("h-7 w-7 rounded-md", viewMode === 'speaker' && "bg-secondary text-foreground")}
                    onClick={() => setViewMode('speaker')}
                    title="Speaker View"
                >
                    <UserIcon className="h-4 w-4" />
                </Button>
                <div className="w-px h-4 bg-border mx-1" />
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    onClick={toggleFullscreen}
                    title={isIdeFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                    {isIdeFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
            </div>
            <Button
              data-tour="session-notes-trigger"
              variant="outline"
              size="sm"
              className="h-8 px-2 sm:px-3"
              onClick={() => setIsNotesOpen(true)}
            >
              <FileText className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Notes</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 relative px-2 sm:px-3" onClick={() => setIsChatOpen(!isChatOpen)}>
              <MessageSquare className="mr-2 h-4 w-4" /> 
              <span className="hidden sm:inline">Chat</span>
              <Badge className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center bg-indigo-500">1</Badge>
            </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative -m-1 flex flex-1 min-h-0 p-1 pb-24 sm:pb-20">
         {(effectiveViewMode === 'grid' || (effectiveViewMode === 'coding' && isIdeCollapsed)) && (
             <div className={cn(
             "grid gap-3 flex-1 h-full w-full min-h-0 auto-rows-fr items-stretch content-stretch",
             allParticipants.length <= 1
               ? "grid-cols-1"
               : allParticipants.length === 2
               ? "grid-cols-1 lg:grid-cols-2"
               : allParticipants.length <= 4
                 ? "grid-cols-1 sm:grid-cols-2"
                 : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
             )}>
                 {allParticipants.map(p => (
               <div key={p.id} className="w-full h-full min-h-0">
                         {renderParticipant(p, false)}
                     </div>
                 ))}
             </div>
         )}
         
         {/* Floating Expand button for strictly collapsed IDE view */}
         {effectiveViewMode === 'coding' && isIdeCollapsed && (
             <div className="absolute left-4 top-4 z-40 animate-in slide-in-from-left-4 fade-in duration-300">
                <Button 
                   onClick={() => setIsIdeCollapsed(false)}
                   className="shadow-xl bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-4 h-11 flex items-center gap-2 transition-all hover:scale-105 ring-2 ring-background border-none"
                >
                   <ChevronRight className="w-4 h-4"/>
                   <span className="font-semibold text-sm">Open IDE</span>
                </Button>
             </div>
         )}

         {(effectiveViewMode !== 'grid' && !(effectiveViewMode === 'coding' && isIdeCollapsed)) && (
             <div className="flex flex-col lg:flex-row w-full h-full gap-3 relative p-2 transition-all duration-300">
                 {/* Primary Focus Area */}
                 <div className="flex flex-col transition-all duration-300 flex-1 min-h-[300px] min-w-0">
                     {effectiveViewMode === 'coding' && (
                          <Card className="flex border-border bg-card shadow-xl transition-all duration-300 flex-col flex-1">
                             {/* IDE Header Toolbar */}
                             <div 
                                role="button"
                                className="flex items-center justify-between shrink-0 cursor-pointer hover:bg-muted/50 transition-colors h-12 border-b border-border bg-muted/40 px-4" 
                                onClick={() => setIsIdeCollapsed(true)}
                             >
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="font-mono text-[10px] bg-indigo-500/10 text-indigo-500 border-indigo-500/20">Machine Coding</Badge>
                                    <span className="text-sm font-semibold text-foreground/80">Active Editor</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      History every {effectiveHistorySnapshotIntervalSec}s
                                    </span>
                                    {assistantIdeNotice ? (
                                      <span className="text-[10px] uppercase tracking-wide text-indigo-500">{assistantIdeNotice}</span>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background transition-colors" onClick={(e) => { e.stopPropagation(); setIsIdeCollapsed(true); }}>
                                        <ChevronLeft className="h-5 w-5" />
                                    </Button>
                                </div>
                             </div>

                             <div data-tour="code-editor-pane" className="flex-1 min-h-[300px] p-0 relative isolate">
                                <CodeEditor 
                                    value={code} 
                                    language={codeLanguage}
                                    onChange={(val) => setCode(val || "")} 
                                    onLanguageChange={(nextLanguage) => {
                                      setCodeLanguage(nextLanguage || "javascript");
                                    }}
                                    onCodeSnapshot={(nextCode, language) => {
                                      setLatestCodeSnapshot({ code: nextCode || "", language: language || "javascript" });
                                    }}
                                    onExecution={handleCodeExecutionEvent}
                                    executionRequest={executionRequest}
                                    onExecutionRequestComplete={(requestId) => {
                                      setExecutionRequest((current) =>
                                        current?.id === requestId ? null : current,
                                      );
                                    }}
                                    defaultLanguage="javascript" 
                                />
                             </div>
                          </Card>
                     )}
                     {effectiveViewMode === 'presentation' && (
                          <Card className="flex-1 overflow-hidden border-border bg-black flex items-center justify-center flex-col relative group shadow-xl">
                              <MonitorUp className="w-16 h-16 text-indigo-500/20 absolute z-0" />
                              {isDummyMode ? (
                                  <div className="z-10 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-md">
                                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                                      You are sharing your screen
                                  </div>
                              ) : (
                                  <LiveKitScreenShare />
                              )}
                          </Card>
                     )}
                     {effectiveViewMode === 'speaker' && mainParticipant && (
                          <div className="flex-1 flex p-2 -m-2">
                              {renderParticipant(mainParticipant, true)}
                          </div>
                     )}
                 </div>

                 {/* Sidebar Participants */}
                 <div className="shrink-0 custom-scrollbar transition-all duration-300 pr-1 h-[140px] lg:h-full lg:w-[280px] xl:w-[320px] overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden">
                    <div className="flex gap-2 p-1 min-h-full lg:flex-col justify-start">
                       {allParticipants
                           .filter(p => effectiveViewMode !== 'speaker' || p.id !== mainParticipant?.id)
                           .map(p => (
                            <div key={p.id} className="shrink-0 w-[200px] lg:w-full aspect-video">
                                {renderParticipant(p, false)}
                            </div>
                       ))}
                    </div>
                 </div>
             </div>
         )}
      </div>

      {/* Global Sheet Chat Panel (Full Viewport Height) */}
      {isChatOpen && (
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[380px] h-screen flex flex-col border-l border-border bg-background/95 dark:bg-card/90 backdrop-blur-3xl shadow-[-30px_0_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[-30px_0_60px_-15px_rgba(0,0,0,0.7)] animate-in slide-in-from-right duration-500 ease-out">
             {/* Header */}
             <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0 bg-secondary/10 dark:bg-black/20">
                <div className="flex flex-col text-left">
                   <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                      Session Chat
                   </h3>
                   <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5">Live Interview</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" onClick={() => setIsChatOpen(false)}>
                   <X className="w-5 h-5"/>
                </Button>
             </div>
             
             {/* Messages Area */}
             <ScrollArea className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-6">
                   {chatMessages.map((msg, i) => {
                        const isSelf = msg.name === "You" || (currentUser && msg.name === currentUser.name);
                        return (
                            <div key={i} className={cn("flex flex-col gap-1.5", isSelf ? "items-end text-right" : "items-start text-left")}>
                               {!isSelf && (
                                   <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight ml-1">{msg.name}</span>
                               )}
                               <div className={cn(
                                   "px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed max-w-[90%] shadow-md wrap-break-word whitespace-pre-wrap",
                                   isSelf
                                       ? "bg-indigo-600 text-white rounded-br-none shadow-indigo-500/20"
                                       : "bg-secondary/80 dark:bg-zinc-800/90 text-foreground dark:text-zinc-100 rounded-bl-none border border-border/50 shadow-black/5 dark:shadow-black/30"
                               )}>
                                   {msg.text}
                               </div>
                               <span className="text-[9px] text-muted-foreground px-1 mt-0.5 font-bold uppercase font-mono tracking-tighter">{msg.time}</span>
                            </div>
                        );
                   })}
                </div>
             </ScrollArea>

             {/* Input Area */}
             <div className="p-6 border-t border-border bg-secondary/10 dark:bg-black/40 shrink-0">
                 <form 
                    className="relative flex items-center" 
                    onSubmit={(e) => { 
                        e.preventDefault(); 
                        if(chatInput.trim()) { 
                            setChatMessages([...chatMessages, {
                                name: "You", 
                                text: chatInput, 
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            }]); 
                            setChatInput(""); 
                        } 
                    }}
                >
                     <input
                         value={chatInput} 
                         onChange={(e) => setChatInput(e.target.value)}
                         placeholder="Message session..." 
                         className="w-full h-12 rounded-xl border border-border bg-background dark:bg-zinc-900/40 backdrop-blur-sm pl-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all selection:bg-indigo-500/30"
                     />
                     <Button 
                        type="submit" 
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-1 top-1 h-10 w-10 text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-transparent transition-colors"
                    >
                         <Send className="w-5 h-5 scroll-translate-x-1 transition-transform" />
                     </Button>
                 </form>
             </div>
          </div>
      )}

      <Dialog open={isNotesOpen} onOpenChange={setIsNotesOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Session Notes</DialogTitle>
            <DialogDescription>
              Capture talking points, follow-up questions, and improvement cues in real time.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={sessionNotes}
            onChange={(event) => setSessionNotes(event.target.value)}
            className="min-h-64"
            placeholder="Write your notes here..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionNotes("")}>Clear</Button>
            <Button onClick={() => setIsNotesOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Controls Bar */}
      <div className="sticky bottom-2 z-50 mt-auto mx-auto w-full max-w-fit pointer-events-none px-2 pb-[max(env(safe-area-inset-bottom),0px)] sm:bottom-4 sm:px-4">
        <Card className="p-2 border-border bg-card/85 backdrop-blur-3xl shadow-2xl dark:shadow-black/50 pointer-events-auto rounded-full ring-1 ring-border/50 sm:p-3">
          <div className="flex flex-col items-center gap-2 px-1 sm:flex-row sm:justify-between sm:gap-6 sm:px-4">
            <div data-tour="media-controls" className="flex bg-background/50 rounded-full p-1 gap-1 border border-border shadow-inner">
               {/* Mic Selector box */}
               <div className="h-10 flex items-stretch rounded-full hover:bg-background/80 transition-colors overflow-hidden shrink-0 sm:h-12">
                 <Button 
                   type="button"
                   variant={!isMicEnabled ? "destructive" : "ghost"} 
                   className={cn("h-full px-3 rounded-none transition-colors sm:px-4", isMicEnabled && "bg-transparent hover:bg-secondary")}
                   onClick={(event) => {
                     event.preventDefault();
                     toggleMic();
                   }}
                 >
                   {!isMicEnabled ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />}
                 </Button>
                 <div className="w-px bg-border my-2" />
                 <Select value={activeMicId} onValueChange={setActiveMicId}>
                    <SelectTrigger className="w-6 h-full! rounded-none border-0 bg-transparent p-0 flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 [&>span]:hidden focus:ring-0 shadow-none hover:bg-secondary transition-colors cursor-pointer z-10 !data-[size=default]:h-full !data-[size=sm]:h-full">
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" sideOffset={8} className="w-[240px] bg-popover border-border text-popover-foreground">
                       {microphones.map(m => (
                         <SelectItem key={m.deviceId} value={m.deviceId} className="text-xs">{m.label || `Mic ${m.deviceId.slice(0,5)}`}</SelectItem>
                       ))}
                    </SelectContent>
                 </Select>
               </div>

               {/* Cam Selector box */}
               <div className="h-10 flex items-stretch rounded-full hover:bg-background/80 transition-colors overflow-hidden shrink-0 sm:h-12">
                 <Button 
                   type="button"
                   variant={!isCameraEnabled ? "destructive" : "ghost"} 
                   className={cn("h-full px-3 rounded-none transition-colors sm:px-4", isCameraEnabled && "bg-transparent hover:bg-secondary")}
                   onClick={(event) => {
                     event.preventDefault();
                     toggleCam();
                   }}
                 >
                   {!isCameraEnabled ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5 text-blue-500 dark:text-blue-400" />}
                 </Button>
                 <div className="w-px bg-border my-2" />
                 <Select value={activeCameraId} onValueChange={setActiveCameraId}>
                    <SelectTrigger className="w-6 h-full! rounded-none border-0 bg-transparent p-0 flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 [&>span]:hidden focus:ring-0 shadow-none hover:bg-secondary transition-colors cursor-pointer z-10 !data-[size=default]:h-full !data-[size=sm]:h-full">
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" sideOffset={8} className="w-[240px] bg-popover border-border text-popover-foreground">
                       {cameras.map(c => (
                         <SelectItem key={c.deviceId} value={c.deviceId} className="text-xs">{c.label || `Camera ${c.deviceId.slice(0,5)}`}</SelectItem>
                       ))}
                    </SelectContent>
                 </Select>
               </div>
            </div>

            <div className="flex items-center gap-4">
               {/* Screen Share Button */}
               <Button
                  variant={isScreenShareActive ? "default" : "secondary"}
                  size="icon"
                  className={cn("h-11 w-11 rounded-full shadow-lg transition-all shrink-0 sm:h-14 sm:w-14", isScreenShareActive && "bg-indigo-600 hover:bg-indigo-700")}
                  onClick={handleToggleScreenShare}
               >
                  <MonitorUp className="h-5 w-5 sm:h-6 sm:w-6" />
               </Button>
            
               {/* Center exit button — opens post-session report */}
              <Button 
                variant="destructive" 
                size="icon" 
                className="h-11 w-11 rounded-full shadow-xl hover:bg-red-600 hover:scale-105 transition-all outline-4 outline-red-900/20 shrink-0 mx-1 sm:h-14 sm:w-14 sm:mx-2"
                title="End Interview"
                onClick={handleEndInterviewClick}
              >
                <PhoneOff className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="hover:bg-secondary text-muted-foreground rounded-full">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {isWorkflowTourOpen && currentWorkflowTourStep && (
        <div className="fixed inset-0 z-240">
          {workflowTourHighlightStyle ? (
            <div
              className="pointer-events-none absolute rounded-xl border-2 border-indigo-400"
              style={workflowTourHighlightStyle}
            />
          ) : (
            <div className="absolute inset-0 bg-slate-950/70" />
          )}

          <div
            className="absolute w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-2xl"
            style={workflowTourTooltipStyle}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
              Guided Workflow
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              {currentWorkflowTourStep.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-6">
              {currentWorkflowTourStep.description}
            </p>

            <div className="mt-3 flex items-center gap-2">
              {workflowTourSteps.map((step, index) => (
                <span
                  key={step.key}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    index <= workflowTourStep ? "bg-indigo-500" : "bg-muted",
                  )}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={closeWorkflowTour}>
                Skip
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={workflowTourStep === 0}
                  onClick={() =>
                    setWorkflowTourStep((step) => Math.max(0, step - 1))
                  }
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (workflowTourStep >= workflowTourSteps.length - 1) {
                      closeWorkflowTour();
                      return;
                    }
                    setWorkflowTourStep((step) =>
                      Math.min(workflowTourSteps.length - 1, step + 1),
                    );
                  }}
                >
                  {workflowTourStep >= workflowTourSteps.length - 1 ? "Finish" : "Next"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* End-of-session Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-linear-to-r from-indigo-600 to-indigo-500 p-6 text-white relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-10">
                <Trophy className="w-32 h-32 -mt-4 -mr-4" />
              </div>
              <div className="relative z-10">
                <p className="text-indigo-200 text-sm font-medium uppercase tracking-widest mb-1">Session Complete</p>
                <h2 className="text-2xl font-bold">{sessionDbData?.title || template?.title || "Interview"}</h2>
                <p className="text-indigo-200 text-sm mt-1">{formatTime(elapsedTime)} duration</p>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
              {isLoadingReport ? (
                <div className="col-span-3 p-8 text-center text-muted-foreground flex flex-col items-center justify-center space-y-2">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">Analyzing session...</p>
                </div>
              ) : (
                [
                  { label: "Overall", value: modalReportData ? `${modalReportData.overallScore}%` : "--", color: "text-primary" },
                  { label: "Hard Skills", value: modalReportData ? `${modalReportData.hardSkillsScore}%` : "--", color: "text-blue-500" },
                  { label: "Soft Skills", value: modalReportData ? `${modalReportData.softSkillsScore}%` : "--", color: "text-emerald-500" },
                ].map((s) => (
                  <div key={s.label} className="p-4 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))
              )}
            </div>
            {isFinalizingRecording && (
              <div className="px-6 pt-4 text-xs text-muted-foreground">
                Finalizing interview recording...
              </div>
            )}
            <div className="p-6 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Session Highlights</h3>
              <div className="space-y-2">
                {isLoadingReport ? (
                  <div className="space-y-2">
                    <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
                    <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
                  </div>
                ) : (
                  (modalReportData?.highlights?.slice(0, 3) || []).map((text: string, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm bg-muted/40 rounded-lg px-3 py-2.5">
                      <span className="text-base shrink-0">✨</span>
                      <span className="text-foreground/80">{text}</span>
                    </div>
                  ))
                )}
                {!isLoadingReport && (!modalReportData?.highlights || modalReportData.highlights.length === 0) && (
                  <div className="flex items-start gap-3 text-sm bg-muted/40 rounded-lg px-3 py-2.5">
                    <span className="text-foreground/80">No highlights available yet.</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button
                variant="outline"
                className="flex-1"
                disabled={isFinalizingRecording}
                onClick={async () => {
                  await stopRoomRecording();
                  setShowReportModal(false);
                  router.push("/");
                }}
              >
                Leave Session
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={isFinalizingRecording}
                onClick={async () => {
                  await stopRoomRecording();
                  setShowReportModal(false);
                  router.push(`/report/${reportLookupId}`);
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                View Full Report
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveKitScreenShare() {
  const tracks = useTracks([Track.Source.ScreenShare]);
  const trackRef = tracks[0];

  if (!trackRef) {
     return (
         <div className="z-10 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-md">
             <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
             Starting screen share...
         </div>
     );
  }

  return <VideoTrack trackRef={trackRef} className="w-full h-full object-contain absolute inset-0 z-10 bg-black" />;
}
