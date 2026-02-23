"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTemplates } from "@/hooks/useTemplates";
import { InterviewMode } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  FileText,
  GraduationCap,
  Shield,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function InterviewSetupPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <SetupContent />
    </Suspense>
  );
}

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const { templates, isLoaded, updateTemplate } = useTemplates();
  const template = templates.find((t) => t.id === templateId);

  const [mode, setMode] = useState<InterviewMode>(template?.mode || "strict");
  const [isStarting, setIsStarting] = useState(false);

  const handleStartInterview = async () => {
    if (!template) return;
    
    setIsStarting(true);
    
    // Save mode selection to template
    updateTemplate(template.id, { mode });
    
    // Navigate to interview with mode in query
    router.push(`/interview?template=${template.id}&mode=${mode}`);
  };

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground mb-4">Template not found</p>
        <Button asChild>
          <Link href="/templates">Browse Templates</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/templates">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Interview Setup</h1>
          <p className="text-muted-foreground">Configure your session before starting</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Template Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">{template.title}</CardTitle>
            <CardDescription>{template.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{template.duration}</span>
            </div>
            <Badge variant="outline" className={cn(
              template.difficulty === 'Easy' ? "border-green-500/20 text-green-500" :
              template.difficulty === 'Medium' ? "border-yellow-500/20 text-yellow-500" :
              "border-red-500/20 text-red-500"
            )}>
              {template.difficulty}
            </Badge>
            <Badge variant="secondary">{template.type}</Badge>
            
            {template.documents && template.documents.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Documents Loaded:</p>
                <div className="space-y-1">
                  {template.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 text-xs">
                      <FileText className="h-3 w-3" />
                      <span className="truncate">{doc.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mode Selection */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Select Interview Mode</CardTitle>
            <CardDescription>
              Choose how the AI interviewer will behave during your session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as InterviewMode)}
              className="space-y-4"
            >
              {/* Learning Mode */}
              <label
                htmlFor="learning"
                className={cn(
                  "flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                  mode === "learning"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <RadioGroupItem value="learning" id="learning" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <GraduationCap className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">Learning Mode</span>
                    <Badge variant="secondary" className="text-xs">Recommended for Practice</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Get real-time coaching and feedback as you answer. The AI will provide 
                    guidance, suggest improvements, and help you structure better responses.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-blue-500/20 text-blue-500">
                      Real-time feedback
                    </Badge>
                    <Badge variant="outline" className="border-blue-500/20 text-blue-500">
                      Follow-up questions
                    </Badge>
                    <Badge variant="outline" className="border-blue-500/20 text-blue-500">
                      Coaching tips
                    </Badge>
                  </div>
                </div>
              </label>

              {/* Strict Mode */}
              <label
                htmlFor="strict"
                className={cn(
                  "flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                  mode === "strict"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <RadioGroupItem value="strict" id="strict" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-5 w-5 text-purple-500" />
                    <span className="font-medium">Strict Mode</span>
                    <Badge variant="secondary" className="text-xs">Real Interview Simulation</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Experience a realistic interview with no AI assistance. Questions are asked 
                    in sequence, and detailed feedback is provided only after the session ends.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-purple-500/20 text-purple-500">
                      No interruptions
                    </Badge>
                    <Badge variant="outline" className="border-purple-500/20 text-purple-500">
                      Realistic timing
                    </Badge>
                    <Badge variant="outline" className="border-purple-500/20 text-purple-500">
                      Post-session report
                    </Badge>
                  </div>
                </div>
              </label>
            </RadioGroup>

            {/* Start Button */}
            <div className="mt-6 flex justify-end">
              <Button 
                size="lg" 
                onClick={handleStartInterview}
                disabled={isStarting}
                className="gap-2"
              >
                {isStarting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Start Interview
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
