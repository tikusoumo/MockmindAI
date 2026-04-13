"use client";

import * as React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ReportData } from "@/data/mockData";
import { useBackendDataState } from "@/lib/backend";
import { Skeleton } from "@/components/ui/skeleton";

type SkillsRadarProps = {
  forceEmpty?: boolean;
};

export function SkillsRadar({ forceEmpty = false }: SkillsRadarProps) {
  const { data: report, isLoading } = useBackendDataState<ReportData | null>(
    "/api/report/latest",
    null,
  );

  const effectiveReport = forceEmpty ? null : report;

  const data = React.useMemo(
    () =>
      (Array.isArray(effectiveReport?.radarData) ? effectiveReport.radarData : []).map((item) => ({
        ...item,
        fullMark: item.fullMark ?? 100,
      })),
    [effectiveReport?.radarData],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills Assessment</CardTitle>
        <CardDescription>
          Based on your latest interview performance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-75 w-full">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : data.length === 0 ? (
            <div className="h-full w-full rounded-lg border border-dashed text-sm text-muted-foreground flex items-center justify-center">
              Yet to be filled.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                <PolarGrid className="stroke-muted" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "var(--foreground)", fontSize: 12 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  name="Score"
                  dataKey="A"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--popover-foreground)",
                  }}
                  itemStyle={{ color: "var(--foreground)" }}
                  labelStyle={{ color: "var(--foreground)" }}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
