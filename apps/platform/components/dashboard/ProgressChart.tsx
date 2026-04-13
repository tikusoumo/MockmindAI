
"use client"

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ProgressStat } from "@/data/mockData";
import { useBackendDataState } from "@/lib/backend";

const EMPTY_PROGRESS_STATS: ProgressStat[] = [];

const chartConfig = {
  score: {
    label: "Score",
    color: "#3b82f6",
  },
} satisfies ChartConfig;

type ProgressChartProps = {
  forceEmpty?: boolean;
};

function getMonthLabels(total: number) {
  const now = new Date();
  return Array.from({ length: total }, (_, index) => {
    const monthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (total - 1 - index), 1),
    );
    return monthDate.toLocaleString("default", { month: "short" });
  });
}

export function ProgressChart({ forceEmpty = false }: ProgressChartProps) {
  const { data: progressStats } = useBackendDataState<ProgressStat[]>(
    "/api/progress-stats",
    EMPTY_PROGRESS_STATS,
  );

  const averageScoreStat = React.useMemo(
    () =>
      progressStats.find((stat) =>
        stat.label.toLowerCase().includes("average score"),
      ) ||
      progressStats.find((stat) => stat.label.toLowerCase().includes("score")),
    [progressStats],
  );

  const history = Array.isArray(averageScoreStat?.history)
    ? averageScoreStat.history.filter((value) => Number.isFinite(value))
    : [];
  const hasHistory = !forceEmpty && history.some((value) => Number(value || 0) > 0);

  const chartData = React.useMemo(() => {
    if (forceEmpty || !hasHistory || history.length === 0) {
      return [];
    }

    const labels = getMonthLabels(history.length);
    return labels.map((month, index) => ({
      month,
      score: Number(history[index] || 0),
    }));
  }, [forceEmpty, hasHistory, history]);

  const trendText = React.useMemo(() => {
    if (forceEmpty) {
      return "Yet to be filled. Complete your first session to unlock trends.";
    }

    if (chartData.length < 2) {
      return "Run more sessions to build your trend line.";
    }

    const first = Number(chartData[0]?.score || 0);
    const last = Number(chartData[chartData.length - 1]?.score || 0);
    const delta = Math.round(last - first);
    if (delta === 0) {
      return "Trend is stable across recent sessions.";
    }

    return delta > 0
      ? `Trending up by ${delta}% across recent sessions.`
      : `Down by ${Math.abs(delta)}% across recent sessions.`;
  }, [chartData, forceEmpty]);

  const latestScore =
    chartData.length > 0 ? Number(chartData[chartData.length - 1]?.score || 0) : null;
  const previousScore =
    chartData.length > 1 ? Number(chartData[chartData.length - 2]?.score || 0) : null;
  const monthDelta =
    latestScore !== null && previousScore !== null
      ? Math.round(latestScore - previousScore)
      : null;

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">Performance Trend</CardTitle>
            <CardDescription className="text-xs">Recent session history</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-md border bg-muted/40 px-2.5 py-1 text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Current</p>
              <p className="text-sm font-semibold tabular-nums">{latestScore !== null ? `${Math.round(latestScore)}%` : "--"}</p>
            </div>
            <div className="rounded-md border bg-muted/40 px-2.5 py-1 text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">MoM</p>
              <p className="text-sm font-semibold tabular-nums">
                {monthDelta === null ? "--" : `${monthDelta > 0 ? "+" : ""}${monthDelta}%`}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-56 w-full rounded-lg border border-dashed text-sm text-muted-foreground flex flex-col items-center justify-center gap-1 bg-linear-to-b from-muted/20 to-background">
            <div className="text-2xl font-semibold tabular-nums text-foreground/70">--</div>
            <div>Complete sessions to unlock your performance trend.</div>
          </div>
        ) : (
          <ChartContainer config={chartConfig}>
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 12,
                right: 12,
                top: 10,
              }}
            >
              <defs>
                <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-score)" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="var(--color-score)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => String(value).slice(0, 3)}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={30}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Area
                dataKey="score"
                type="natural"
                fill="url(#scoreAreaGradient)"
                stroke="var(--color-score)"
                strokeWidth={2.25}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="py-2 px-4">
        <div className="text-xs font-medium text-muted-foreground">{trendText}</div>
      </CardFooter>
    </Card>
  );
}
