"use client";

import { useRouter } from "next/navigation";
import { useTemplates } from "@/hooks/useTemplates";
import { CustomSessionForm } from "@/components/dashboard/CustomSessionForm";
import { toast } from "sonner";

export default function NewTemplatePage() {
  const router = useRouter();
  const { addTemplate } = useTemplates();

  const handleSave = (data: any) => {
    addTemplate({
      ...data,
      id: `custom-${Date.now()}`
    });
    toast.success("Template created successfully");
    router.push("/admin/templates");
  };

  const handleStart = (data: any) => {
    // Usually admin might not start it directly but just in case
    toast.success("Starting mock session preview...");
    router.push(`/interview?topic=${encodeURIComponent(data.topic)}`);
  };

  const handleCancel = () => {
    router.push("/admin/templates");
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="p-6 pb-0 border-b">
        <h1 className="text-2xl font-bold tracking-tight">Create New Template</h1>
        <p className="text-muted-foreground mt-1 mb-6">
          Configure a new interview template for the platform users.
        </p>
      </div>
      
      <CustomSessionForm 
        isAdmin={true} 
        onStart={handleStart} 
        onSaveTemplate={handleSave} 
        onCancel={handleCancel} 
      />
    </div>
  );
}
