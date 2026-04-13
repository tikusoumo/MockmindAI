"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Mic, Timer, TrendingUp } from "lucide-react";
import type { ReportData } from "@/data/mockData";
import { useBackendDataState } from "@/lib/backend";
import { Skeleton } from "@/components/ui/skeleton";

type LatestInsightsProps = {
  forceEmpty?: boolean;
};

export function LatestInsights({ forceEmpty = false }: LatestInsightsProps) {
  const { data: latest, isLoading } = useBackendDataState<ReportData | null>(
    "/api/report/latest",
    null,
  );

  const effectiveLatest = forceEmpty ? null : latest;

  const fillerWords = Array.isArray(effectiveLatest?.fillerWordsAnalysis)
    ? [...effectiveLatest.fillerWordsAnalysis]
        .filter((item) => Number.isFinite(item.count) && item.count > 0)
        .sort((a, b) => b.count - a.count)
    : [];
  const totalFillerCount = fillerWords.reduce((sum, item) => sum + item.count, 0);
  const topFillerWord = fillerWords[0];

  const pacePoints = Array.isArray(effectiveLatest?.pacingAnalysis)
    ? effectiveLatest.pacingAnalysis.filter((point) => Number.isFinite(point.wpm) && point.wpm > 0)
    : [];
  const averageWpm =
    pacePoints.length > 0
      ? Math.round(
          pacePoints.reduce((sum, point) => sum + point.wpm, 0) / pacePoints.length,
        )
      : null;

  const scoreTimeline = Array.isArray(effectiveLatest?.timelineData)
    ? effectiveLatest.timelineData.filter((point) => Number.isFinite(point.score))
    : [];
  const scoreDelta =
    scoreTimeline.length >= 2
      ? Math.round(
          Number(scoreTimeline[scoreTimeline.length - 1]?.score || 0) -
            Number(scoreTimeline[0]?.score || 0),
        )
      : null;
  const clarityValue =
    typeof effectiveLatest?.behavioralAnalysis?.clarity === "string" &&
    effectiveLatest.behavioralAnalysis.clarity.trim().length > 0
      ? effectiveLatest.behavioralAnalysis.clarity
      : "--";

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {effectiveLatest ? (
        <Link href="/report/latest" className="group block">
          <Card className="relative h-full overflow-hidden border-border/70 bg-linear-to-b from-background to-muted/25 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
            <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-sky-500/60 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Latest Score</CardTitle>
              <span className="rounded-md bg-sky-500/10 p-1.5 text-sky-600 dark:text-sky-400">
                <TrendingUp className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-3xl font-semibold tabular-nums tracking-tight">{Math.round(Number(effectiveLatest.overallScore || 0))}%</div>
              <p className="text-xs text-muted-foreground">
                {scoreDelta === null
                  ? "Trend will appear after more sessions"
                  : scoreDelta === 0
                    ? "Stable versus starting point"
                    : `${scoreDelta > 0 ? "+" : ""}${scoreDelta}% trend`}
              </p>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <Card className="relative h-full overflow-hidden border-border/70 bg-linear-to-b from-background to-muted/25 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-sky-500/60 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Latest Score</CardTitle>
            <span className="rounded-md bg-sky-500/10 p-1.5 text-sky-600 dark:text-sky-400">
              <TrendingUp className="h-4 w-4" />
            </span>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tabular-nums tracking-tight text-muted-foreground">--</div>
            <p className="text-xs text-muted-foreground">Awaiting first completed report.</p>
          </CardContent>
        </Card>
      )}

      <Card className="relative h-full overflow-hidden border-border/70 bg-linear-to-b from-background to-muted/25 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-emerald-500/60 to-transparent" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Speaking Pace</CardTitle>
          <span className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
            <Timer className="h-4 w-4" />
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            {averageWpm !== null ? averageWpm : "--"}
            {averageWpm !== null ? <span className="ml-1 text-lg text-muted-foreground">WPM</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {effectiveLatest
              ? averageWpm !== null
                ? "Average from transcript"
                : "Awaiting pacing capture"
              : "Available after your first report"}
          </p>
        </CardContent>
      </Card>

      <Card className="relative h-full overflow-hidden border-border/70 bg-linear-to-b from-background to-muted/25 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-500/60 to-transparent" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Filler Words</CardTitle>
          <span className="rounded-md bg-amber-500/10 p-1.5 text-amber-600 dark:text-amber-400">
            <Mic className="h-4 w-4" />
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            {effectiveLatest ? totalFillerCount : "--"}
          </div>
          <p className="text-xs text-muted-foreground">
            {effectiveLatest
              ? topFillerWord
                ? `Top: "${topFillerWord.word}" (${topFillerWord.count})`
                : "No filler words detected"
              : "Available after your first report"}
          </p>
        </CardContent>
      </Card>

      <Card className="relative h-full overflow-hidden border-border/70 bg-linear-to-b from-background to-muted/25 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-violet-500/60 to-transparent" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Clarity</CardTitle>
          <span className="rounded-md bg-violet-500/10 p-1.5 text-violet-600 dark:text-violet-400">
            <Activity className="h-4 w-4" />
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-3xl font-semibold tracking-tight">{effectiveLatest ? clarityValue : "--"}</div>
          <p className="text-xs text-muted-foreground">Speech delivery clarity</p>
        </CardContent>
      </Card>
    </div>
  );
}
