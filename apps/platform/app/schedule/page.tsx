"use client";

import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Video, Plus, CalendarIcon, Settings, CalendarDays, Zap, Trash } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function SchedulePage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("10:00");
  const [newCategory, setNewCategory] = useState("practice");
  const [newDuration, setNewDuration] = useState("30");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      
      const [sessionsRes, routinesRes, googleRes] = await Promise.all([
        fetch('/api/schedule', { headers }),
        fetch('/api/schedule/routines', { headers }),
        fetch('/api/schedule/google/status', { headers })
      ]);

      if (sessionsRes.ok) setSessions(await sessionsRes.json());
      if (routinesRes.ok) setRoutines(await routinesRes.json());
      if (googleRes.ok) {
        const { connected } = await googleRes.json();
        setGoogleConnected(connected);
      }
    } catch (error) {
      console.error("Error fetching schedule data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!date || !newTitle) {
      toast.error("Date and title are required.");
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Combine date and time
      const sessionDate = new Date(date);
      const [hours, minutes] = newTime.split(':');
      sessionDate.setHours(parseInt(hours), parseInt(minutes), 0);

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          date: sessionDate.toISOString(),
          time: newTime,
          category: newCategory,
          duration: parseInt(newDuration),
        })
      });

      if (res.ok) {
        toast.success("Session scheduled successfully.");
        setIsNewSessionOpen(false);
        fetchData();
      } else {
        throw new Error("Failed to create session");
      }
    } catch (e) {
      toast.error("Could not schedule session.");
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/schedule/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Session removed.");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateRoutine = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/schedule/routines/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "AI Suggested Weekly Prep",
          frequency: "weekly",
          focusAreas: ["System Design", "Behavioral"],
          duration: 45
        })
      });
      if (res.ok) {
        toast.success("AI has built a new practice routine for you.");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleGoogleCalendar = async () => {
    try {
      const token = localStorage.getItem('token');
      if (googleConnected) {
        await fetch('/api/schedule/google/disconnect', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        setGoogleConnected(false);
        toast("Google Calendar sync paused.");
      } else {
        // In real app, this redirects to OAuth flow. 
        // For demo, we just simulate connecting.
        await fetch('/api/schedule/google/connect', { 
          method: 'POST', 
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: { dummy: "token" } })
        });
        setGoogleConnected(true);
        toast.success("Google Calendar sync active.");
      }
    } catch(e) {
      console.error(e);
    }
  };

  // Filter sessions by selected date
  const selectedDateSessions = sessions.filter(s => {
    if (!date) return false;
    const sDate = new Date(s.date);
    return sDate.getDate() === date.getDate() && sDate.getMonth() === date.getMonth() && sDate.getFullYear() === date.getFullYear();
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Manage your AI practice routines and integrated calendar.
          </p>
        </div>
        
        <Dialog open={isNewSessionOpen} onOpenChange={setIsNewSessionOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Schedule New</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Practice Session</DialogTitle>
              <DialogDescription>Add a new session to your calendar.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. System Design Mock" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Date</Label>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? date.toLocaleDateString() : <span>Pick a date</span>}
                  </Button>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="time">Time</Label>
                  <Input id="time" type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="practice">Practice</SelectItem>
                      <SelectItem value="mock">Mock Interview</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Duration (min)</Label>
                  <Input type="number" value={newDuration} onChange={e => setNewDuration(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewSessionOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateSession}>Schedule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
        {/* Left Panel: Calendar & Automations */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-0 border-none shadow-none">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border shadow-sm w-full"
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full",
                  month: "space-y-4 w-full",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex w-full justify-between",
                  row: "flex w-full justify-between mt-2",
                  cell: "h-12 w-full text-center text-sm p-0 flex items-center justify-center relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  day: "h-10 w-10 p-0 font-normal aria-selected:opacity-100 mx-auto",
                }}
                components={{
                  DayContent: (props) => {
                    const sessionOnDay = sessions.find(s => {
                      const sd = new Date(s.date);
                      return sd.getDate() === props.date.getDate() && sd.getMonth() === props.date.getMonth();
                    });
                    
                    return (
                      <div className="relative flex items-center justify-center h-full w-full">
                        {props.date.getDate()}
                        {sessionOnDay && (
                          <div className="absolute bottom-[-2px] left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                        )}
                      </div>
                    )
                  }
                }}
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-yellow-500" /> AI Practice Routine
                </CardTitle>
                <CardDescription>Let AI build your optimal schedule.</CardDescription>
              </CardHeader>
              <CardContent>
                {routines.length > 0 ? (
                  <div className="space-y-3">
                    {routines.map(r => (
                      <div key={r.id} className="p-3 bg-secondary/50 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold">{r.title}</h4>
                          <Badge variant="outline">{r.frequency}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-lg">
                    No active routines. Connect your goals to get an AI-generated weekly plan.
                  </p>
                )}
              </CardContent>
              <CardFooter>
                <Button variant="secondary" className="w-full" onClick={handleGenerateRoutine}>
                  Generate Routine
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center">
                  <CalendarDays className="w-5 h-5 mr-2 text-blue-500" /> Google Calendar
                </CardTitle>
                <CardDescription>Two-way sync with your primary calendar.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${googleConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm font-medium">{googleConnected ? 'Connected' : 'Disconnected'}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant={googleConnected ? "outline" : "default"} className="w-full" onClick={toggleGoogleCalendar}>
                  {googleConnected ? "Disconnect Calendar" : "Connect Google Calendar"}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>

        {/* Right Panel: Sessions Context */}
        <div className="space-y-6">
          <Card className="h-full border-l-4 border-l-primary/50">
            <CardHeader className="bg-muted/20 border-b">
              <CardTitle className="text-lg">
                {date?.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </CardTitle>
              <CardDescription>Sessions scheduled for this day.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 grid gap-4">
              {loading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>
              ) : selectedDateSessions.length > 0 ? (
                selectedDateSessions.map((session) => (
                  <div key={session.id} className="group flex flex-col rounded-xl border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold leading-tight">{session.title}</h4>
                      {session.isAiSuggested && <Badge variant="secondary" className="text-[10px]"><Zap className="w-3 h-3 mr-1"/> AI</Badge>}
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 bg-muted/30 p-2 rounded-md">
                      <div className="flex items-center"><Clock className="mr-1 h-3 w-3" /> {session.time}</div>
                      <div className="flex items-center"><Video className="mr-1 h-3 w-3" /> {session.interviewer}</div>
                    </div>
                    
                    <div className="flex gap-2 mt-4 pt-4 border-t items-center justify-between">
                      <Button variant="default" size="sm" className="w-full">Join</Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteSession(session.id)}>
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center border rounded-xl bg-muted/10 border-dashed">
                  <div className="bg-primary/10 p-3 rounded-full mb-3 text-primary">
                    <CalendarIcon className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-semibold">No Sessions</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Your schedule is clear for this day.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setIsNewSessionOpen(true)}>Book a Time</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
