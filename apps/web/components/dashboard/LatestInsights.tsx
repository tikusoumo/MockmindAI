"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockReport } from "@/data/mockData";
import { Activity, Mic, Timer, TrendingUp } from "lucide-react";

export function LatestInsights() {
  const latest = mockReport;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Latest Score</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{latest.overallScore}%</div>
          <p className="text-xs text-muted-foreground">
            +2% from average
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Speaking Pace</CardTitle>
          <Timer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{latest.behavioralAnalysis.pace}</div>
          <p className="text-xs text-muted-foreground">
            Optimal range
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Filler Words</CardTitle>
          <Mic className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{latest.behavioralAnalysis.fillerWords}</div>
          <p className="text-xs text-muted-foreground">
            Top 10% of users
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Clarity</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{latest.behavioralAnalysis.clarity}</div>
          <p className="text-xs text-muted-foreground">
            Crystal clear audio
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
