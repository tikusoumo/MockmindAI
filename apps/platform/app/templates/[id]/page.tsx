"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTemplates } from "@/hooks/useTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { InterviewTemplate } from "@/data/mockData";
import { cn } from "@/lib/utils";

export default function TemplatePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { templates, addTemplate, updateTemplate, deleteTemplate, isLoaded } = useTemplates();

  const isNew = id === "new";

  const [formData, setFormData] = useState<Partial<InterviewTemplate>>({
    title: "",
    type: "Custom",
    duration: "30 min",
    difficulty: "Medium",
    description: "",
    icon: "Code",
    color: "bg-gray-500/10 text-gray-500",
  });

  useEffect(() => {
    if (isLoaded && !isNew) {
      const template = templates.find((t) => t.id === id);
      if (template) {
        setFormData(template);
      } else {
        // Template not found
        router.push("/");
      }
    }
  }, [isLoaded, id, isNew, templates, router]);

  const handleSave = () => {
    if (!formData.title) return; // Basic validation

    if (isNew) {
      const newId = `custom-${Date.now()}`;
      addTemplate({
        ...formData,
        id: newId,
        questions: formData.questions || [],
      } as InterviewTemplate);
    } else {
      updateTemplate(id, formData);
    }
    router.push("/"); // Return to dashboard/home, or stay? Maybe return for now.
    router.refresh();
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this template?")) {
      deleteTemplate(id);
      router.push("/");
    }
  };

  if (!isLoaded) {
     return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{isNew ? "New Template" : "Edit Template"}</h1>
            <p className="text-xs text-muted-foreground">
              {isNew ? "Create a custom interview template" : "Modify existing template settings"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={!formData.title}>
            <Save className="mr-2 h-4 w-4" />
            Save Template
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Define the core details of your interview session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Template Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Frontend Architecture Round"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Interview Type</Label>
                   <Select
                    value={formData.type}
                    onValueChange={(val: any) => setFormData({ ...formData, type: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Technical">Technical</SelectItem>
                      <SelectItem value="Aptitude">Aptitude</SelectItem>
                      <SelectItem value="Machine Coding">Machine Coding</SelectItem>
                      <SelectItem value="Behavioral">Behavioral</SelectItem>
                      <SelectItem value="HR">HR</SelectItem>
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty</Label>
                   <Select
                    value={formData.difficulty}
                    onValueChange={(val: any) => setFormData({ ...formData, difficulty: val })}
                  >
                    <SelectTrigger>
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
              
              <div className="space-y-2">
                 <Label htmlFor="duration">Duration (approx)</Label>
                 <Input 
                    id="duration"
                    placeholder="e.g. 45 min"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: e.target.value})}
                 />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Briefly describe what this interview covers..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="min-h-[100px]"
                />
              </div>
            </CardContent>
          </Card>
          
           {/* Placeholder for Questions Editor - could be a future task */}
           <Card>
            <CardHeader>
                <CardTitle>Questions (Optional)</CardTitle>
                <CardDescription>Add specific questions to be asked by the AI.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="text-sm text-muted-foreground italic">
                    Question editor coming soon. The AI will generate questions based on the description and type for now.
                </div>
            </CardContent>
           </Card>

        </div>
      </div>
    </div>
  );
}
