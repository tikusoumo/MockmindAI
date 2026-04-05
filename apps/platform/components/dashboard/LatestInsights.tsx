"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Mic, Timer, TrendingUp } from "lucide-react";
import type { ReportData } from "@/data/mockData";
import { useBackendDataState } from "@/lib/backend";
import { fallbackReport } from "@/lib/fallback-data";
import { Skeleton } from "@/components/ui/skeleton";

export function LatestInsights() {
  const { data: latest, isLoading } = useBackendDataState<ReportData>(
    "/api/reports/latest",
    fallbackReport,
  );

  const fillerWords = Array.isArray(latest.fillerWordsAnalysis)
    ? [...latest.fillerWordsAnalysis]
        .filter((item) => Number.isFinite(item.count) && item.count > 0)
        .sort((a, b) => b.count - a.count)
    : [];
  const totalFillerCount = fillerWords.reduce((sum, item) => sum + item.count, 0);
  const topFillerWord = fillerWords[0];

  const pacePoints = Array.isArray(latest.pacingAnalysis)
    ? latest.pacingAnalysis.filter((point) => Number.isFinite(point.wpm) && point.wpm > 0)
    : [];
  const averageWpm =
    pacePoints.length > 0
      ? Math.round(
          pacePoints.reduce((sum, point) => sum + point.wpm, 0) / pacePoints.length,
        )
      : null;

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
      <Link href="/report/latest" className="group block">
        <Card className="h-full hover:border-primary/40 hover:bg-muted/30 transition-all cursor-pointer">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium group-hover:text-primary transition-colors">Latest Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest.overallScore}%</div>
            <p className="text-xs text-muted-foreground">+2% from average</p>
          </CardContent>
        </Card>
      </Link>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Speaking Pace</CardTitle>
          <Timer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {averageWpm !== null ? `${averageWpm} WPM` : latest.behavioralAnalysis?.pace || "N/A"}
          </div>
          <p className="text-xs text-muted-foreground">
            {averageWpm !== null ? "Average from transcription" : "Pace classification"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Filler Words</CardTitle>
          <Mic className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalFillerCount}</div>
          <p className="text-xs text-muted-foreground">
            {topFillerWord
              ? `Top: "${topFillerWord.word}" (${topFillerWord.count})`
              : "No filler words detected"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Clarity</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{latest.behavioralAnalysis?.clarity || "N/A"}</div>
          <p className="text-xs text-muted-foreground">
            From speech analysis
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
