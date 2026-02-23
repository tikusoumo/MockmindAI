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
  Zap
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
  ProgressStat,
  ScheduledSession,
  User,
} from "@/data/mockData";
import { ProgressChart } from "@/components/dashboard/ProgressChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { SkillsRadar } from "@/components/dashboard/SkillsRadar";
import { LatestInsights } from "@/components/dashboard/LatestInsights";
import { cn } from "@/lib/utils";
import { backendGet, backendPost, useBackendData } from "@/lib/backend";
import {
  fallbackCurrentUser,
  fallbackInterviewTemplates,
  fallbackProgressStats,
  fallbackUpcomingSchedule,
} from "@/lib/fallback-data";
import { NewSessionModal } from "@/components/dashboard/NewSessionModal";

export default function Dashboard() {
  const user = useBackendData<User>("/api/user", fallbackCurrentUser);
  const interviewTemplates = useBackendData<InterviewTemplate[]>(
    "/api/interview-templates",
    fallbackInterviewTemplates
  );
  const progressStats = useBackendData<ProgressStat[]>(
    "/api/progress-stats",
    fallbackProgressStats
  );

  const [sessions, setSessions] = React.useState<ScheduledSession[]>(
    fallbackUpcomingSchedule
  );
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [draftSession, setDraftSession] = React.useState({
    title: "",
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
    interviewer: "AI",
  });

  React.useEffect(() => {
    backendGet<ScheduledSession[]>("/api/schedule")
      .then((items) => setSessions(items))
      .catch(() => setSessions(fallbackUpcomingSchedule));
  }, []);

  const canSchedule =
    draftSession.title.trim().length > 0 &&
    draftSession.date.trim().length > 0 &&
    draftSession.time.trim().length > 0;

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
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user.name.split(' ')[0]}!</h1>
          <p className="text-muted-foreground mt-1">
            You&apos;re on a 3-day streak. Keep up the momentum!
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/history">View History</Link>
          </Button>
          <NewSessionModal templates={interviewTemplates}>
            <Button>
              <Play className="mr-2 h-4 w-4" /> Start New Session
            </Button>
          </NewSessionModal>
        </div>
      </div>

      {/* Latest Insights */}
      <LatestInsights />

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {interviewTemplates.map((template) => (
          <Card key={template.id} className="group relative overflow-hidden transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
            <CardHeader className="p-4 pb-2">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", template.color)}>
                {/* Dynamic icon rendering based on template.icon string would go here, simplified for now */}
                {template.icon === 'Code' && <Zap className="h-4 w-4" />}
                {template.icon === 'Brain' && <Target className="h-4 w-4" />}
                {template.icon === 'Users' && <Trophy className="h-4 w-4" />}
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
        ))}
        
        <Link href="/interview/setup" className="block h-full">
          <Card className="group relative overflow-hidden border-dashed transition-all hover:shadow-md hover:border-primary cursor-pointer h-full flex items-center justify-center">
            <div className="flex flex-col items-center justify-center  w-full h-full text-center p-6">
              <div className="w-12 h-12 mt-4 mb-2 rounded-full bg-accent flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Plus className="h-6 w-6" />
              </div>
              <h3 className="font-semibold">Custom Session</h3>
              <p className="text-sm text-muted-foreground">Configure your own topic</p>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Progress Tracker */}
        <div className="col-span-4 space-y-4">
          <ProgressChart />
          
          <div className="grid gap-4 md:grid-cols-3">
            {progressStats.map((stat) => (
              <Card key={stat.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="text-green-500 font-medium">+{stat.change}%</span> from last month
                  </p>
                  <Progress value={stat.value} className="h-1 mt-3" />
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
          <SkillsRadar />

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
                      <span>{new Date(session.date).getDate()}</span>
                      <span className="text-[10px] uppercase">{new Date(session.date).toLocaleString('default', { month: 'short' })}</span>
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