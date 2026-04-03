"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTemplates } from "@/hooks/useTemplates";
import { CustomSessionForm } from "@/components/dashboard/CustomSessionForm";
import { toast } from "sonner";
import { InterviewTemplate } from "@/data/mockData";

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const { templates, updateTemplate, isLoaded } = useTemplates();
  const [template, setTemplate] = useState<InterviewTemplate | null>(null);

  useEffect(() => {
    if (isLoaded) {
      const found = templates.find((t) => t.id === params.id);
      if (found) {
        setTemplate(found);
      } else {
        toast.error("Template not found");
        router.push("/admin/templates");
      }
    }
  }, [isLoaded, templates, params.id, router]);

  const handleSave = (data: any) => {
    updateTemplate(params.id as string, data);
    toast.success("Template updated successfully");
    router.push("/admin/templates");
  };

  const handleStart = (data: any) => {
    toast.success("Starting mock session preview...");
    router.push(`/interview?topic=${encodeURIComponent(data.topic)}`);
  };

  const handleCancel = () => {
    router.push("/admin/templates");
  };

  if (!isLoaded || !template) {
    return <div className="p-8">Loading template...</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] bg-background">
      <div className="p-6 pb-0 border-b">
        <h1 className="text-2xl font-bold tracking-tight">Edit Template: {template.title}</h1>
        <p className="text-muted-foreground mt-1 mb-6">
          Modify this template's configuration and available features.
        </p>
      </div>
      
      <CustomSessionForm 
        initialData={template}
        isAdmin={true} 
        onStart={handleStart} 
        onSaveTemplate={handleSave} 
        onCancel={handleCancel} 
      />
    </div>
  );
}
