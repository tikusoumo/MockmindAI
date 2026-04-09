
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
  Bot
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReportData } from "@/data/mockData";
import { backendGet, getBackendUrl } from "@/lib/backend";
import { fallbackReport } from "@/lib/fallback-data";
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
const AUDIO_RECOVERY_POLL_MAX_DURATION_MS = 2 * 60 * 1000;

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
  }, [report.id]);

  useEffect(() => {
    return () => {
      Object.values(audioElementRefs.current).forEach((audio) => {
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
          <Button variant="outline" className="hidden md:flex">
            <MessageSquare className="mr-2 h-4 w-4" /> Ask Coach
          </Button>
          <Button variant="outline">
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
          <Button onClick={handleExportPdf} disabled={isExportingPdf}>
            <Download className="mr-2 h-4 w-4" /> {isExportingPdf ? "Preparing..." : "Export PDF"}
          </Button>
        </div>
      </div>

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

        <TabsContent value="transcript" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Full Transcript</CardTitle>
              <CardDescription>Review the entire conversation history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
