"use client";

import Link from "next/link";
import { ArrowRight, Clock, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pastInterviews } from "@/data/mockData";

export function RecentActivity() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent Activity</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/history">
            View All <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pastInterviews.slice(0, 4).map((interview) => (
            <div
              key={interview.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{interview.title}</h4>
                  <Badge variant={interview.score >= 80 ? "default" : interview.score >= 70 ? "secondary" : "outline"}>
                    {interview.score}%
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
              <Button variant="outline" size="sm" asChild>
                <Link href={`/report`}>View Report</Link>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
