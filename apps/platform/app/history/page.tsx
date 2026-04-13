
"use client";

import { 
  Search, 
  Filter, 
  Download, 
  ExternalLink,
  Calendar,
  Clock,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import type { PastInterview } from "@/data/mockData";
import { useBackendDataState } from "@/lib/backend";
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY_PAST_INTERVIEWS: PastInterview[] = [];

export default function HistoryPage() {
  const { data: pastInterviews, isLoading } = useBackendDataState<PastInterview[]>(
    "/api/interviews/past",
    EMPTY_PAST_INTERVIEWS
  );

  if (isLoading) {
    return <HistorySkeleton />;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview History</h1>
          <p className="text-muted-foreground mt-1">
            Review your past performance and track your progress.
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" /> Export Data
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search history..."
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader className="px-6">
          <CardTitle>Past Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pastInterviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Yet to be filled. Your interview history will appear here after your first completed session.
                  </TableCell>
                </TableRow>
              ) : (
                pastInterviews.map((interview) => (
                  <TableRow key={interview.id}>
                    <TableCell className="font-medium pl-6">{interview.title}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(interview.date).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {interview.duration}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{interview.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        <Trophy className={`h-3 w-3 ${interview.score >= 80 ? 'text-green-500' : 'text-yellow-500'}`} />
                        {interview.score}%
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/report/${interview.id}`}>
                          View Report <ExternalLink className="ml-2 h-3 w-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-10 w-10" />
      </div>

      <Card>
        <CardHeader className="px-6">
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
