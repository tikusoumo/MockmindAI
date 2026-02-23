"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Play, Sparkles, Code, Brain, Users, Zap, Target, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InterviewTemplate } from "@/data/mockData";

interface NewSessionModalProps {
  children: React.ReactNode;
  templates: InterviewTemplate[];
}

export function NewSessionModal({ children, templates }: NewSessionModalProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("templates");
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null);
  
  // Custom session state
  const [customTopic, setCustomTopic] = React.useState("");
  const [customMode, setCustomMode] = React.useState("learning"); // specific for RAG mode
  const [customDiff, setCustomDiff] = React.useState("Medium");

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleStart = () => {
    if (activeTab === "templates" && selectedTemplateId) {
      router.push(`/interview?template=${selectedTemplateId}&mode=strict`);
    } else if (activeTab === "custom" && customTopic) {
      const params = new URLSearchParams({
        custom: "true",
        title: customTopic,
        mode: customMode,
        difficulty: customDiff,
      });
      router.push(`/interview?${params.toString()}`);
    }
    setOpen(false);
  };

  const isFormValid = (activeTab === "templates" && !!selectedTemplateId) || 
                      (activeTab === "custom" && !!customTopic);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Start New Session</DialogTitle>
          <DialogDescription>
            Choose a template or customize your practice session.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 border-b">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger 
                value="templates" 
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

          <TabsContent value="templates" className="flex-1 min-h-0 p-0 m-0 relative">
            <ScrollArea className="h-full">
              <div className="p-6 grid gap-4">
                {templates.map((template) => (
                  <div 
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-accent/50",
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
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <Play className="h-3 w-3" /> {template.duration}
                        </span>
                        <span>•</span>
                        <span>{template.type}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="custom" className="flex-1 p-6 space-y-4 m-0">
             <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="topic">Topic / Role</Label>
                <Input 
                  id="topic" 
                  placeholder="e.g. Senior React Developer, System Design..." 
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="mode">Mode</Label>
                <Select value={customMode} onValueChange={setCustomMode}>
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
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select value={customDiff} onValueChange={setCustomDiff}>
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
            </div>
            
             <div className="rounded-lg bg-blue-500/10 p-4 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                   <Sparkles className="h-4 w-4 text-blue-400" />
                   <h4 className="font-medium text-blue-400">AI Adaptation</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                   The AI interviewer will adapt specifically to the topic you provide. 
                   Be specific about the role and level (e.g., "Senior Backend Engineer") for best results.
                </p>
             </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="p-6 pt-2 border-t mt-auto bg-background/95 backdrop-blur-sm z-10">
           <div className="flex items-center justify-between w-full">
              {activeTab === 'templates' && selectedTemplate ? (
                 <div className="text-sm text-muted-foreground">
                    Selected: <span className="font-medium text-foreground">{selectedTemplate.title}</span>
                 </div>
              ) : <div></div>}
              <Button onClick={handleStart} disabled={!isFormValid} className="w-32">
                 Start Session
              </Button>
           </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
