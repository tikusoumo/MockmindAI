"use client";

import { useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTemplates } from "@/hooks/useTemplates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  Upload,
  FileText,
  Loader2,
  Check,
  X,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type DocumentType = "question_bank" | "reference" | "rubric";

interface UploadedDoc {
  id: string;
  name: string;
  type: DocumentType;
  status: "uploading" | "success" | "error";
  chunkCount?: number;
  error?: string;
}

export default function TemplateDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;
  const { templates, isLoaded } = useTemplates();
  const template = templates.find((t) => t.id === templateId);

  const [docType, setDocType] = useState<DocumentType>("question_bank");
  const [uploads, setUploads] = useState<UploadedDoc[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (files: FileList) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    
    for (const file of Array.from(files)) {
      const uploadId = `upload_${Date.now()}_${file.name}`;
      
      // Add to uploads list
      setUploads((prev) => [...prev, {
        id: uploadId,
        name: file.name,
        type: docType,
        status: "uploading",
      }]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("doc_type", docType);
        formData.append("uploaded_by", "admin");

        const response = await fetch(
          `${apiUrl}/documents/upload/${templateId}`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, status: "success", chunkCount: result.chunk_count }
              : u
          )
        );
      } catch (error) {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, status: "error", error: String(error) }
              : u
          )
        );
      }
    }
  }, [templateId, docType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }, [handleUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (!isLoaded) {
    return <div className="p-8">Loading...</div>;
  }

  if (!template) {
    return (
      <div className="p-8">
        <p>Template not found.</p>
        <Button asChild className="mt-4">
          <Link href="/admin/templates">Back to Templates</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Upload Documents: {template.title}
          </h1>
          <p className="text-muted-foreground">
            Add question banks, reference materials, or evaluation rubrics
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Upload Area */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Upload</CardTitle>
              <CardDescription>
                Supported formats: PDF, TXT, DOCX, MD
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Document Type Selection */}
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="question_bank">
                      Question Bank
                    </SelectItem>
                    <SelectItem value="reference">
                      Reference Material
                    </SelectItem>
                    <SelectItem value="rubric">
                      Evaluation Rubric
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Drop Zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop files here, or
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx,.md"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleUpload(e.target.files)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Upload History */}
          {uploads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Upload History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {uploads.map((upload) => (
                    <div
                      key={upload.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{upload.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {upload.type.replace("_", " ")}
                            {upload.chunkCount && ` • ${upload.chunkCount} chunks indexed`}
                          </p>
                        </div>
                      </div>
                      
                      {upload.status === "uploading" && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {upload.status === "success" && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                      {upload.status === "error" && (
                        <X className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Template Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-muted-foreground">Type</Label>
                <p className="font-medium">{template.type}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Difficulty</Label>
                <Badge variant="outline" className={cn(
                  template.difficulty === 'Easy' ? "border-green-500/20 text-green-500" :
                  template.difficulty === 'Medium' ? "border-yellow-500/20 text-yellow-500" :
                  "border-red-500/20 text-red-500"
                )}>
                  {template.difficulty}
                </Badge>
              </div>
              <div>
                <Label className="text-muted-foreground">Duration</Label>
                <p className="font-medium">{template.duration}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document Types</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Question Bank</p>
                <p className="text-muted-foreground">
                  Interview questions the AI will ask candidates
                </p>
              </div>
              <div>
                <p className="font-medium">Reference Material</p>
                <p className="text-muted-foreground">
                  Technical concepts for answer evaluation
                </p>
              </div>
              <div>
                <p className="font-medium">Evaluation Rubric</p>
                <p className="text-muted-foreground">
                  Scoring criteria for candidate responses
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
