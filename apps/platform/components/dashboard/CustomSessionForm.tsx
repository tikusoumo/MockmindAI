"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, UploadCloud, Save, Play } from "lucide-react";
import type { InterviewTemplate } from "@/data/mockData";

interface CustomSessionFormProps {
  initialData?: InterviewTemplate | null;
  onStart: (data: any) => void;
  onSaveTemplate?: (data: any) => void;
  onCancel?: () => void;
}

export function CustomSessionForm({ initialData, onStart, onSaveTemplate, onCancel }: CustomSessionFormProps) {
  const [topic, setTopic] = React.useState(initialData?.title || "");
  const [description, setDescription] = React.useState(initialData?.description || "");
  const [type, setType] = React.useState<string>(initialData?.type || "Technical");
  const [difficulty, setDifficulty] = React.useState<string>(initialData?.difficulty || "Medium");
  const [mode, setMode] = React.useState<string>(initialData?.mode || "learning");
  const [persona, setPersona] = React.useState<string>("sarah");
  
  // Update state if initialData changes (e.g., when clicking Edit on a different template)
  React.useEffect(() => {
    if (initialData) {
      setTopic(initialData.title || "");
      setDescription(initialData.description || "");
      setType(initialData.type || "Technical");
      setDifficulty(initialData.difficulty || "Medium");
      setMode(initialData.mode || "learning");
    }
  }, [initialData]);

  const isFormValid = !!topic.trim();

  const handleStart = () => {
    onStart({ topic, description, type, difficulty, mode, persona });
  };

  const handleSave = () => {
    if (onSaveTemplate) {
      onSaveTemplate({ 
        id: initialData?.id || `custom-${Date.now()}`,
        title: topic, 
        description, 
        type, 
        difficulty, 
        mode,
        icon: initialData?.icon || 'Sparkles',
        color: initialData?.color || 'bg-blue-500/10 text-blue-500',
        duration: initialData?.duration || '45 min'
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-8 pb-10">
          
          {/* Section 1: Core Details */}
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Core Details</h3>
              <p className="text-sm text-muted-foreground">Define what the interview is about.</p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="topic">Topic / Role <span className="text-red-500">*</span></Label>
                <Input 
                  id="topic" 
                  placeholder="e.g. Senior Frontend Developer, System Design..." 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea 
                  id="description" 
                  placeholder="Focus areas, specific technologies, or competencies..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="resize-none h-20"
                />
              </div>
            </div>
          </section>

          {/* Section 2: Materials */}
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Materials</h3>
              <p className="text-sm text-muted-foreground">Upload resumes, job descriptions, or rubrics for the AI to analyze.</p>
            </div>
            
            <div className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors cursor-pointer group">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UploadCloud className="h-6 w-6 text-primary" />
              </div>
              <p className="font-medium">Click or drag files here</p>
              <p className="text-sm text-muted-foreground mt-1">Accepts PDF, DOCX, or TXT formats (Max 5MB)</p>
            </div>
          </section>

          {/* Section 3: Configuration */}
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Configuration</h3>
              <p className="text-sm text-muted-foreground">Set up the environment and AI behavior.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Round Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Machine Coding">Machine Coding (Includes IDE)</SelectItem>
                    <SelectItem value="Technical">Technical</SelectItem>
                    <SelectItem value="Aptitude">Aptitude</SelectItem>
                    <SelectItem value="Behavioral">Behavioral</SelectItem>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="Custom">Other / Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger id="difficulty">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="mode">Interview Mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger id="mode">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="learning">Learning (Hints & Guidance)</SelectItem>
                    <SelectItem value="strict">Strict (Mock Interview)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="persona">Interviewer Persona</Label>
                <Select value={persona} onValueChange={setPersona}>
                  <SelectTrigger id="persona">
                    <SelectValue placeholder="Select persona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sarah">Sarah (Friendly & Encouraging)</SelectItem>
                    <SelectItem value="david">David (Professional & Direct)</SelectItem>
                    <SelectItem value="alex">Alex (Inquisitive & Detail-oriented)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <div className="rounded-lg bg-blue-500/10 p-4 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
               <Sparkles className="h-4 w-4 text-blue-500" />
               <h4 className="font-medium text-blue-500">AI Adaptation Active</h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
               The AI interviewer will adapt its questioning style based on the <b>{type}</b> round type and <b>{difficulty}</b> difficulty. Hand-uploaded materials will be ingested automatically into the session context.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 pt-4 border-t mt-auto bg-background/95 backdrop-blur-sm z-10 flex items-center justify-between">
         <div>
           {onSaveTemplate && (
             <Button variant="outline" onClick={handleSave} disabled={!isFormValid} className="w-36 gap-2">
               <Save className="h-4 w-4" /> Save Template
             </Button>
           )}
         </div>
         <div className="flex gap-2">
           {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
           <Button onClick={handleStart} disabled={!isFormValid} className="w-36 gap-2">
             <Play className="h-4 w-4" /> Start Session
           </Button>
         </div>
      </div>
    </div>
  );
}
