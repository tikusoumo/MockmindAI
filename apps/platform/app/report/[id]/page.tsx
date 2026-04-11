
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Share2,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Play,
  Pause,
  MessageSquare,
  Mic,
  Activity,
  User,
  Bot,
  ClipboardCheck,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ReportData } from "@/data/mockData";
import { backendGet, backendPost, getBackendUrl } from "@/lib/backend";
import { fallbackReport } from "@/lib/fallback-data";
import { toast } from "sonner";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type TranscriptDisplayEntry = {
  speaker: "You" | "Interviewer";
  text: string;
  timestamp: string;
  timestampSeconds: number | null;
};

type CoachResponse = {
  answer: string;
  highlights: string[];
  suggestedQuestions: string[];
  generatedAt: string;
};

type CodeHistoryDisplayEntry = {
  id: string;
  actor: string;
  eventType: string;
  summary: string;
  timestampLabel: string;
  timestampOrder: number;
  language?: string;
  code?: string;
  details?: Record<string, unknown>;
};

type SessionAudioTrack = {
  id: string;
  label: string;
  speaker: string;
  audioUrl?: string;
};

const QUESTION_STARTERS = [
  "tell",
  "what",
  "how",
  "why",
  "can",
  "could",
  "would",
  "describe",
  "walk",
  "explain",
];

const COMMON_FILLER_WORDS = [
  "um",
  "uh",
  "like",
  "you know",
  "basically",
  "actually",
  "literally",
  "kind of",
  "sort of",
];

function parseTimestampToSeconds(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const direct = Number(value);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function normalizeSpeaker(rawSpeaker: string): "You" | "Interviewer" {
  const speaker = rawSpeaker.trim().toLowerCase();
  if (
    speaker === "you" ||
    speaker === "candidate" ||
    speaker === "user" ||
    speaker === "participant"
  ) {
    return "You";
  }

  return "Interviewer";
}

function isQuestionText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.endsWith("?")) {
    return true;
  }
  return QUESTION_STARTERS.some((prefix) => normalized.startsWith(`${prefix} `));
}

function countOccurrences(haystack: string, needle: string): number {
  const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escapedNeedle}\\b`, "gi");
  const matches = haystack.match(pattern);
  return matches ? matches.length : 0;
}

function deriveQuestionsFromTranscript(
  transcript: TranscriptDisplayEntry[],
): ReportData["questions"] {
  const derived: ReportData["questions"] = [];

  transcript.forEach((entry, index) => {
    if (entry.speaker !== "Interviewer" || !isQuestionText(entry.text)) {
      return;
    }

    const nextAnswer = transcript
      .slice(index + 1)
      .find((candidateEntry) => candidateEntry.speaker === "You");

    derived.push({
      id: derived.length + 1,
      question: entry.text,
      userAnswerSummary: nextAnswer
        ? nextAnswer.text
        : "Candidate response could not be captured for this question.",
      aiFeedback:
        "Detailed per-question AI feedback is unavailable for this session. Capture was partial.",
      score: 0,
      improvements: [
        "Re-run the interview to capture a full question-level analysis.",
      ],
    });
  });

  return derived;
}

function deriveFillerWordsFromTranscript(
  transcript: TranscriptDisplayEntry[],
): ReportData["fillerWordsAnalysis"] {
  const candidateText = transcript
    .filter((entry) => entry.speaker === "You")
    .map((entry) => entry.text.toLowerCase())
    .join(" ");

  if (!candidateText) {
    return [];
  }

  return COMMON_FILLER_WORDS
    .map((word) => ({ word, count: countOccurrences(candidateText, word) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function derivePacingFromTranscript(
  transcript: TranscriptDisplayEntry[],
): ReportData["pacingAnalysis"] {
  const candidateEntries = transcript.filter(
    (entry) => entry.speaker === "You" && entry.timestampSeconds !== null,
  );

  if (candidateEntries.length < 2) {
    return [];
  }

  const points: ReportData["pacingAnalysis"] = [];
  for (let i = 1; i < candidateEntries.length; i += 1) {
    const prev = candidateEntries[i - 1];
    const curr = candidateEntries[i];
    const prevTs = prev.timestampSeconds;
    const currTs = curr.timestampSeconds;
    if (prevTs === null || currTs === null) {
      continue;
    }

    const delta = currTs - prevTs;
    if (delta <= 0) {
      continue;
    }

    const wordCount = curr.text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount === 0) {
      continue;
    }

    const wpm = Math.round((wordCount / delta) * 60);
    if (Number.isFinite(wpm) && wpm > 0) {
      points.push({
        time: curr.timestamp,
        wpm: Math.max(60, Math.min(220, wpm)),
      });
    }
  }

  return points;
}

function resolveMediaUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const backendBase = getBackendUrl();
  if (url.startsWith("/")) {
    return `${backendBase}${url}`;
  }

  return `${backendBase}/${url}`;
}

const REPORT_POLL_INTERVAL_MS = 5000;
const REPORT_POLL_MAX_DURATION_MS = 5 * 60 * 1000;
const AUDIO_RECOVERY_POLL_INTERVAL_MS = 4000;
const AUDIO_RECOVERY_POLL_MAX_DURATION_MS = 20 * 1000;

function withNoCache(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}_ts=${Date.now()}`;
}

function parseDownloadFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return fallback;
}

function hasTimeoutFallbackMessage(report: ReportData): boolean {
  if (!Array.isArray(report.transcript)) {
    return false;
  }

  return report.transcript.some(
    (entry) =>
      typeof entry?.text === "string" &&
      /timed out|fallback report/i.test(entry.text),
  );
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const [report, setReport] = useState<ReportData>(fallbackReport);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAudioQuestionId, setActiveAudioQuestionId] = useState<number | null>(null);
  const [downloadingQuestionId, setDownloadingQuestionId] = useState<number | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isResolvingAudio, setIsResolvingAudio] = useState(false);
  const [audioRecoveryExhausted, setAudioRecoveryExhausted] = useState(false);
  const [audioLoadErrorByQuestion, setAudioLoadErrorByQuestion] = useState<Record<number, boolean>>({});
  const [isCoachPanelOpen, setIsCoachPanelOpen] = useState(false);
  const [coachPrompt, setCoachPrompt] = useState("");
  const [coachAnswer, setCoachAnswer] = useState<string>("");
  const [coachHighlights, setCoachHighlights] = useState<string[]>([]);
  const [coachSuggestedQuestions, setCoachSuggestedQuestions] = useState<string[]>([]);
  const [isAskingCoach, setIsAskingCoach] = useState(false);
  const [isSharingReport, setIsSharingReport] = useState(false);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);
  const audioElementRefs = useRef<Record<number, HTMLAudioElement | null>>({});

  const endpoint = id === 'latest' ? '/api/reports/latest' : `/api/reports/${id}`;

  const toggleQuestionAudioPlayback = (questionId: number) => {
    const targetAudio = audioElementRefs.current[questionId];
    if (!targetAudio) {
      return;
    }

    if (activeAudioQuestionId !== null && activeAudioQuestionId !== questionId) {
      const previousAudio = audioElementRefs.current[activeAudioQuestionId];
      if (previousAudio && !previousAudio.paused) {
        previousAudio.pause();
      }
    }

    if (targetAudio.paused) {
      setAudioLoadErrorByQuestion((prev) => ({ ...prev, [questionId]: false }));
      targetAudio.play().catch(() => {
        setAudioLoadErrorByQuestion((prev) => ({ ...prev, [questionId]: true }));
      });
      return;
    }

    targetAudio.pause();
  };

  const downloadQuestionAudio = async (questionId: number, audioUrl: string) => {
    setDownloadingQuestionId(questionId);

    try {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch recording: ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Recording blob is empty");
      }

      const contentType = blob.type.toLowerCase();
      let extension = "webm";
      if (contentType.includes("mp4")) extension = "mp4";
      else if (contentType.includes("mpeg") || contentType.includes("mp3")) extension = "mp3";
      else if (contentType.includes("wav")) extension = "wav";
      else if (contentType.includes("ogg")) extension = "ogg";

      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `question-${questionId}-recording.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(audioUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingQuestionId((current) => (current === questionId ? null : current));
    }
  };

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);

    backendGet<ReportData>(withNoCache(endpoint))
      .then((next) => {
        if (!cancelled) {
          setReport(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReport(fallbackReport);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  useEffect(() => {
    setActiveAudioQuestionId(null);
    setAudioLoadErrorByQuestion({});
    setAudioRecoveryExhausted(false);
    setCoachPrompt("");
    setCoachAnswer("");
    setCoachHighlights([]);
    setCoachSuggestedQuestions([]);
    setIsCoachPanelOpen(false);
    setSelectedSnapshotIndex(0);
  }, [report.id]);

  useEffect(() => {
    const currentAudioRefs = audioElementRefs.current;
    return () => {
      Object.values(currentAudioRefs).forEach((audio) => {
        if (audio && !audio.paused) {
          audio.pause();
        }
      });
    };
  }, []);

  const isPendingReport = report?.id?.startsWith("rep_pending_") ?? false;
  const isTimeoutFallbackReport =
    Number(report?.overallScore ?? 0) === 0 && hasTimeoutFallbackMessage(report);
  const isAwaitingFinalReport = isPendingReport || isTimeoutFallbackReport;
  const sharedRecordingAudioUrl = resolveMediaUrl(report.recordingAudioUrl);
  const hasServerQuestionAudioGap =
    Array.isArray(report.questions) &&
    report.questions.length > 0 &&
    report.questions.some((question) => !question?.audioUrl) &&
    !sharedRecordingAudioUrl;

  useEffect(() => {
    if (isLoading || !isAwaitingFinalReport) {
      return;
    }

    let cancelled = false;
    const pollStartedAt = Date.now();

    const interval = window.setInterval(async () => {
      try {
        const next = await backendGet<ReportData>(withNoCache(endpoint));
        if (cancelled) {
          return;
        }

        setReport(next);

        const nextPending = String(next?.id || "").startsWith("rep_pending_");
        const nextTimeoutFallback =
          Number(next?.overallScore ?? 0) === 0 && hasTimeoutFallbackMessage(next);

        if (!nextPending && !nextTimeoutFallback) {
          clearInterval(interval);
          return;
        }

        if (Date.now() - pollStartedAt > REPORT_POLL_MAX_DURATION_MS) {
          clearInterval(interval);
        }
      } catch {
        if (Date.now() - pollStartedAt > REPORT_POLL_MAX_DURATION_MS) {
          clearInterval(interval);
        }
      }
    }, REPORT_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [endpoint, isAwaitingFinalReport, isLoading]);

  useEffect(() => {
    if (isLoading || isAwaitingFinalReport || !hasServerQuestionAudioGap || audioRecoveryExhausted) {
      setIsResolvingAudio(false);
      return;
    }

    let cancelled = false;
    const pollStartedAt = Date.now();
    setIsResolvingAudio(true);

    const interval = window.setInterval(async () => {
      try {
        const next = await backendGet<ReportData>(withNoCache(endpoint));
        if (cancelled) {
          return;
        }

        setReport(next);

        const nextHasAudioGap =
          Array.isArray(next.questions) &&
          next.questions.length > 0 &&
          next.questions.some((question) => !question?.audioUrl);

        if (!nextHasAudioGap) {
          setIsResolvingAudio(false);
          setAudioRecoveryExhausted(false);
          clearInterval(interval);
          return;
        }

        if (Date.now() - pollStartedAt > AUDIO_RECOVERY_POLL_MAX_DURATION_MS) {
          setIsResolvingAudio(false);
          setAudioRecoveryExhausted(true);
          clearInterval(interval);
        }
      } catch {
        if (Date.now() - pollStartedAt > AUDIO_RECOVERY_POLL_MAX_DURATION_MS) {
          if (!cancelled) {
            setIsResolvingAudio(false);
            setAudioRecoveryExhausted(true);
          }
          clearInterval(interval);
        }
      }
    }, AUDIO_RECOVERY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      setIsResolvingAudio(false);
      clearInterval(interval);
    };
  }, [audioRecoveryExhausted, endpoint, hasServerQuestionAudioGap, isAwaitingFinalReport, isLoading]);

  const normalizedTranscript = useMemo<TranscriptDisplayEntry[]>(() => {
    const reportWithLegacyTranscript = report as ReportData & {
      transcripts?: ReportData["transcript"];
    };

    const directTranscript = Array.isArray(report.transcript) ? report.transcript : [];
    const legacyTranscript = Array.isArray(reportWithLegacyTranscript.transcripts)
      ? reportWithLegacyTranscript.transcripts
      : [];

    const sourceEntries =
      directTranscript.length > 0
        ? directTranscript
        : legacyTranscript;

    return sourceEntries
      .filter((entry) => typeof entry?.text === "string" && entry.text.trim().length > 0)
      .map((entry) => {
        const timestampSeconds = parseTimestampToSeconds(
          entry.timestamp as string | number | undefined,
        );
        return {
          speaker: normalizeSpeaker(entry.speaker),
          text: entry.text,
          timestamp:
            timestampSeconds === null
              ? String(entry.timestamp ?? "--:--")
              : formatSeconds(timestampSeconds),
          timestampSeconds,
        };
      });
  }, [report]);

  const questions = useMemo<ReportData["questions"]>(() => {
    if (Array.isArray(report.questions) && report.questions.length > 0) {
      return report.questions;
    }
    return deriveQuestionsFromTranscript(normalizedTranscript);
  }, [report.questions, normalizedTranscript]);

  const fillerWords = useMemo<ReportData["fillerWordsAnalysis"]>(() => {
    if (Array.isArray(report.fillerWordsAnalysis) && report.fillerWordsAnalysis.length > 0) {
      return report.fillerWordsAnalysis;
    }
    return deriveFillerWordsFromTranscript(normalizedTranscript);
  }, [report.fillerWordsAnalysis, normalizedTranscript]);

  const pacingData = useMemo<ReportData["pacingAnalysis"]>(() => {
    if (Array.isArray(report.pacingAnalysis) && report.pacingAnalysis.length > 0) {
      return report.pacingAnalysis;
    }
    return derivePacingFromTranscript(normalizedTranscript);
  }, [report.pacingAnalysis, normalizedTranscript]);

  const swot = {
    strengths: Array.isArray(report.swot?.strengths) ? report.swot.strengths : [],
    weaknesses: Array.isArray(report.swot?.weaknesses) ? report.swot.weaknesses : [],
    opportunities: Array.isArray(report.swot?.opportunities) ? report.swot.opportunities : [],
    threats: Array.isArray(report.swot?.threats) ? report.swot.threats : [],
  };

  const behavioralEntries = Object.entries(report.behavioralAnalysis || {});
  const resources = Array.isArray(report.resources) ? report.resources : [];
  const radarData = Array.isArray(report.radarData) ? report.radarData : [];
  const timelineData = Array.isArray(report.timelineData) ? report.timelineData : [];

  const codeHistory = useMemo<CodeHistoryDisplayEntry[]>(() => {
    const rawEntries = Array.isArray(report.codeHistory) ? report.codeHistory : [];
    const normalizedEntries: CodeHistoryDisplayEntry[] = [];

    rawEntries.forEach((entry, index) => {
      const snakeCaseEventType = (entry as unknown as { event_type?: string }).event_type;
      const summary = String(entry.summary || "").trim() || "Code snapshot updated.";

      const rawTimestamp = entry.timestamp;
      const timestampSeconds = parseTimestampToSeconds(
        rawTimestamp as string | number | undefined,
      );

      const detailsValue = entry.details;
      const details =
        detailsValue && typeof detailsValue === "object" && !Array.isArray(detailsValue)
          ? (detailsValue as Record<string, unknown>)
          : undefined;
      const detailsSnapshotId =
        typeof details?.snapshotId === "string"
          ? details.snapshotId
          : typeof details?.snapshot_id === "string"
            ? details.snapshot_id
            : "";
      const snapshotId =
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : detailsSnapshotId || `SNAP-${String(index + 1).padStart(4, "0")}`;
      const snapshotCode =
        typeof entry.code === "string"
          ? entry.code
          : typeof details?.codeSnapshot === "string"
            ? details.codeSnapshot
            : typeof details?.code === "string"
              ? details.code
              : undefined;

      normalizedEntries.push({
        id: snapshotId,
        actor: String(entry.actor || "system").toLowerCase(),
        eventType: String(entry.eventType || snakeCaseEventType || "note").toLowerCase(),
        summary,
        timestampLabel:
          timestampSeconds === null
            ? String(rawTimestamp || "--:--")
            : formatSeconds(timestampSeconds),
        timestampOrder: timestampSeconds ?? index,
        language: typeof entry.language === "string" ? entry.language : undefined,
        code: snapshotCode,
        details,
      });
    });

    return normalizedEntries.sort((a, b) => a.timestampOrder - b.timestampOrder);
  }, [report]);

  useEffect(() => {
    if (codeHistory.length === 0) {
      setSelectedSnapshotIndex(0);
      return;
    }
    setSelectedSnapshotIndex(codeHistory.length - 1);
  }, [codeHistory.length, report.id]);

  const activeSnapshot = codeHistory[Math.min(selectedSnapshotIndex, Math.max(codeHistory.length - 1, 0))];
  const activeSnapshotCode =
    typeof activeSnapshot?.code === "string" && activeSnapshot.code.length > 0
      ? activeSnapshot.code
      : "";
  const activeSnapshotLines =
    activeSnapshotCode.length > 0 ? activeSnapshotCode.split("\n") : [""];
  const normalizedActiveActor = (activeSnapshot?.actor || "system").toLowerCase();
  const normalizedActiveType = (activeSnapshot?.eventType || "note").toLowerCase();
  const activeActorBadgeVariant =
    normalizedActiveActor === "ai"
      ? "secondary"
      : normalizedActiveActor === "user" || normalizedActiveActor === "candidate"
        ? "default"
        : "outline";
  const activeSnapshotStatus =
    typeof activeSnapshot?.details?.status === "string"
      ? activeSnapshot.details.status
      : "";

  const sessionAudioTracks = useMemo<SessionAudioTrack[]>(() => {
    const rawTracks = Array.isArray(report.audioTracks) ? report.audioTracks : [];

    const normalizedTracks = rawTracks
      .map((track, index) => {
        const id = String(track.id || `track-${index + 1}`);
        const label = String(track.label || track.speaker || `Track ${index + 1}`);
        const speaker = String(track.speaker || "Speaker");
        const explicitUrl =
          typeof track.audioUrl === "string"
            ? resolveMediaUrl(track.audioUrl)
            : undefined;

        return {
          id,
          label,
          speaker,
          audioUrl: explicitUrl || sharedRecordingAudioUrl,
        };
      })
      .filter((track) => Boolean(track.label));

    if (normalizedTracks.length > 0) {
      return normalizedTracks;
    }

    if (!sharedRecordingAudioUrl) {
      return [];
    }

    return [
      {
        id: "candidate-audio",
        label: "Candidate Audio",
        speaker: "You",
        audioUrl: sharedRecordingAudioUrl,
      },
      {
        id: "ai-audio",
        label: "AI/Interviewer Audio",
        speaker: "Interviewer",
        audioUrl: sharedRecordingAudioUrl,
      },
    ];
  }, [report.audioTracks, sharedRecordingAudioUrl]);

  const buildLocalCoachFallback = (question: string): CoachResponse => {
    const lowerQuestion = question.toLowerCase();
    const strengths = Array.isArray(swot.strengths) ? swot.strengths : [];
    const weaknesses = Array.isArray(swot.weaknesses) ? swot.weaknesses : [];

    const codeEvents = codeHistory.length;
    const testEvents = codeHistory.filter((entry) => entry.eventType.includes("test")).length;
    const audioCount = sessionAudioTracks.filter((track) => Boolean(track.audioUrl)).length;

    const highlights: string[] = [
      `Overall score: ${report.overallScore}/100`,
      `Hard skills: ${report.hardSkillsScore}/100`,
      `Soft skills: ${report.softSkillsScore}/100`,
      `Code events captured: ${codeEvents}`,
    ];

    if (strengths[0]) {
      highlights.push(`Strength: ${strengths[0]}`);
    }
    if (weaknesses[0]) {
      highlights.push(`Improve: ${weaknesses[0]}`);
    }

    let answer = `Based on this report, focus first on improving clarity and structure while maintaining your technical momentum.`;

    if (lowerQuestion.includes("test")) {
      answer =
        testEvents > 0
          ? `I can see ${testEvents} testing-related events. Prioritize writing explicit edge-case tests first, then add one positive-path and one failure-path assertion per function.`
          : `No explicit test-run events were captured. In the next round, narrate your test plan (happy path, edge case, failure case) and run them incrementally.`;
    } else if (lowerQuestion.includes("audio") || lowerQuestion.includes("record")) {
      answer =
        audioCount > 0
          ? `Audio tracks are available (${audioCount}). Use them to review pacing and filler words after each mock interview.`
          : `This report currently has no accessible audio track from the API. The rest of your report data is still usable for focused practice.`;
    } else if (lowerQuestion.includes("code") || lowerQuestion.includes("history")) {
      answer =
        codeEvents > 0
          ? `Your coding timeline shows ${codeEvents} events. Tighten your workflow by stating intent before edits, then validating with quick tests after each meaningful change.`
          : `Coding history wasn't returned by the backend, so I inferred events from transcript context. Keep verbalizing code decisions to preserve evaluable history.`;
    }

    return {
      answer,
      highlights: highlights.slice(0, 6),
      suggestedQuestions: [
        "What is the single biggest weakness to fix next week?",
        "Give me a 3-step coding-round checklist.",
        "How should I present test cases in interviews?",
      ],
      generatedAt: new Date().toISOString(),
    };
  };

  const handleExportPdf = async () => {
    if (typeof window === "undefined" || isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);
    try {
      const backendBase = getBackendUrl();
      const reportIdForExport = id || report.id || "latest";
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${backendBase}/api/reports/${reportIdForExport}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error(`Failed to export report PDF: ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Exported PDF is empty");
      }

      const fileName = parseDownloadFileName(
        response.headers.get("content-disposition"),
        `interview-report-${reportIdForExport}.pdf`,
      );
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Failed to export custom report PDF", error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleAskCoach = async () => {
    const question = coachPrompt.trim();
    if (!question || isAskingCoach) {
      if (!question) {
        toast.error("Enter a question to ask your AI coach.");
      }
      return;
    }

    const reportIdForCoach = id || report.id || "latest";
    setIsAskingCoach(true);

    try {
      const response = await backendPost<CoachResponse>(
        `/api/reports/${reportIdForCoach}/ask`,
        { question },
      );

      setCoachAnswer(response.answer || "");
      setCoachHighlights(Array.isArray(response.highlights) ? response.highlights : []);
      setCoachSuggestedQuestions(
        Array.isArray(response.suggestedQuestions) ? response.suggestedQuestions : [],
      );
    } catch (error) {
      console.error("Failed to ask AI coach", error);
      const maybeError = error as { status?: number };
      if (maybeError?.status === 404 || maybeError?.status === 405) {
        const fallback = buildLocalCoachFallback(question);
        setCoachAnswer(fallback.answer);
        setCoachHighlights(fallback.highlights);
        setCoachSuggestedQuestions(fallback.suggestedQuestions);
        toast.message("Coach endpoint unavailable. Showing local AI guidance.");
      } else {
        toast.error("Unable to fetch coach response right now.");
      }
    } finally {
      setIsAskingCoach(false);
    }
  };

  const handleShareReport = async () => {
    if (typeof window === "undefined" || isSharingReport) {
      return;
    }

    const shareUrl = window.location.href;
    const sharePayload = {
      title: `Interview Report ${report.id}`,
      text: "Sharing interview analysis report",
      url: shareUrl,
    };

    setIsSharingReport(true);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(sharePayload);
        toast.success("Report shared successfully.");
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Report link copied to clipboard.");
        return;
      }

      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "absolute";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (copied) {
        toast.success("Report link copied to clipboard.");
        return;
      }

      window.prompt("Copy report link", shareUrl);
    } catch (error) {
      const maybeError = error as { name?: string };
      if (maybeError?.name !== "AbortError") {
        console.error("Failed to share report", error);
        toast.error("Unable to share report right now.");
      }
    } finally {
      setIsSharingReport(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit -ml-2 text-muted-foreground hover:text-foreground print:hidden"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Interview Analysis</h1>
          <p className="text-muted-foreground">
            Report: <span className="font-mono text-xs">{report.id}</span> &nbsp;•&nbsp;
            {new Date(report.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} &nbsp;•&nbsp;
            {report.duration}
          </p>
        </div>
        <div className="flex gap-3 print:hidden">
          <Button
            variant="outline"
            className="flex"
            onClick={() => setIsCoachPanelOpen((current) => !current)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            {isCoachPanelOpen ? "Hide Coach" : "Ask Coach"}
          </Button>
          <Button variant="outline" onClick={() => void handleShareReport()} disabled={isSharingReport}>
            <Share2 className="mr-2 h-4 w-4" /> {isSharingReport ? "Sharing..." : "Share"}
          </Button>
          <Button onClick={handleExportPdf} disabled={isExportingPdf}>
            <Download className="mr-2 h-4 w-4" /> {isExportingPdf ? "Preparing..." : "Export PDF"}
          </Button>
        </div>
      </div>

      {isCoachPanelOpen ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" /> Ask AI Coach
            </CardTitle>
            <CardDescription>
              Ask a report-specific question about your technical performance, test runs, or coding history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea
                value={coachPrompt}
                onChange={(event) => setCoachPrompt(event.target.value)}
                placeholder="Example: What should I improve first in my machine-coding round?"
                className="min-h-24"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Keep it specific for better coaching.
                </p>
                <Button onClick={() => void handleAskCoach()} disabled={isAskingCoach}>
                  {isAskingCoach ? "Analyzing..." : "Ask AI"}
                </Button>
              </div>
            </div>

            {coachAnswer ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <p className="text-sm leading-6">{coachAnswer}</p>

                {coachHighlights.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {coachHighlights.map((highlight, index) => (
                      <Badge key={`${highlight}-${index}`} variant="secondary">
                        {highlight}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {coachSuggestedQuestions.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Suggested follow-up questions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {coachSuggestedQuestions.map((suggestion) => (
                        <Button
                          key={suggestion}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto whitespace-normal px-3 py-1 text-left"
                          onClick={() => setCoachPrompt(suggestion)}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isAwaitingFinalReport ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 text-sm text-amber-700 dark:text-amber-300">
            {isPendingReport
              ? "This report is still being finalized."
              : "This is a temporary fallback report. If a final report becomes available, it will replace this automatically."}
            {" "}
            Auto-refreshing every 5 seconds.
          </CardContent>
        </Card>
      ) : null}

      {/* Score Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-primary">{report.overallScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <Progress value={report.overallScore} className="h-2 mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hard Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{report.hardSkillsScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <Progress value={report.hardSkillsScore} className="h-2 mt-3 bg-muted" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Soft Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{report.softSkillsScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <Progress value={report.softSkillsScore} className="h-2 mt-3 bg-muted" />
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Skills Breakdown</CardTitle>
            <CardDescription>Detailed analysis of your competencies</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="You" dataKey="A" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Timeline</CardTitle>
            <CardDescription>Score and sentiment fluctuation over time</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSentiment" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="time" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend />
                <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" name="Technical Score" />
                <Area type="monotone" dataKey="sentiment" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorSentiment)" name="Confidence" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis Tabs */}
      <Tabs defaultValue="questions" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="questions">Question Analysis</TabsTrigger>
          <TabsTrigger value="history">Code History</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="speech">Speech Analysis</TabsTrigger>
          <TabsTrigger value="swot">SWOT Analysis</TabsTrigger>
          <TabsTrigger value="behavioral">Behavioral</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="space-y-4">
          {questions.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Question Analysis Unavailable</CardTitle>
                <CardDescription>
                  No question-level analysis was captured for this interview yet.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            questions.map((q) => {
              const score = typeof q.score === "number" ? q.score : Number(q.score);
              const hasScore = Number.isFinite(score) && score > 0;
              const scoreVariant = hasScore
                ? score >= 80
                  ? "default"
                  : score >= 60
                    ? "secondary"
                    : "destructive"
                : "outline";
              const audioUrl = resolveMediaUrl(q.audioUrl) || sharedRecordingAudioUrl;
              const hasAudioLoadError = Boolean(audioLoadErrorByQuestion[q.id]);
              const canUseAudio = Boolean(audioUrl) && !hasAudioLoadError;
              const isAudioPlaying = activeAudioQuestionId === q.id;
              const isDownloadingAudio = downloadingQuestionId === q.id;
              const improvements = Array.isArray(q.improvements) ? q.improvements : [];

              return (
                <Card key={q.id} className="overflow-hidden">
                  <Collapsible
                    open={openQuestion === q.id}
                    onOpenChange={(isOpen) => setOpenQuestion(isOpen ? q.id : null)}
                  >
                    <CollapsibleTrigger className="flex w-full items-center justify-between p-6 hover:bg-muted/50 data-[state=open]:bg-muted/50 transition-colors text-left">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={scoreVariant}>{hasScore ? `${score}/100` : "Auto"}</Badge>
                          <h3 className="font-semibold text-lg">{q.question}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{q.userAnswerSummary}</p>
                      </div>
                      <div className="h-9 w-9 flex items-center justify-center shrink-0">
                        {openQuestion === q.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-6 pb-6 space-y-4 border-t pt-4">
                        {canUseAudio ? (
                          <div className="space-y-3 bg-muted/30 p-3 rounded-md border">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-full"
                                  onClick={() => toggleQuestionAudioPlayback(q.id)}
                                >
                                  {isAudioPlaying ? (
                                    <Pause className="h-3.5 w-3.5" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <div className="space-y-0.5">
                                  <div className="text-xs font-medium">Audio Recording</div>
                                  <div className="text-[10px] text-muted-foreground">Playback and download are available.</div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={isDownloadingAudio}
                                onClick={() => {
                                  if (!audioUrl) {
                                    return;
                                  }
                                  void downloadQuestionAudio(q.id, audioUrl);
                                }}
                              >
                                {isDownloadingAudio ? "Preparing..." : "Download"}
                              </Button>
                            </div>
                            <audio
                              ref={(audioElement) => {
                                audioElementRefs.current[q.id] = audioElement;
                              }}
                              controls
                              preload="none"
                              src={audioUrl}
                              className="w-full"
                              onPlay={() => setActiveAudioQuestionId(q.id)}
                              onPause={() => setActiveAudioQuestionId((current) => (current === q.id ? null : current))}
                              onEnded={() => setActiveAudioQuestionId((current) => (current === q.id ? null : current))}
                              onError={() => {
                                setAudioLoadErrorByQuestion((prev) => ({ ...prev, [q.id]: true }));
                                setActiveAudioQuestionId((current) => (current === q.id ? null : current));
                              }}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-muted/30 p-3 rounded-md border">
                            <div className="text-xs text-muted-foreground">
                              {hasAudioLoadError
                                ? "Audio recording could not be loaded. The file may be missing."
                                : isResolvingAudio
                                  ? "Audio is still being prepared. Retrying automatically..."
                                  : audioRecoveryExhausted
                                    ? "Audio processing took longer than expected. Try refreshing in a minute."
                                  : "Audio recording is not available for this question."}
                            </div>
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">Your Answer Summary</h4>
                            <p className="text-sm bg-muted/50 p-3 rounded-md">{q.userAnswerSummary}</p>
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">AI Feedback</h4>
                            <p className="text-sm bg-primary/5 p-3 rounded-md border border-primary/10">{q.aiFeedback}</p>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground mb-2">Suggested Improvements</h4>
                          {improvements.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {improvements.map((imp, i) => (
                                <Badge key={i} variant="outline" className="bg-background">
                                  <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                                  {imp}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No targeted improvements available yet.</p>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" /> Code Snapshot History
              </CardTitle>
              <CardDescription>
                Single snapshot view with slider-based navigation across user/AI code decisions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {codeHistory.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No coding history was captured for this report.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {activeSnapshot?.id}
                    </Badge>
                    <Badge variant={activeActorBadgeVariant} className="h-5">
                      {normalizedActiveActor === "ai"
                        ? "AI"
                        : normalizedActiveActor === "user" || normalizedActiveActor === "candidate"
                          ? "User"
                          : "System"}
                    </Badge>
                    <Badge variant="outline" className="h-5 capitalize">
                      {normalizedActiveType.replace(/_/g, " ")}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {activeSnapshot?.timestampLabel}
                    </span>
                    {activeSnapshot?.language ? (
                      <span className="font-mono text-[11px] uppercase text-muted-foreground">
                        {activeSnapshot.language}
                      </span>
                    ) : null}
                    {activeSnapshotStatus ? (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Status: {activeSnapshotStatus}
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Snapshot {Math.min(selectedSnapshotIndex + 1, codeHistory.length)} / {codeHistory.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedSnapshotIndex((prev) => Math.max(0, prev - 1))}
                          disabled={selectedSnapshotIndex <= 0}
                        >
                          Prev
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelectedSnapshotIndex((prev) =>
                              Math.min(codeHistory.length - 1, prev + 1),
                            )
                          }
                          disabled={selectedSnapshotIndex >= codeHistory.length - 1}
                        >
                          Next
                        </Button>
                      </div>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={Math.max(codeHistory.length - 1, 0)}
                      step={1}
                      value={Math.min(selectedSnapshotIndex, Math.max(codeHistory.length - 1, 0))}
                      onChange={(event) =>
                        setSelectedSnapshotIndex(Number(event.currentTarget.value) || 0)
                      }
                      className="w-full"
                    />

                    <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                      <span>{codeHistory[0]?.id}</span>
                      <span>{codeHistory[codeHistory.length - 1]?.id}</span>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-md border border-zinc-700 bg-[#1e1e1e] text-zinc-100">
                    <div className="border-b border-zinc-700 bg-[#2d2d2d] px-3 py-2 text-[11px] text-zinc-300">
                      {activeSnapshot?.summary}
                    </div>
                    <div className="grid grid-cols-[56px_1fr]">
                      <div className="max-h-115 overflow-auto border-r border-zinc-700 bg-[#191919] px-2 py-2">
                        {activeSnapshotLines.map((_, idx) => (
                          <div
                            key={`${activeSnapshot?.id || "snapshot"}-line-${idx + 1}`}
                            className="text-right font-mono text-[11px] leading-5 text-zinc-500"
                          >
                            {idx + 1}
                          </div>
                        ))}
                      </div>
                      <pre className="m-0 max-h-115 overflow-auto px-3 py-2 font-mono text-xs leading-5 text-zinc-200">
                        {activeSnapshotCode || "// No code snapshot captured for this step."}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transcript" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Full Transcript</CardTitle>
              <CardDescription>Review the entire conversation history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardCheck className="h-4 w-4" />
                  Candidate & AI Audio
                </div>

                {sessionAudioTracks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    User and AI audio tracks are not available yet for this report.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sessionAudioTracks.map((track) => (
                      <div key={track.id} className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          {track.label} ({track.speaker})
                        </div>
                        {track.audioUrl ? (
                          <audio controls preload="none" src={track.audioUrl} className="w-full" />
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            Recording is not available for this track.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {normalizedTranscript.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  Transcript was not captured for this session.
                </div>
              ) : (
                normalizedTranscript.map((entry, i) => (
                  <div key={`${entry.timestamp}-${i}`} className={cn("flex gap-4", entry.speaker === 'You' ? "flex-row-reverse" : "") }>
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", entry.speaker === 'You' ? "bg-primary text-primary-foreground" : "bg-muted")}>
                      {entry.speaker === 'You' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={cn("flex flex-col gap-1 max-w-[80%]", entry.speaker === 'You' ? "items-end" : "items-start")}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{entry.speaker}</span>
                        <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                      </div>
                      <div className={cn("rounded-lg px-4 py-2 text-sm", entry.speaker === 'You' ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {entry.text}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="speech" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mic className="h-5 w-5" /> Filler Word Analysis</CardTitle>
                <CardDescription>Frequency of hesitation words used</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {fillerWords.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    No filler-word data available for this session.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fillerWords} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                      <XAxis type="number" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis dataKey="word" type="category" stroke="#888" fontSize={12} tickLine={false} axisLine={false} width={90} />
                      <RechartsTooltip cursor={{ fill: '#333', opacity: 0.2 }} contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                      <Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20} name="Count" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Speaking Pace</CardTitle>
                <CardDescription>Words per minute (WPM) over time</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {pacingData.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    Speaking pace data is unavailable for this session.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pacingData}>
                      <defs>
                        <linearGradient id="colorWpm" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="time" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} domain={[60, 220]} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                      <Area type="monotone" dataKey="wpm" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorWpm)" name="WPM" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="swot" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-500"><CheckCircle2 className="h-5 w-5" /> Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                {swot.strengths.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No strengths captured yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {swot.strengths.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />{item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-500"><AlertCircle className="h-5 w-5" /> Weaknesses</CardTitle>
              </CardHeader>
              <CardContent>
                {swot.weaknesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No weaknesses captured yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {swot.weaknesses.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />{item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-500"><TrendingUp className="h-5 w-5" /> Opportunities</CardTitle>
              </CardHeader>
              <CardContent>
                {swot.opportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No opportunities captured yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {swot.opportunities.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />{item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-500"><AlertCircle className="h-5 w-5" /> Threats</CardTitle>
              </CardHeader>
              <CardContent>
                {swot.threats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No threats captured yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {swot.threats.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />{item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="behavioral" className="space-y-4">
          {behavioralEntries.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Behavioral Analysis Unavailable</CardTitle>
                <CardDescription>No behavioral metrics were returned for this session.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              {behavioralEntries.map(([key, value]) => (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium capitalize text-muted-foreground">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{String(value)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          {resources.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No Learning Resources</CardTitle>
                <CardDescription>Resource recommendations are not available for this report.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {resources.map((resource, i) => {
                const hasUrl = Boolean(resource.url) && resource.url !== "#";
                return (
                  <Card key={i} className="group hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary">{resource.type}</Badge>
                        <Share2 className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <CardTitle className="text-lg group-hover:text-primary transition-colors">{resource.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="link"
                        className="p-0 h-auto"
                        disabled={!hasUrl}
                        onClick={() => {
                          if (hasUrl) {
                            window.open(resource.url, "_blank", "noopener,noreferrer");
                          }
                        }}
                      >
                        View Resource <TrendingUp className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
