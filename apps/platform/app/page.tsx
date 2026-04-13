"use client";

import * as React from "react";
import Link from "next/link";
import { 
  Play, 
  Plus, 
  Calendar as CalendarIcon, 
  ArrowRight, 
  Trophy,
  Target,
  Zap,
  Compass,
  CalendarCheck2,
  BarChart3,
  CheckCircle2,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type {
  InterviewTemplate,
  PastInterview,
  ProgressStat,
  ScheduledSession,
  User,
} from "@/data/mockData";
import { ProgressChart } from "@/components/dashboard/ProgressChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { SkillsRadar } from "@/components/dashboard/SkillsRadar";
import { LatestInsights } from "@/components/dashboard/LatestInsights";
import { cn } from "@/lib/utils";
import { backendGet, backendPost, useBackendDataState } from "@/lib/backend";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fallbackCurrentUser,
  fallbackInterviewTemplates,
  fallbackProgressStats,
} from "@/lib/fallback-data";
import { NewSessionModal } from "@/components/dashboard/NewSessionModal";

type DashboardUser = User & { id?: number; email?: string };

const EMPTY_PAST_INTERVIEWS: PastInterview[] = [];

const tutorialSteps = [
  {
    title: "Start and launch a real session",
    description:
      "Click Start New Session, choose a template, and open the interview room in one flow.",
    highlights: [
      "Template sessions are quickest for first-time practice.",
      "Custom sessions let you set topic, difficulty, and persona.",
      "You can relaunch this guide anytime with Product Tour.",
    ],
    actionHint: "Start with a template and enter the interview room.",
  },
  {
    title: "Inside the session room",
    description:
      "The first in-session walkthrough will point directly to your key tools.",
    highlights: [
      "Editor: solve coding tasks with live execution.",
      "AI agent panel: track interviewer status while speaking/listening.",
      "Media controls: manage microphone and camera quickly.",
    ],
    actionHint: "You will be guided step-by-step on first room entry.",
  },
  {
    title: "Operate the full workflow",
    description:
      "You will also be guided through notes and inviting collaborators.",
    highlights: [
      "Take notes during live interviews.",
      "Invite people with link/email access controls.",
      "End session and review report insights when complete.",
    ],
    actionHint: "This full workflow appears automatically on your first run.",
  },
];

function getProgressMetricConfig(label: string) {
  const normalizedLabel = label.toLowerCase();
  const isPercentage =
    normalizedLabel.includes("score") ||
    normalizedLabel.includes("accuracy") ||
    normalizedLabel.includes("confidence") ||
    normalizedLabel.includes("communication");
  const isHours = normalizedLabel.includes("hour");

  return {
    isPercentage,
    isHours,
    valueSuffix: isPercentage ? "%" : isHours ? " hrs" : "",
    changeSuffix: isPercentage ? "%" : isHours ? " hrs" : "",
  };
}

function hasCalculatedProgress(stat: ProgressStat) {
  const value = Number(stat.value || 0);
  const history = Array.isArray(stat.history) ? stat.history : [];
  const hasHistoryPoints = history.some((point) => Number(point || 0) > 0);
  return value > 0 || hasHistoryPoints;
}

function formatProgressValue(stat: ProgressStat) {
  const value = Number(stat.value || 0);
  const config = getProgressMetricConfig(stat.label);

  if (config.isPercentage) {
    return `${Math.round(value)}${config.valueSuffix}`;
  }

  if (config.isHours) {
    const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
    return `${rounded}${config.valueSuffix}`;
  }

  return `${Math.round(value)}${config.valueSuffix}`;
}

