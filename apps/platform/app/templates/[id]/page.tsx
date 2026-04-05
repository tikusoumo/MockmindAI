"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTemplates } from "@/hooks/useTemplates";
import { CustomSessionForm } from "@/components/dashboard/CustomSessionForm";
import { toast } from "sonner";
import { InterviewTemplate } from "@/data/mockData";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const { templates, updateTemplate, deleteTemplate, isLoaded } = useTemplates();
  const [template, setTemplate] = useState<InterviewTemplate | null>(null);

  useEffect(() => {
    if (isLoaded) {
      if (params.id === "new") {
        router.push("/templates"); // "New" should be handled via the dialog modal in normal template view.
        return;
      }
      
      const found = templates.find((t) => t.id === params.id);
      if (found) {
        setTemplate(found);
      } else {
        toast.error("Template not found");
        router.push("/templates");
      }
    }
  }, [isLoaded, templates, params.id, router]);

  const handleSave = (data: any) => {
    updateTemplate(params.id as string, data);
    toast.success("Template settings updated");
    router.push("/templates");
  };

  const handleStart = (data: any) => {
    toast.success("Starting mock session...");
    router.push(`/interview?template=${params.id}`);
  };

  const handleCancel = () => {
    router.push("/templates");
  };

  const handleDelete = () => {
    deleteTemplate(params.id as string);
    toast.success("Template deleted");
    router.push("/templates");
  };

  if (!isLoaded || !template) {
    return <div className="p-8 flex justify-center items-center h-full">Loading template...</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] bg-background">
      <div className="p-6 pb-0 border-b flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Template: {template.title}</h1>
          <p className="text-muted-foreground mt-1 mb-6">
            Modify this template's configuration, knowledge base documents, and system instructions.
          </p>
        </div>
      </div>

      <CustomSessionForm
        initialData={template}
        isAdmin={false}
        onStart={handleStart}
        onSaveTemplate={handleSave}
        onDeleteTemplate={handleDelete}
        onCancel={handleCancel}
      />
    </div>
  );
}
