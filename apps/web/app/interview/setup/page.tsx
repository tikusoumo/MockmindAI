"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  Mic, 
  User, 
  Briefcase,
  Check,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PERSONAS = [
  {
    id: "friendly",
    name: "Friendly Recruiter",
    description: "Warm, encouraging, and focuses on behavioral questions.",
    icon: User,
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20"
  },
  {
    id: "technical",
    name: "Senior Tech Lead",
    description: "Direct, detail-oriented, and digs deep into technical concepts.",
    icon: Briefcase,
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20"
  },
  {
    id: "strict",
    name: "Strict Hiring Manager",
    description: "Professional, skeptical, and challenges your assumptions.",
    icon: FileText,
    color: "bg-red-500/10 text-red-500 border-red-500/20"
  }
];

const VOICES = [
  { id: "alloy", name: "Alloy", gender: "Neutral", description: "Versatile and balanced" },
  { id: "echo", name: "Echo", gender: "Male", description: "Warm and rounded" },
  { id: "fable", name: "Fable", gender: "British", description: "British accent, storytelling" },
  { id: "onyx", name: "Onyx", gender: "Male", description: "Deep and authoritative" },
  { id: "nova", name: "Nova", gender: "Female", description: "Energetic and bright" },
  { id: "shimmer", name: "Shimmer", gender: "Female", description: "Clear and expressive" },
];

export default function SetupPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [selectedPersona, setSelectedPersona] = useState("technical");
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleStart = () => {
    // In a real app, we would save this config to context/store
    // For now, we just navigate to the interview page
    router.push("/interview");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Custom Session Setup</h1>
          <p className="text-muted-foreground">Configure your interview environment</p>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2 space-y-8">
          {/* Topic & Context */}
          <Card>
            <CardHeader>
              <CardTitle>Topic & Context</CardTitle>
              <CardDescription>What do you want to practice today?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topic">Interview Topic</Label>
                <Input 
                  id="topic" 
                  placeholder="e.g. System Design, React Hooks, Behavioral Questions" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="context">Additional Context (Optional)</Label>
                <Textarea 
                  id="context" 
                  placeholder="Paste a job description or specific requirements here..." 
                  className="min-h-[100px]"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Document Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Reference Material</CardTitle>
              <CardDescription>Upload your resume or specific documents for the AI to reference.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-accent/50 transition-colors relative">
                <input 
                  type="file" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.txt"
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 rounded-full bg-primary/10 text-primary">
                    <Upload className="h-6 w-6" />
                  </div>
                  {file ? (
                    <div className="space-y-1">
                      <p className="font-medium text-primary">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-medium">Drop your resume or file here</p>
                      <p className="text-xs text-muted-foreground">PDF, DOCX, or TXT (Max 5MB)</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Persona Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Interviewer Persona</CardTitle>
              <CardDescription>Choose the personality of your AI interviewer.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {PERSONAS.map((persona) => (
                  <div 
                    key={persona.id}
                    className={cn(
                      "relative flex flex-col gap-2 rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md",
                      selectedPersona === persona.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"
                    )}
                    onClick={() => setSelectedPersona(persona.id)}
                  >
                    <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", persona.color)}>
                      <persona.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{persona.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{persona.description}</p>
                    </div>
                    {selectedPersona === persona.id && (
                      <div className="absolute top-2 right-2 text-primary">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Voice Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Voice Settings</CardTitle>
              <CardDescription>Select the voice model.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                {VOICES.map((voice) => (
                  <div 
                    key={voice.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors",
                      selectedVoice === voice.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                    )}
                    onClick={() => setSelectedVoice(voice.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-secondary">
                        <Mic className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{voice.name}</p>
                        <p className="text-xs text-muted-foreground">{voice.gender} • {voice.description}</p>
                      </div>
                    </div>
                    {selectedVoice === voice.id && <Check className="h-4 w-4 text-primary" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Summary & Start */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Ready to Start?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Topic:</span>
                  <span className="font-medium">{topic || "General Interview"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Persona:</span>
                  <span className="font-medium">{PERSONAS.find(p => p.id === selectedPersona)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Voice:</span>
                  <span className="font-medium">{VOICES.find(v => v.id === selectedVoice)?.name}</span>
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={handleStart}>
                Start Interview Session
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
