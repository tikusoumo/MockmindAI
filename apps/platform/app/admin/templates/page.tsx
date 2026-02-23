"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTemplates } from "@/hooks/useTemplates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Search, 
  FileText, 
  Upload, 
  MoreVertical,
  Trash2,
  Edit,
  Clock,
  Code,
  Brain,
  Users
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Code,
  Brain,
  Users,
  FileText,
};

export default function AdminTemplatesPage() {
  const { templates, deleteTemplate, isLoaded } = useTemplates();
  const [search, setSearch] = useState("");
  const router = useRouter();

  const filteredTemplates = templates.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  if (!isLoaded) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted-foreground">
            Manage interview templates and upload documents for RAG
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/templates/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => {
          const IconComponent = iconMap[template.icon] || FileText;
          
          return (
            <Card key={template.id} className="group relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={cn("p-2 rounded-lg", template.color)}>
                    <IconComponent className="h-5 w-5" />
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/admin/templates/${template.id}`)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/admin/templates/${template.id}/documents`)}>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Documents
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => {
                          if (confirm("Delete this template?")) {
                            deleteTemplate(template.id);
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <CardTitle className="text-lg mt-2">{template.title}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {template.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {template.duration}
                  </div>
                  <Badge variant="outline" className={cn(
                    template.difficulty === 'Easy' ? "border-green-500/20 text-green-500" :
                    template.difficulty === 'Medium' ? "border-yellow-500/20 text-yellow-500" :
                    "border-red-500/20 text-red-500"
                  )}>
                    {template.difficulty}
                  </Badge>
                  <Badge variant="secondary">{template.type}</Badge>
                </div>
                
                {/* Document count indicator */}
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    <span>{(template as any).documents?.length || 0} documents</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => router.push(`/admin/templates/${template.id}/documents`)}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    Upload
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {filteredTemplates.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            {search ? "No templates match your search" : "No templates yet. Create your first one!"}
          </div>
        )}
      </div>
    </div>
  );
}
