"use client";

import { useState } from "react";
import { useTemplates } from "@/hooks/useTemplates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Clock, Brain, Code, Users, Play, Trash2, Pencil, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type { InterviewTemplate } from "@/data/mockData";

const ICON_OPTIONS = ["Brain", "Code", "Users", "Zap", "Target"];
const COLOR_OPTIONS = [
  { label: "Blue", value: "bg-blue-500" },
  { label: "Green", value: "bg-green-500" },
  { label: "Orange", value: "bg-orange-500" },
  { label: "Indigo", value: "bg-indigo-500" },
  { label: "Rose", value: "bg-rose-500" },
];

function TemplateIcon({ icon, className }: { icon: string; className?: string }) {
  if (icon === "Code") return <Code className={cn("h-4 w-4", className)} />;
  if (icon === "Users") return <Users className={cn("h-4 w-4", className)} />;
  return <Brain className={cn("h-4 w-4", className)} />;
}

function CreateTemplateDialog({ onSave }: { onSave: (t: InterviewTemplate) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    duration: "45 min",
    difficulty: "Medium" as "Easy" | "Medium" | "Hard",
    type: "Custom" as any,
    icon: "Brain",
    color: "bg-blue-500",
  });

  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave({
      ...form,
      id: `tpl-${Date.now()}`,
      questions: [],
    });
    setOpen(false);
    setForm({ title: "", description: "", duration: "45 min", difficulty: "Medium", type: "Custom", icon: "Brain", color: "bg-blue-500" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Create Template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Interview Template</DialogTitle>
          <DialogDescription>Define a reusable interview configuration.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="e.g. System Design Round" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input placeholder="Short description of the template" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Input placeholder="45 min" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technical">Technical</SelectItem>
                  <SelectItem value="Behavioral">Behavioral</SelectItem>
                  <SelectItem value="Machine Coding">Machine Coding</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="Aptitude">Aptitude</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Select value={form.color} onValueChange={(v) => setForm({ ...form, color: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.title.trim()}>Create Template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TemplatesIndexPage() {
  const { templates, isLoaded, addTemplate, deleteTemplate, error } = useTemplates();
  const router = useRouter();

  if (!isLoaded) {
    return (
      <div className="flex flex-col h-full bg-background p-6 space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview Templates</h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            {error === "offline" ? (
              <><WifiOff className="h-3.5 w-3.5 text-amber-500" /><span className="text-amber-500 text-sm">Offline — showing cached templates</span></>
            ) : (
              <><Wifi className="h-3.5 w-3.5 text-green-500" /><span className="text-sm">{templates.length} templates available</span></>
            )}
          </p>
        </div>
        <CreateTemplateDialog onSave={addTemplate} />
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] text-center space-y-4 border-2 border-dashed border-border rounded-xl">
          <Brain className="h-12 w-12 text-muted-foreground/30" />
          <div>
            <p className="font-semibold text-lg">No templates yet</p>
            <p className="text-muted-foreground text-sm">Create your first template to get started</p>
          </div>
          <CreateTemplateDialog onSave={addTemplate} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="flex flex-col hover:shadow-lg transition-all cursor-pointer group hover:border-primary/40"
              onClick={() => router.push(`/templates/${template.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className={cn("p-1.5 rounded-lg", template.color)}>
                    <TemplateIcon icon={template.icon} className="text-white" />
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      template.difficulty === "Easy" ? "border-green-500/20 text-green-500 bg-green-500/10" :
                      template.difficulty === "Medium" ? "border-yellow-500/20 text-yellow-500 bg-yellow-500/10" :
                      "border-red-500/20 text-red-500 bg-red-500/10"
                    )}
                  >
                    {template.difficulty}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-base">{template.title}</CardTitle>
                <CardDescription className="line-clamp-2 min-h-[32px] text-xs">
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-2">
                <div className="flex items-center text-sm text-muted-foreground gap-4">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {template.duration}
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-5">{template.type}</Badge>
                </div>
              </CardContent>
              <CardFooter className="pt-0 gap-2">
                <Button
                  className="flex-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  variant="default"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/interview?template=${template.id}`);
                  }}
                >
                  <Play className="mr-1.5 h-3 w-3" /> Start Session
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/templates/${template.id}`);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Template?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete &ldquo;{template.title}&rdquo;. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteTemplate(template.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
