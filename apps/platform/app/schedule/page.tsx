"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Link2,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScheduleBreadcrumb } from "@/components/schedule/ScheduleBreadcrumb";
import { backendGet, backendPost } from "@/lib/backend";

type ScheduledSession = {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  time: string;
  interviewer: string;
  status: string;
  googleEventId?: string | null;
  reminderSent?: boolean;
  isAiSuggested?: boolean;
  category?: string;
};

type PracticeRoutine = {
  id: string;
  title: string;
  frequency: string;
  duration: number;
  isActive: boolean;
};

type GoogleStatusResponse = {
  connected: boolean;
};

type GoogleEventPreview = {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  htmlLink?: string;
};

type AgendaItem = {
  id: string;
  source: "session" | "google";
  title: string;
  details: string;
  start: Date;
  end: Date;
  sessionId?: string;
  calendarLink?: string;
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildMonthGrid(currentMonth: Date): Date[] {
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const weekdayIndex = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  ).getDate();
  const visibleCellCount = Math.ceil((weekdayIndex + daysInMonth) / 7) * 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - weekdayIndex);

  return Array.from({ length: visibleCellCount }, (_, index) => {
    const next = new Date(gridStart);
    next.setDate(gridStart.getDate() + index);
    return next;
  });
}

function monthWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [monthCursor, setMonthCursor] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [routines, setRoutines] = useState<PracticeRoutine[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleEventPreview[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [routineBusy, setRoutineBusy] = useState(false);

  const monthKey = `${monthCursor.getFullYear()}-${monthCursor.getMonth()}`;

  const fetchData = async () => {
    setLoading(true);
    try {
      const { start, end } = monthWindow(monthCursor);
      const rangeQuery = `dateStart=${encodeURIComponent(start.toISOString())}&dateEnd=${encodeURIComponent(end.toISOString())}`;

      const [sessionsData, routinesData, googleStatus] = await Promise.all([
        backendGet<ScheduledSession[]>(`/api/schedule?${rangeQuery}`),
        backendGet<PracticeRoutine[]>("/api/schedule/routines"),
        backendGet<GoogleStatusResponse>("/api/schedule/google/status"),
      ]);

      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setRoutines(Array.isArray(routinesData) ? routinesData : []);
      setGoogleConnected(Boolean(googleStatus?.connected));

      if (googleStatus?.connected) {
        const googleEventsData = await backendGet<GoogleEventPreview[]>(
          `/api/schedule/google/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
        );
        setGoogleEvents(Array.isArray(googleEventsData) ? googleEventsData : []);
      } else {
        setGoogleEvents([]);
      }
    } catch (error) {
      console.error("Failed loading scheduler data", error);
      toast.error("Unable to load schedule right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  useEffect(() => {
    const status = searchParams.get("googleCalendar");
    if (!status) {
      return;
    }

    if (status === "connected") {
      toast.success("Google Calendar connected successfully.");
    }
    if (status === "failed") {
      toast.error("Google Calendar connection failed. Please try again.");
    }

    router.replace("/schedule");
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  const selectedDateKey = toDateKey(selectedDate);
  const monthGrid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);

  const sessionsByDay = useMemo(() => {
    const lookup: Record<string, ScheduledSession[]> = {};
    for (const session of sessions) {
      const parsed = new Date(session.date);
      if (Number.isNaN(parsed.getTime())) {
        continue;
      }
      const key = toDateKey(parsed);
      if (!lookup[key]) {
        lookup[key] = [];
      }
      lookup[key].push(session);
    }

    for (const key of Object.keys(lookup)) {
      lookup[key].sort((a, b) => a.time.localeCompare(b.time));
    }

    return lookup;
  }, [sessions]);

  const googleByDay = useMemo(() => {
    const lookup: Record<string, GoogleEventPreview[]> = {};
    for (const event of googleEvents) {
      const parsed = new Date(event.start);
      if (Number.isNaN(parsed.getTime())) {
        continue;
      }
      const key = toDateKey(parsed);
      if (!lookup[key]) {
        lookup[key] = [];
      }
      lookup[key].push(event);
    }

    for (const key of Object.keys(lookup)) {
      lookup[key].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    }

    return lookup;
  }, [googleEvents]);

  const selectedAgenda = useMemo<AgendaItem[]>(() => {
    const daySessions = (sessionsByDay[selectedDateKey] || []).map((session) => {
      const start = new Date(session.date);
      const end = new Date(start.getTime() + 45 * 60 * 1000);

      return {
        id: `session-${session.id}`,
        source: "session",
        title: session.title,
        details: session.description || `${session.interviewer || "AI Coach"} session`,
        start,
        end,
        sessionId: session.id,
      };
    });

    const dayGoogle = (googleByDay[selectedDateKey] || []).map((event) => ({
      id: `google-${event.id}`,
      source: "google" as const,
      title: event.title,
      details: event.description || "Imported from Google Calendar",
      start: new Date(event.start),
      end: new Date(event.end),
      calendarLink: event.htmlLink,
    }));

    return [...daySessions, ...dayGoogle].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
  }, [googleByDay, selectedDateKey, sessionsByDay]);

  const monthlySessionCount = sessions.length;
  const activeRoutineCount = routines.filter((routine) => routine.isActive).length;
  const monthlyFocusHours = ((sessions.length * 45) / 60).toFixed(1);

  const connectGoogleCalendar = async () => {
    setGoogleBusy(true);
    try {
      const returnTo =
        typeof window !== "undefined" ? `${window.location.origin}/schedule` : "/schedule";
      const response = await backendGet<{ url: string }>(
        `/api/schedule/google/connect-url?returnTo=${encodeURIComponent(returnTo)}`,
      );

      if (!response?.url) {
        throw new Error("Missing Google OAuth URL");
      }

      window.location.assign(response.url);
    } catch (error) {
      console.error("Failed initiating Google connect", error);
      toast.error("Unable to start Google Calendar connect flow.");
      setGoogleBusy(false);
    }
  };

  const disconnectGoogleCalendar = async () => {
    setGoogleBusy(true);
    try {
      await backendPost<{ success: boolean }>("/api/schedule/google/disconnect", {});
      toast.success("Google Calendar disconnected.");
      await fetchData();
    } catch (error) {
      console.error("Failed disconnecting Google Calendar", error);
      toast.error("Unable to disconnect Google Calendar.");
    } finally {
      setGoogleBusy(false);
    }
  };

  const generateRoutine = async () => {
    setRoutineBusy(true);
    try {
      await backendPost<PracticeRoutine>("/api/schedule/routines/generate", {
        title: "AI Suggested Weekly Prep",
        frequency: "weekly",
        focusAreas: ["System Design", "Behavioral", "Communication"],
        duration: 45,
      });
      toast.success("New AI routine created.");
      await fetchData();
    } catch (error) {
      console.error("Failed generating routine", error);
      toast.error("Could not generate routine.");
    } finally {
      setRoutineBusy(false);
    }
  };

  const jumpMonth = (offset: number) => {
    const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + offset, 1);
    setMonthCursor(next);
  };

  const activeMonthTitle = monthCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="relative space-y-6 pb-24">
      <ScheduleBreadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Schedule" },
        ]}
      />

      <section className="rounded-3xl border bg-[radial-gradient(circle_at_8%_12%,rgba(244,114,182,0.14),transparent_35%),radial-gradient(circle_at_82%_0%,rgba(34,197,94,0.14),transparent_32%),radial-gradient(circle_at_100%_100%,rgba(56,189,248,0.18),transparent_50%)] p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Planner Hub
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Interview Schedule</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Calendar-first planning with a larger monthly board, task subpages,
              and Google sync.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/schedule/tasks">Task Workspace</Link>
            </Button>
            <Button asChild className="gap-2">
              <Link href={`/schedule/tasks/new?date=${selectedDateKey}`}>
                <Plus className="h-4 w-4" />
                New Task
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary">Calendar Board</Badge>
          <Badge variant="outline">Agenda Timeline</Badge>
          <Badge variant="outline">Task Subpages</Badge>
          <Badge variant="outline">Email Invite Links</Badge>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">{activeMonthTitle}</CardTitle>
                <CardDescription>
                  Click a day to review sessions and open detailed task views.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => jumpMonth(-1)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => jumpMonth(1)}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3 sm:p-4">
            <div className="mb-2 grid grid-cols-7 gap-1.5">
              {DAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="rounded-lg bg-muted/50 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {monthGrid.map((day) => {
                const dayKey = toDateKey(day);
                const daySessions = sessionsByDay[dayKey] || [];
                const dayGoogle = googleByDay[dayKey] || [];
                const isCurrentMonth = day.getMonth() === monthCursor.getMonth();
                const isSelected = dayKey === selectedDateKey;

                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => {
                      setSelectedDate(new Date(day));
                      if (!isCurrentMonth) {
                        setMonthCursor(new Date(day.getFullYear(), day.getMonth(), 1));
                      }
                    }}
                    className={`flex min-h-20 flex-col rounded-lg border p-2 text-left transition sm:min-h-24 sm:p-2 ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/50 hover:bg-muted/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {(daySessions.length > 0 || dayGoogle.length > 0) && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {daySessions.length + dayGoogle.length}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 space-y-1">
                      {daySessions.slice(0, 1).map((session) => (
                        <div
                          key={session.id}
                          className="truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                        >
                          {session.time} {session.title}
                        </div>
                      ))}

                      {dayGoogle.slice(0, daySessions.length === 0 ? 1 : 0).map((event) => (
                        <div
                          key={event.id}
                          className="truncate rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                        >
                          {event.title}
                        </div>
                      ))}

                      {daySessions.length + dayGoogle.length > 1 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{daySessions.length + dayGoogle.length - 1} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-5 w-5 text-rose-500" />
                Agenda for {selectedDate.toLocaleDateString()}
              </CardTitle>
              <CardDescription>
                Time-ordered events from platform sessions and Google calendar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading agenda...</p>
              ) : selectedAgenda.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No events on this day. Create one from the task scheduler.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedAgenda.map((item) => (
                    <div key={item.id} className="rounded-xl border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {formatClock(item.start)} - {formatClock(item.end)}
                          </p>
                          <p className="mt-1 font-semibold">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.details}</p>
                        </div>
                        <Badge variant={item.source === "session" ? "default" : "outline"}>
                          {item.source === "session" ? "Session" : "Google"}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.sessionId && (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/schedule/tasks?sessionId=${item.sessionId}`}>
                              Open Task
                            </Link>
                          </Button>
                        )}

                        {item.sessionId && (
                          <Button size="sm" asChild>
                            <Link href={`/interview?scheduledSessionId=${item.sessionId}`}>
                              Assessment Link
                            </Link>
                          </Button>
                        )}

                        {!item.sessionId && item.calendarLink && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={item.calendarLink} target="_blank" rel="noopener noreferrer">
                              Open Event <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Sessions</CardDescription>
                <CardTitle className="text-2xl">{monthlySessionCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Focus Hours</CardDescription>
                <CardTitle className="text-2xl">{monthlyFocusHours}h</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Routines</CardDescription>
                <CardTitle className="text-2xl">{activeRoutineCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Google Sync</CardDescription>
                <CardTitle className="text-2xl">
                  {googleConnected ? "Linked" : "Off"}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-cyan-500" />
                Calendar Actions
              </CardTitle>
              <CardDescription>
                Connect Google calendar and generate AI routine sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {googleConnected ? (
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => void disconnectGoogleCalendar()}
                  disabled={googleBusy}
                >
                  Disconnect Google
                  <Link2 className="h-4 w-4" />
                </Button>
              ) : (
                <Button className="w-full" onClick={() => void connectGoogleCalendar()} disabled={googleBusy}>
                  {googleBusy ? "Connecting..." : "Connect Google Calendar"}
                </Button>
              )}

              <Button
                variant="secondary"
                className="w-full justify-between"
                onClick={() => void generateRoutine()}
                disabled={routineBusy}
              >
                {routineBusy ? "Generating Routine..." : "Generate AI Routine"}
                <Sparkles className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Button size="lg" className="fixed bottom-8 right-8 z-10 h-14 rounded-full px-6 shadow-lg" asChild>
        <Link href={`/schedule/tasks/new?date=${selectedDateKey}`}>
          <Plus className="mr-1 h-5 w-5" />
          Schedule Task
        </Link>
      </Button>
    </div>
  );
}
