
"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { upcomingSchedule } from "@/data/mockData";
import { Clock, Video, Calendar as CalendarIcon, Plus } from "lucide-react";

export default function SchedulePage() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Manage your upcoming practice sessions.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Schedule New
        </Button>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Sessions</CardTitle>
              <CardDescription>You have {upcomingSchedule.length} sessions scheduled.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {upcomingSchedule.map((session) => (
                <div
                  key={session.id}
                  className="flex items-start justify-between rounded-lg border p-4 transition-all hover:bg-accent/50"
                >
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                      <span className="text-lg">{new Date(session.date).getDate()}</span>
                      <span className="text-[10px] uppercase">{new Date(session.date).toLocaleString('default', { month: 'short' })}</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-semibold leading-none">{session.title}</h4>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{session.time}</span>
                        <span>•</span>
                        <Video className="h-3 w-3" />
                        <span>{session.interviewer}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Join
                  </Button>
                </div>
              ))}
              
              {upcomingSchedule.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No upcoming sessions. Schedule one to get started!
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border shadow-sm"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
