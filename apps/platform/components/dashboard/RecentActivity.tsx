"use client";

import Link from "next/link";
import { ArrowRight, Clock, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PastInterview } from "@/data/mockData";
import { useBackendData } from "@/lib/backend";
import { fallbackPastInterviews } from "@/lib/fallback-data";

export function RecentActivity() {
  const pastInterviews = useBackendData<PastInterview[]>(
    "/api/interviews/past",
    fallbackPastInterviews
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/history">
            View All <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {pastInterviews.slice(0, 4).map((interview) => (
            <Link
              key={interview.id}
              href={`/report/${interview.id}`}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 hover:border-primary/30 transition-all group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">{interview.title}</h4>
                  <Badge variant={interview.score >= 80 ? "default" : interview.score >= 70 ? "secondary" : "outline"} className="text-[10px] h-4 px-1">
                    {interview.score}%
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {interview.date}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {interview.duration}
                  </div>
                  <span className="capitalize">{interview.type}</span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
