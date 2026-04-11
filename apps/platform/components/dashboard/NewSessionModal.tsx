"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { backendPost, backendPostFormData } from "@/lib/backend";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Play, Sparkles, Code, Brain, Users, Zap, Target, Trophy, Edit2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InterviewTemplate } from "@/data/mockData";
import { CustomSessionForm } from "./CustomSessionForm";
import { useTemplates } from "@/hooks/useTemplates";

interface NewSessionModalProps {
  children: React.ReactNode;
  templates: InterviewTemplate[];
  defaultTab?: "templates" | "custom";
  defaultSelectedTemplateId?: string;
}

export function NewSessionModal({ children, templates, defaultTab = "templates", defaultSelectedTemplateId }: NewSessionModalProps) {
  const router = useRouter();
  const { addTemplate, updateTemplate } = useTemplates();
  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(defaultTab);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(defaultSelectedTemplateId ?? null);
  const [editingTemplate, setEditingTemplate] = React.useState<InterviewTemplate | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const [startingText, setStartingText] = React.useState("Starting session...");

  // All templates come from backend (passed as props) — no localStorage merge needed
  const allTemplates = templates;
  const selectedTemplate = allTemplates.find(t => t.id === selectedTemplateId);

  // Reset states when opening/closing
  React.useEffect(() => {
    if (open) {
      setActiveTab(defaultSelectedTemplateId ? "templates" : defaultTab);
      setSelectedTemplateId(defaultSelectedTemplateId ?? null);
      setEditingTemplate(null);
      setIsStarting(false);
      setStartingText("Starting session...");
    }
  }, [open, defaultTab, defaultSelectedTemplateId]);

const handleStartFromTemplate = async () => {
    if (selectedTemplateId) {
      const template = allTemplates.find(t => t.id === selectedTemplateId);
      if (template) {
        setIsStarting(true);
        setStartingText("Creating Database Session...");
        try {
          const data = {
            title: template.title,
            type: template.type,
            description: template.description || "",
            difficulty: template.difficulty || "medium",
            mode: "strict",
            accessType: "link",
            historySnapshotIntervalSec: template.historySnapshotIntervalSec,
            systemPrompt: template.systemPrompt,
          };
          const response = await backendPost<{id: string}>("/api/sessions", data);
          setStartingText("Connecting to AI Interviewer...");
          const params = new URLSearchParams({ sessionId: response.id });
          if (template.historySnapshotIntervalSec) {
            params.set("historyIntervalSec", String(template.historySnapshotIntervalSec));
          }
          router.push(`/interview?${params.toString()}`);
          setOpen(false);
          return;
        } catch (e) {
          console.error("Failed to start session from template", e);
          setIsStarting(false);
        }
      }
      setIsStarting(true);
      setStartingText("Loading Interview Plan...");
      const fallbackParams = new URLSearchParams({
        template: selectedTemplateId,
        mode: "strict",
      });
      if (template?.historySnapshotIntervalSec) {
        fallbackParams.set("historyIntervalSec", String(template.historySnapshotIntervalSec));
      }
      router.push(`/interview?${fallbackParams.toString()}`);
      setOpen(false);
    }
  };

  const handleStartCustom = async (data: any) => {
    setIsStarting(true);
    setStartingText("Registering Interview Plan...");
    try {
      // POST the fully populated form data, including multiple participants/invites
      const response = await backendPost<{id: string}>("/api/sessions", data);

      if (data.files && data.files.length > 0) {
        setStartingText("Indexing context for AI (this may take a few seconds)...");
        let i = 1;
        for (const fileObj of data.files) {
          if (fileObj.file) {
            setStartingText(`Analyzing Document ${i} of ${data.files.length}...`);
            const formData = new FormData();
            formData.append('file', fileObj.file);
            formData.append('doc_type', 'resume');
            formData.append('user_id', 'user');
            try {
              await backendPostFormData<any>(`/api/agent/upload/${response?.id}`, formData);
            } catch (err) {
              console.error("Failed to upload document for RAG:", err);
            }
            i++;
          }
        }
      }

      setStartingText("Requesting Voice Agent...");
      const params = new URLSearchParams({
        sessionId: response.id,
        template: response.id,
        title: data.topic,
        mode: data.mode,
        difficulty: data.difficulty,
        type: data.type,
        persona: data.persona,
        historyIntervalSec: String(data.historySnapshotIntervalSec || 30),
      });
      router.push(`/interview?${params.toString()}`);
      setOpen(false);
    } catch (e) {
      console.error("Failed to start custom session:", e);
      // fallback in case backend is down
      const params = new URLSearchParams({
        custom: "true",
        title: data.topic,
        mode: data.mode,
        difficulty: data.difficulty,
        type: data.type,
        persona: data.persona,
        historyIntervalSec: String(data.historySnapshotIntervalSec || 30),
      });
      router.push(`/interview?${params.toString()}`);
      setOpen(false);
    } finally {
      // In successful route transitions this state is short-lived, but this
      // keeps the modal responsive if navigation is blocked.
      setIsStarting(false);
    }
  };

  const handleEditClick = (e: React.MouseEvent, template: InterviewTemplate) => {
    e.stopPropagation();
    setEditingTemplate(template);
    setActiveTab("custom");
  };

  const handleSaveTemplate = async (data: InterviewTemplate) => {
    try {
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, data);
      } else {
        await addTemplate(data);
      }
      setActiveTab("templates");
      setSelectedTemplateId(data.id);
      window.location.reload();
    } catch (e) {
      console.error("Failed to save template", e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {isStarting && (
          <div className="absolute inset-0 z-50 bg-background/75 backdrop-blur-sm flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
              <Loader2 className="h-4 w-4 animate-spin text-primary min-w-4" />
              <span className="text-sm font-medium whitespace-nowrap">{startingText}</span>
            </div>
          </div>
        )}
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle>Start New Session</DialogTitle>
          <DialogDescription>
            Choose a template or customize your practice session.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "templates" | "custom")} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 border-b shrink-0">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger 
                value="templates" 
                onClick={() => setEditingTemplate(null)}
                className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Templates
              </TabsTrigger>
              <TabsTrigger 
                value="custom" 
                className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Custom
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="templates" className="data-[state=active]:flex flex-col flex-1 min-h-0 p-0 m-0 relative">
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 grid gap-4">
                {allTemplates.map((template) => (
                  <div 
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-accent/50 group",
                      selectedTemplateId === template.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                    )}
                  >
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", template.color)}>
                      {template.icon === 'Code' && <Zap className="h-5 w-5" />}
                      {template.icon === 'Brain' && <Target className="h-5 w-5" />}
                      {template.icon === 'Users' && <Trophy className="h-5 w-5" />}
                      {!['Code', 'Brain', 'Users'].includes(template.icon) && <Sparkles className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{template.title}</h4>
                        <Badge variant="secondary" className="text-xs">{template.difficulty}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                      
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Play className="h-3 w-3" /> {template.duration}
                          </span>
                          <span>•</span>
                          <span>{template.type}</span>
                        </div>
                        
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="opacity-0 group-hover:opacity-100 h-7 text-xs transition-opacity"
                          onClick={(e) => handleEditClick(e, template)}
                        >
                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <DialogFooter className="p-6 pt-4 border-t mt-auto bg-background/95 backdrop-blur-sm z-10 shrink-0">
               <div className="flex items-center justify-between w-full">
                  {selectedTemplate ? (
                     <div className="text-sm text-muted-foreground flex gap-2 items-center">
                        <span className="font-medium text-foreground">{selectedTemplate.title}</span> selected
                     </div>
                  ) : <div></div>}
                  <Button onClick={handleStartFromTemplate} disabled={!selectedTemplateId || isStarting} className="w-36 gap-2">
                     {isStarting ? (
                       <>
                         <Loader2 className="h-4 w-4 animate-spin" />
                         Starting...
                       </>
                     ) : (
                       <>
                         <Play className="h-4 w-4" /> Start Session
                       </>
                     )}
                  </Button>
               </div>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="custom" className="data-[state=active]:flex flex-col flex-1 min-h-0 p-0 m-0 bg-accent/10">
            <CustomSessionForm 
              initialData={editingTemplate}
              onStart={handleStartCustom}
              onSaveTemplate={handleSaveTemplate}
              onCancel={() => setActiveTab("templates")}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
