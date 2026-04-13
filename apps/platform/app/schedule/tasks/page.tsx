"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MessageSquare,
  Plus,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScheduleBreadcrumb } from "@/components/schedule/ScheduleBreadcrumb";
import { backendGet } from "@/lib/backend";

type ScheduledSession = {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  time: string;
  interviewer: string;
  status: string;
  category?: string;
  isAiSuggested?: boolean;
};

function formatDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }
  return parsed.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScheduleTaskWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedQueryId = searchParams.get("sessionId");

  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const loadSessions = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const end = new Date(now);
        end.setDate(end.getDate() + 90);

        const data = await backendGet<ScheduledSession[]>(
          `/api/schedule?dateStart=${encodeURIComponent(now.toISOString())}&dateEnd=${encodeURIComponent(end.toISOString())}`,
        );

        const nextSessions = Array.isArray(data) ? data : [];
        setSessions(nextSessions);

        if (selectedQueryId && nextSessions.some((item) => item.id === selectedQueryId)) {
          setSelectedSessionId(selectedQueryId);
          return;
        }

        if (nextSessions.length > 0) {
          setSelectedSessionId(nextSessions[0].id);
        }
      } catch (error) {
        console.error("Failed loading task workspace sessions", error);
      } finally {
        setLoading(false);
      }
    };

    void loadSessions();
  }, [selectedQueryId]);

  const selectedSession = useMemo(
    () => sessions.find((item) => item.id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  );

  const activityEntries = useMemo(() => {
    if (!selectedSession) {
      return [];
    }

    return [
      {
        id: "a1",
        title: "Task planned",
        details: `${selectedSession.title} was added to your schedule board`,
      },
      {
        id: "a2",
        title: "Assessment link generated",
        details: "Invite email includes schedule link + assessment link",
      },
      {
        id: "a3",
        title: "Reminder queue active",
        details: "Background cron checks every 5 minutes for upcoming reminders",
      },
    ];
  }, [selectedSession]);

  const selectSession = (id: string) => {
    setSelectedSessionId(id);
    router.replace(`/schedule/tasks?sessionId=${id}`);
  };

  return (
    <div className="space-y-6 pb-8">
      <ScheduleBreadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Schedule", href: "/schedule" },
          { label: "Task Workspace" },
        ]}
      />

      <section className="rounded-3xl border bg-[radial-gradient(circle_at_92%_10%,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_14%_90%,rgba(250,204,21,0.12),transparent_35%)] p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Schedule / Tasks
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Task Workspace</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Drill into one scheduled task at a time, track activity, and jump into
              assessment quickly.
            </p>
          </div>

          <Button asChild className="gap-2">
            <Link href="/schedule/tasks/new">
              <Plus className="h-4 w-4" />
              Schedule New Task
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Tasks</CardTitle>
            <CardDescription>Select one to open details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading tasks...</p>
            ) : sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                No scheduled tasks found.
              </div>
            ) : (
              sessions.map((session) => {
                const active = session.id === selectedSessionId;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => selectSession(session.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/20"
                    }`}
                  >
                    <p className="truncate text-sm font-semibold">{session.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateLabel(session.date)}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {session.category || "practice"}
                      </Badge>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {selectedSession ? selectedSession.title : "Select a task"}
            </CardTitle>
            <CardDescription>
              {selectedSession
                ? "Task detail snapshot inspired by your requested schedule flow."
                : "Pick a scheduled task from the left column."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {selectedSession ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">When</p>
                    <p className="mt-1 text-sm font-semibold">{formatDateLabel(selectedSession.date)}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Interviewer</p>
                    <p className="mt-1 text-sm font-semibold">{selectedSession.interviewer || "AI Coach"}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Category</p>
                    <p className="mt-1 text-sm font-semibold">{selectedSession.category || "Practice"}</p>
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Brief</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {selectedSession.description ||
                      "Use this workspace to break down topics, attach context, and plan the conversation arc before starting your mock interview."}
                  </p>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Checklist</p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Draft opening response strategy
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Prepare 2 measurable examples
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Review likely follow-up questions
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/interview?scheduledSessionId=${selectedSession.id}`}>
                      Assessment Link
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/schedule">
                      Back to Calendar
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No task selected.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Feed</CardTitle>
              <CardDescription>Latest updates for this task.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activityEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                activityEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border bg-card p-3">
                    <p className="text-sm font-semibold">{entry.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.details}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comment</CardTitle>
              <CardDescription>
                Capture prep notes for your next session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add your prep note here..."
                className="min-h-24"
              />
              <Button variant="secondary" className="w-full" disabled={!note.trim()}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Save Note
              </Button>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Daily planning
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  45 min slots
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
                  <UserRound className="h-3.5 w-3.5" />
                  AI interviewer
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Cron reminders
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