export default function Dashboard() {
  const { data: user, isLoading: isUserLoading } = useBackendDataState<DashboardUser>("/api/user", fallbackCurrentUser);
  const { data: interviewTemplates, isLoading: isTemplatesLoading } = useBackendDataState<InterviewTemplate[]>(
    "/api/interview-templates",
    fallbackInterviewTemplates
  );
  const { data: progressStats, isLoading: isProgressLoading } = useBackendDataState<ProgressStat[]>(
    "/api/progress-stats",
    fallbackProgressStats
  );
  const { data: pastInterviews, isLoading: isHistoryLoading } = useBackendDataState<PastInterview[]>(
    "/api/interviews/past",
    EMPTY_PAST_INTERVIEWS,
  );

  const [sessions, setSessions] = React.useState<ScheduledSession[]>([]);
  const [isScheduleLoading, setIsScheduleLoading] = React.useState(true);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [launchInterviewTour, setLaunchInterviewTour] = React.useState(false);
  const [tutorialOpen, setTutorialOpen] = React.useState(false);
  const [tutorialStep, setTutorialStep] = React.useState(0);
  const [draftSession, setDraftSession] = React.useState({
    title: "",
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
    interviewer: "AI",
  });

  const userIdentity = React.useMemo(() => {
    return typeof user.id === "number"
      ? `id-${user.id}`
      : user.email
        ? `email-${user.email}`
        : `name-${user.name || "user"}`;
  }, [user.email, user.id, user.name]);

  const tutorialStorageKey = React.useMemo(() => {
    return `platform-dashboard-tour:v1:${userIdentity}`;
  }, [userIdentity]);

  const interviewTourStorageKey = React.useMemo(() => {
    return `platform-interview-workflow-tour:v1:${userIdentity}`;
  }, [userIdentity]);

  React.useEffect(() => {
    if (isUserLoading) {
      return;
    }

    try {
      const hasSeenTutorial =
        window.localStorage.getItem(tutorialStorageKey) === "completed";
      const hasSeenInterviewTour =
        window.localStorage.getItem(interviewTourStorageKey) === "completed";

      setLaunchInterviewTour(!hasSeenInterviewTour);

      if (!hasSeenTutorial || !hasSeenInterviewTour) {
        setTutorialStep(0);
        setTutorialOpen(true);
      }
    } catch {
      // Ignore storage access failures.
    }
  }, [interviewTourStorageKey, isUserLoading, tutorialStorageKey]);

  React.useEffect(() => {
    setIsScheduleLoading(true);
    backendGet<ScheduledSession[]>("/api/schedule")
      .then((items) => setSessions(items))
      .catch(() => setSessions([]))
      .finally(() => setIsScheduleLoading(false));
  }, []);

  const isInitialLoading =
    isUserLoading ||
    isTemplatesLoading ||
    isProgressLoading ||
    isScheduleLoading ||
    isHistoryLoading;

  if (isInitialLoading) {
    return <DashboardSkeleton />;
  }

  const canSchedule =
    draftSession.title.trim().length > 0 &&
    draftSession.date.trim().length > 0 &&
    draftSession.time.trim().length > 0;

  const hasInterviewData = pastInterviews.length > 0;
  const effectiveProgressStats = hasInterviewData
    ? progressStats
    : fallbackProgressStats;

  const hasAnyProgress = effectiveProgressStats.some((stat) =>
    hasCalculatedProgress(stat),
  );
  const streakStat = effectiveProgressStats.find((stat) =>
    stat.label.toLowerCase().includes("streak"),
  );
  const streakDays = Number(streakStat?.value || 0);

  const welcomeSubtitle = hasAnyProgress
    ? streakDays > 0
      ? `You're on a ${streakDays}-day streak. Keep up the momentum!`
      : "Your next session can start a new streak."
    : "Your stats are yet to be filled. Complete your first session to unlock insights.";

  const activeTutorialStep = tutorialSteps[tutorialStep] || tutorialSteps[0];
  const isLastTutorialStep = tutorialStep === tutorialSteps.length - 1;

  const completeTutorial = () => {
    try {
      window.localStorage.setItem(tutorialStorageKey, "completed");
    } catch {
      // Ignore storage access failures.
    }
    setTutorialOpen(false);
  };

  async function addSession() {
    if (!canSchedule) return;

    const payload = {
      title: draftSession.title.trim(),
      date: draftSession.date,
      time: draftSession.time,
      interviewer: draftSession.interviewer.trim() || "AI",
    };

    try {
      const created = await backendPost<ScheduledSession>("/api/schedule", payload);
      setSessions((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        return next;
      });
    } catch {
      const created: ScheduledSession = {
        id: String(Date.now()),
        ...payload,
      };
      setSessions((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        return next;
      });
    }

    setScheduleOpen(false);
    setDraftSession((s) => ({
      ...s,
      title: "",
    }));
  }

  return (
    <div className="space-y-6">
      <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              {tutorialStep === 0 && <Compass className="h-5 w-5 text-primary" />}
              {tutorialStep === 1 && (
                <CalendarCheck2 className="h-5 w-5 text-primary" />
              )}
              {tutorialStep === 2 && <BarChart3 className="h-5 w-5 text-primary" />}
              {activeTutorialStep.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              {activeTutorialStep.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4 text-sm">
              <p className="font-medium">{activeTutorialStep.actionHint}</p>
            </div>

            <div className="space-y-2">
              {activeTutorialStep.highlights.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {tutorialSteps.map((step, index) => (
                <span
                  key={step.title}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    index <= tutorialStep ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={completeTutorial}>
              Skip tutorial
            </Button>
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button
                variant="outline"
                disabled={tutorialStep === 0}
                onClick={() => setTutorialStep((step) => Math.max(0, step - 1))}
              >
                Back
              </Button>
              <Button
                onClick={() => {
                  if (isLastTutorialStep) {
                    completeTutorial();
                    return;
                  }
                  setTutorialStep((step) =>
                    Math.min(tutorialSteps.length - 1, step + 1),
                  );
                }}
              >
                {isLastTutorialStep ? "Finish" : "Next"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user.name.split(' ')[0]}!</h1>
          <p className="text-muted-foreground mt-1">
            {welcomeSubtitle}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setTutorialStep(0);
              setTutorialOpen(true);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" /> Product Tour
          </Button>
          <Button variant="outline" asChild>
            <Link href="/history">View History</Link>
          </Button>
          <NewSessionModal templates={interviewTemplates} launchInterviewTour={launchInterviewTour}>
            <Button>
              <Play className="mr-2 h-4 w-4" /> Start New Session
            </Button>
          </NewSessionModal>
        </div>
      </div>

      {/* Latest Insights */}
      {!hasInterviewData ? (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No interview data yet</p>
              <p className="text-xs text-muted-foreground">
                Your analytics are currently empty and will be filled after your
                first completed interview.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <LatestInsights forceEmpty={!hasInterviewData} />

      {/* Quick Actions */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {interviewTemplates.map((template) => (
          <NewSessionModal key={template.id} templates={interviewTemplates} defaultSelectedTemplateId={template.id} launchInterviewTour={launchInterviewTour}>
            <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
              <CardHeader className="p-4 pb-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", template.color)}>
                  {template.icon === 'Code' ? <Zap className="h-4 w-4" /> :
                   template.icon === 'Brain' ? <Target className="h-4 w-4" /> :
                   template.icon === 'Users' ? <Trophy className="h-4 w-4" /> :
                   <Sparkles className="h-4 w-4" />}
                </div>
                <CardTitle className="text-base">{template.title}</CardTitle>
                <CardDescription className="line-clamp-1 text-xs">{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                  <span>{template.duration}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 h-5">{template.difficulty}</Badge>
                </div>
              </CardContent>
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Card>
          </NewSessionModal>
        ))}
        
        <NewSessionModal templates={interviewTemplates} defaultTab="custom" launchInterviewTour={launchInterviewTour}>
          <div className="block h-full">
            <Card className="group relative overflow-hidden border-dashed transition-all hover:shadow-md hover:border-primary cursor-pointer h-full flex items-center justify-center bg-transparent hover:bg-transparent">
              <div className="flex flex-col items-center justify-center w-full h-full text-center p-6">
                <div className="w-12 h-12 mt-4 mb-2 rounded-full bg-accent flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Plus className="h-6 w-6" />
                </div>
                <h3 className="font-semibold">Custom Session</h3>
                <p className="text-sm text-muted-foreground">Configure your own topic</p>
              </div>
            </Card>
          </div>
        </NewSessionModal>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
        {/* Progress Tracker */}
        <div className="col-span-4 space-y-3">
          <ProgressChart forceEmpty={!hasInterviewData} />
          
          <div className="grid gap-3 md:grid-cols-3">
            {effectiveProgressStats.map((stat) => (
              <Card key={stat.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {hasCalculatedProgress(stat) ? (
                    <>
                      <div className="text-2xl font-bold">{formatProgressValue(stat)}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {Number(stat.change) === 0 ? (
                          <span>No change in the last 30 days</span>
                        ) : (
                          <>
                            <span
                              className={cn(
                                "font-medium",
                                Number(stat.change) > 0
                                  ? "text-green-500"
                                  : "text-rose-500",
                              )}
                            >
                              {Number(stat.change) > 0 ? "+" : ""}
                              {Number(stat.change)}
                              {getProgressMetricConfig(stat.label).changeSuffix}
                            </span>{" "}
                            vs previous 30 days
                          </>
                        )}
                      </p>
                      {getProgressMetricConfig(stat.label).isPercentage ? (
                        <Progress
                          value={Math.max(0, Math.min(100, Number(stat.value || 0)))}
                          className="h-1 mt-3"
                        />
                      ) : (
                        <div className="h-1 mt-3 rounded-full bg-muted" />
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-semibold tabular-nums text-muted-foreground">
                        --
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Yet to be filled. Complete at least one session.
                      </p>
                      <div className="h-1 mt-3 rounded-full bg-muted" />
                    </>
                  )}
                </CardContent>
              </Card>
            ))}

            <div className="md:col-span-3">
              <RecentActivity />
            </div>
          </div>
        </div>

        {/* Skills + Upcoming */}
        <div className="col-span-4 lg:col-span-3 space-y-4">
          <SkillsRadar forceEmpty={!hasInterviewData} />

          {/* Upcoming Schedule */}
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Schedule</CardTitle>
              <CardDescription>Your planned practice sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-start gap-4 rounded-lg border p-3 transition-colors hover:bg-accent/50">
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                      <span>{String(new Date(session.date).getDate() || '-')}</span>
                      <span className="text-[10px] uppercase">{String(new Date(session.date).toLocaleString('default', { month: 'short' }) || '-')}</span>
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="font-medium leading-none">{session.title}</p>
                      <p className="text-sm text-muted-foreground">{session.time} • {session.interviewer}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full mt-2">
                      <CalendarIcon className="mr-2 h-4 w-4" /> Schedule Session
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Schedule a session</DialogTitle>
                      <DialogDescription>
                        Add a practice session to your upcoming schedule.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="schedule-title">Topic</Label>
                        <Input
                          id="schedule-title"
                          value={draftSession.title}
                          onChange={(e) =>
                            setDraftSession((s) => ({ ...s, title: e.target.value }))
                          }
                          placeholder="e.g., System Design Practice"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="schedule-date">Date</Label>
                        <Input
                          id="schedule-date"
                          type="date"
                          value={draftSession.date}
                          onChange={(e) =>
                            setDraftSession((s) => ({ ...s, date: e.target.value }))
                          }
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="schedule-time">Time</Label>
                        <Input
                          id="schedule-time"
                          type="time"
                          value={draftSession.time}
                          onChange={(e) =>
                            setDraftSession((s) => ({ ...s, time: e.target.value }))
                          }
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="schedule-interviewer">Interviewer</Label>
                        <Input
                          id="schedule-interviewer"
                          value={draftSession.interviewer}
                          onChange={(e) =>
                            setDraftSession((s) => ({
                              ...s,
                              interviewer: e.target.value,
                            }))
                          }
                          placeholder="AI"
                        />
                      </div>
                    </div>

                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button onClick={addSession} disabled={!canSchedule}>
                        Add session
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      <Skeleton className="h-28 w-full" />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 space-y-3">
          <Skeleton className="h-72 w-full" />
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <div className="md:col-span-3">
              <Skeleton className="h-52 w-full" />
            </div>
          </div>
        </div>
        <div className="col-span-4 lg:col-span-3 space-y-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    </div>
  );
}