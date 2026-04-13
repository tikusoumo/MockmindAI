"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScheduleBreadcrumb } from "@/components/schedule/ScheduleBreadcrumb";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { backendGet, backendPost } from "@/lib/backend";

type ScheduledSession = {
  id: string;
  inviteEmailStatus?: "sent" | "failed" | "skipped";
  inviteEmailMessage?: string;
  inviteEmailTarget?: string;
};

type CurrentUser = {
  email?: string | null;
};

function defaultDateString(rawDate: string | null): string {
  if (!rawDate) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return defaultDateString(null);
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate(),
  ).padStart(2, "0")}`;
}

export default function NewScheduleTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialDate = useMemo(
    () => defaultDateString(searchParams.get("date")),
    [searchParams],
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("10:00");
  const [inviteEmail, setInviteEmail] = useState("");
  const [interviewer, setInterviewer] = useState("AI Coach");
  const [category, setCategory] = useState("practice");
  const [duration, setDuration] = useState("45");
  const [recurrencePattern, setRecurrencePattern] = useState("none");
  const [customIntervalDays, setCustomIntervalDays] = useState("4");
  const [recurrenceTime, setRecurrenceTime] = useState("10:00");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [projectPillar, setProjectPillar] = useState("communication");
  const [deepWork, setDeepWork] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayDate = useMemo(() => defaultDateString(null), []);
  const controlClassName = "h-11";

  useEffect(() => {
    const hydrateInviteEmail = async () => {
      try {
        const user = await backendGet<CurrentUser>("/api/user");
        if (user?.email) {
          setInviteEmail((prev) => prev || user.email || "");
        }
      } catch {
        // optional enhancement; ignore if user endpoint is unavailable
      }
    };

    void hydrateInviteEmail();
  }, []);

  const getRecurrenceIntervalDays = (): number | undefined => {
    if (recurrencePattern === "none") {
      return undefined;
    }
    if (recurrencePattern === "daily") {
      return 1;
    }
    if (recurrencePattern === "alternating-day") {
      return 2;
    }
    if (recurrencePattern === "after-two-days") {
      return 3;
    }

    const parsed = Number.parseInt(customIntervalDays, 10);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.max(1, Math.min(30, parsed));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Please choose a valid date.");
      return;
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      toast.error("Please choose a valid time.");
      return;
    }

    const scheduledAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error("Invalid date/time. Please update the schedule values.");
      return;
    }

    if (scheduledAt.getTime() < Date.now() - 60 * 1000) {
      toast.error("You cannot schedule a task in the past.");
      return;
    }

    const inviteEmailTrimmed = inviteEmail.trim();
    if (!inviteEmailTrimmed) {
      toast.error("Invite Email is required to deliver schedule and assessment links.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(inviteEmailTrimmed)) {
      toast.error("Please enter a valid Invite Email address.");
      return;
    }

    const recurrenceIntervalDays = getRecurrenceIntervalDays();
    if (recurrencePattern !== "none" && !recurrenceIntervalDays) {
      toast.error("Please configure a valid recurrence interval.");
      return;
    }

    if (recurrencePattern !== "none" && !/^\d{2}:\d{2}$/.test(recurrenceTime)) {
      toast.error("Please choose a valid recurrence time.");
      return;
    }

    if (recurrencePattern !== "none" && recurrenceEndDate) {
      const recurrenceEnd = new Date(`${recurrenceEndDate}T23:59:59`);
      if (Number.isNaN(recurrenceEnd.getTime()) || recurrenceEnd < scheduledAt) {
        toast.error("Recurrence end date must be on or after the first session date.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const created = await backendPost<ScheduledSession>("/api/schedule", {
        title: title.trim(),
        description:
          description.trim() ||
          `Pillar: ${projectPillar}${deepWork ? " • Deep Work" : ""}`,
        date,
        time,
        inviteEmail: inviteEmailTrimmed,
        interviewer: interviewer.trim() || "AI Coach",
        category,
        duration: Number.parseInt(duration, 10) || 45,
        recurrence: recurrencePattern === "none" ? undefined : "interval_days",
        recurrenceIntervalDays,
        recurrenceTime: recurrencePattern === "none" ? undefined : recurrenceTime,
        recurrenceEndDate:
          recurrencePattern === "none" || !recurrenceEndDate
            ? undefined
            : recurrenceEndDate,
      });

      if (created.inviteEmailStatus === "sent") {
        toast.success("Task scheduled and invite email sent.");
      } else {
        toast.warning(
          created.inviteEmailMessage ||
            "Task scheduled, but invite email was not delivered.",
        );
      }
      router.push(`/schedule/tasks?sessionId=${created.id}`);
    } catch (error) {
      console.error("Failed scheduling task", error);
      toast.error("Could not schedule this task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      <ScheduleBreadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Schedule", href: "/schedule" },
          { label: "Task Workspace", href: "/schedule/tasks" },
          { label: "Schedule Task" },
        ]}
      />

      <section className="rounded-3xl border bg-[radial-gradient(circle_at_85%_5%,rgba(16,185,129,0.15),transparent_30%),radial-gradient(circle_at_0%_95%,rgba(59,130,246,0.14),transparent_35%)] p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Schedule / New Task
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Schedule Task</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a focused prep block with a cleaner form flow and direct links to
          calendar and assessment steps.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Task Details</CardTitle>
            <CardDescription>
              These fields create a scheduled session and trigger invite links.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="task-title">Task Headline</Label>
              <Input
                id="task-title"
                className={controlClassName}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Behavioral: conflict resolution story"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-context">Task Context</Label>
              <Textarea
                id="task-context"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Summarize goals, examples, and expected outcomes for this session."
                className="min-h-36"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="task-date">Date</Label>
                <Input
                  id="task-date"
                  className={controlClassName}
                  type="date"
                  min={todayDate}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-time">Time</Label>
                <Input
                  id="task-time"
                  className={controlClassName}
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="task-invite-email">Invite Email</Label>
                <Input
                  id="task-invite-email"
                  className={controlClassName}
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="candidate@company.com"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="task-interviewer">Interviewer</Label>
                <Input
                  id="task-interviewer"
                  className={controlClassName}
                  value={interviewer}
                  onChange={(event) => setInterviewer(event.target.value)}
                />
              </div>

            </div>

            <div className="grid gap-4 md:grid-cols-2">

              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className={controlClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="practice">Practice</SelectItem>
                    <SelectItem value="mock">Mock Interview</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="task-duration">Duration (mins)</Label>
                <Input
                  id="task-duration"
                  className={controlClassName}
                  type="number"
                  min={15}
                  max={240}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Planning Options</CardTitle>
              <CardDescription>Shape how this task should run.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Recurrence</Label>
                <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
                  <SelectTrigger className={controlClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No recurrence</SelectItem>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="alternating-day">Every alternating day</SelectItem>
                    <SelectItem value="after-two-days">After two days</SelectItem>
                    <SelectItem value="custom">Custom interval (N days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recurrencePattern !== "none" ? (
                <>
                  {recurrencePattern === "custom" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="custom-interval">Run every how many days?</Label>
                      <Input
                        id="custom-interval"
                        className={controlClassName}
                        type="number"
                        min={1}
                        max={30}
                        value={customIntervalDays}
                        onChange={(event) => setCustomIntervalDays(event.target.value)}
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <Label htmlFor="recurrence-time">Recurrence time</Label>
                    <Input
                      id="recurrence-time"
                      className={controlClassName}
                      type="time"
                      value={recurrenceTime}
                      onChange={(event) => setRecurrenceTime(event.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="recurrence-end">Repeat until (optional)</Label>
                    <Input
                      id="recurrence-end"
                      className={controlClassName}
                      type="date"
                      min={date || todayDate}
                      value={recurrenceEndDate}
                      onChange={(event) => setRecurrenceEndDate(event.target.value)}
                    />
                  </div>
                </>
              ) : null}

              <div className="grid gap-2">
                <Label>Project Pillar</Label>
                <Select value={projectPillar} onValueChange={setProjectPillar}>
                  <SelectTrigger className={controlClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="communication">Communication</SelectItem>
                    <SelectItem value="system-design">System Design</SelectItem>
                    <SelectItem value="coding">Coding</SelectItem>
                    <SelectItem value="leadership">Leadership</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Deep Work Mode</p>
                  <p className="text-xs text-muted-foreground">
                    Prioritize interruption-free prep blocks.
                  </p>
                </div>
                <Switch checked={deepWork} onCheckedChange={setDeepWork} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="inline-flex w-full items-center gap-2 rounded-md border px-3 py-2">
                <CalendarDays className="h-4 w-4 text-cyan-500" />
                Calendar link in invite email
              </div>
              <div className="inline-flex w-full items-center gap-2 rounded-md border px-3 py-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Assessment link in invite email
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/schedule/tasks">Cancel</Link>
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting} className="gap-2">
            <Lock className="h-4 w-4" />
            {isSubmitting ? "Scheduling..." : "Lock & Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
