"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sparkles, UploadCloud, Save, Play, Plus, Trash2, Users } from "lucide-react";
import type { InterviewTemplate } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface CustomSessionFormProps {
  initialData?: InterviewTemplate | null;
  isAdmin?: boolean;
  onStart: (data: any) => void;
  onSaveTemplate?: (data: any) => void;
  onCancel?: () => void;
}

export function CustomSessionForm({ initialData, isAdmin = false, onStart, onSaveTemplate, onCancel }: CustomSessionFormProps) {
  const [topic, setTopic] = React.useState(initialData?.title || "");
  const [description, setDescription] = React.useState(initialData?.description || "");
  const [type, setType] = React.useState<string>(initialData?.type || "Technical");
  const [difficulty, setDifficulty] = React.useState<string>(initialData?.difficulty || "Medium");
  const [mode, setMode] = React.useState<string>(initialData?.mode || "learning");
  const [persona, setPersona] = React.useState<string>("sarah");

  const [interviewerCount, setInterviewerCount] = React.useState<string>("1");
  const [invites, setInvites] = React.useState<{email: string, role: string}[]>([]);
  const [isGlobal, setIsGlobal] = React.useState(false);
  
  // Multiple File Upload State
    const [selectedFiles, setSelectedFiles] = React.useState<{id: string, name: string, size: string, isUploading: boolean, file: File}[]>([]);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const newFiles = Array.from(files).map(file => ({
          id: Math.random().toString(36).substring(7),
          name: file.name,
          size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
          isUploading: true,
          file: file
        }));

        setSelectedFiles(prev => [...prev, ...newFiles]);

        // Simulate individual upload progress for each new file
        // (UI indication only, actual upload happens on Start Session)
        newFiles.forEach(nf => {
          setTimeout(() => {
            setSelectedFiles(current =>
              current.map(f => f.id === nf.id ? { ...f, isUploading: false } : f)
            );
          }, 1000 + Math.random() * 2000);
        });
      }
    };

  const removeFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };
  
  // Update state if initialData changes (e.g., when clicking Edit on a different template)
  React.useEffect(() => {
    if (initialData) {
      setTopic(initialData.title || "");
      setDescription(initialData.description || "");
      setType(initialData.type || "Technical");
      setDifficulty(initialData.difficulty || "Medium");
      setMode(initialData.mode || "learning");
      setIsGlobal(false);
    }
  }, [initialData]);

  const isFormValid = !!topic.trim();

  const addInvite = () => setInvites([...invites, { email: '', role: 'candidate' }]);
  const removeInvite = (index: number) => setInvites(invites.filter((_, i) => i !== index));
  const updateInvite = (index: number, field: string, value: string) => {
    const newInvites = [...invites];
    newInvites[index] = { ...newInvites[index], [field]: value };
    setInvites(newInvites);
  };

  const handleStart = () => {
    onStart({ topic, description, type, difficulty, mode, persona, interviewerCount, invites, files: selectedFiles });
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
        isGlobal,
        interviewerCount,
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
             
             <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept=".pdf,.docx,.txt"
                multiple
             />

             <div 
               onClick={() => fileInputRef.current?.click()}
               className={cn(
                  "border-2 border-dashed border-border rounded-xl transition-all cursor-pointer group flex flex-col items-center justify-center text-center",
                  selectedFiles.length > 0 ? "p-4 border-primary/20 bg-primary/5 hover:bg-primary/10" : "p-8 hover:bg-accent/50 hover:border-primary/50"
               )}
             >
               <div className={cn(
                  "bg-primary/10 rounded-full flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/20 transition-all",
                  selectedFiles.length > 0 ? "w-8 h-8 mb-2" : "w-12 h-12 mb-4"
               )}>
                 <UploadCloud className={cn("text-primary", selectedFiles.length > 0 ? "h-4 w-4" : "h-6 w-6")} />
               </div>
               <p className={cn("font-medium", selectedFiles.length > 0 ? "text-sm" : "text-base")}>
                  {selectedFiles.length > 0 ? "Add more files" : "Click or drag files here"}
               </p>
               {selectedFiles.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-1">Accepts PDF, DOCX, or TXT formats (Max 5MB)</p>
               )}
             </div>

             {selectedFiles.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto px-1 custom-scrollbar">
                   {selectedFiles.map((file) => (
                      <div key={file.id} className="relative border rounded-lg p-3 bg-accent/30 backdrop-blur-sm flex items-center gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
                         <div className="w-8 h-8 bg-primary/20 rounded flex items-center justify-center shrink-0">
                            {file.isUploading ? (
                              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 text-primary" />
                            )}
                         </div>
                         
                         <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                               <p className="font-semibold text-xs truncate uppercase tracking-tight">
                                  {file.isUploading ? "Uploading..." : file.name}
                               </p>
                               {!file.isUploading && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                                  >
                                     <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                               )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                               <span className="text-[10px] text-muted-foreground font-medium">{file.size}</span>
                               {!file.isUploading && (
                                  <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-1 py-0 rounded font-bold uppercase tracking-wider">Ready</span>
                               )}
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
             )}
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

          {/* Section: Participants */}
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Participants</h3>
              <p className="text-sm text-muted-foreground">Manage interviewers and invite others to the session.</p>
            </div>
            
            <div className="grid gap-6">
              <div className="grid gap-2">
                <Label>Number of AI Interviewers</Label>
                <Select value={interviewerCount} onValueChange={setInterviewerCount}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select number" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Interviewer</SelectItem>
                    <SelectItem value="2">2 Interviewers (Panel)</SelectItem>
                    <SelectItem value="3">3 Interviewers (Panel)</SelectItem>
                    <SelectItem value="4">4 Interviewers (Panel)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Invite Others</Label>
                  <Button variant="outline" size="sm" onClick={addInvite} className="h-8 gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add Participant
                  </Button>
                </div>
                
                {invites.length === 0 && (
                  <div className="text-sm text-muted-foreground border rounded-md p-4 text-center bg-muted/20">
                    No additional participants. You will be the only candidate.
                  </div>
                )}
                
                {invites.map((invite, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input 
                      placeholder="Email address..." 
                      value={invite.email}
                      onChange={(e) => updateInvite(index, 'email', e.target.value)}
                      className="flex-1"
                    />
                    <Select value={invite.role} onValueChange={(val) => updateInvite(index, 'role', val)}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="candidate">Candidate</SelectItem>
                        <SelectItem value="interviewer">Human Interviewer</SelectItem>
                        <SelectItem value="observer">Observer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => removeInvite(index)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Section: Admin / Visibility */}
          {isAdmin && (
            <section className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-lg font-semibold tracking-tight">Global Template</h3>
                  <p className="text-sm text-muted-foreground">Make this template available to all users.</p>
                </div>
                <Switch 
                  checked={isGlobal} 
                  onCheckedChange={setIsGlobal}
                />
              </div>
            </section>
          )}

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
