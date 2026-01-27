"use client";

import { useTemplates } from "@/hooks/useTemplates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Brain, Code, Users, Play } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

export default function TemplatesIndexPage() {
  const { templates, isLoaded } = useTemplates();
  const router = useRouter();

  if (!isLoaded) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interview Templates</h1>
          <p className="text-muted-foreground">
            Select a template to start a session or customize your own.
          </p>
        </div>
        <Button asChild>
          <Link href="/templates/new">
            <Plus className="mr-2 h-4 w-4" /> Create New
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="flex flex-col hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => router.push(`/templates/${template.id}`)}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                 <div className={cn("p-1.5 rounded-lg bg-secondary", template.color)}>
                    {/* Simple icon mapping based on string name, fallback to text */}
                    {template.icon === 'Code' ? <Code className="h-4 w-4" /> : 
                     template.icon === 'Brain' ? <Brain className="h-4 w-4" /> :
                     template.icon === 'Users' ? <Users className="h-4 w-4" /> :
                     <span className="text-xs font-bold">{template.title[0]}</span>
                    }
                 </div>
                 <Badge variant="outline" className={cn(
                    template.difficulty === 'Easy' ? "border-green-500/20 text-green-500 bg-green-500/10" :
                    template.difficulty === 'Medium' ? "border-yellow-500/20 text-yellow-500 bg-yellow-500/10" :
                    "border-red-500/20 text-red-500 bg-red-500/10"
                 )}>
                    {template.difficulty}
                 </Badge>
              </div>
              <CardTitle className="mt-2 text-base">{template.title}</CardTitle>
              <CardDescription className="line-clamp-2 min-h-[32px] text-xs">
                {template.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-2">
               <div className="flex items-center text-sm text-muted-foreground gap-4">
                  <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {template.duration}
                  </div>
                  <div className="flex items-center gap-1">
                      <span className="capitalize">{template.type}</span>
                  </div>
               </div>
            </CardContent>
            <CardFooter className="pt-0">
               <Button className="w-full opacity-0 group-hover:opacity-100 transition-opacity" variant="secondary" onClick={(e) => {
                   e.stopPropagation();
                   router.push(`/interview?template=${template.id}`); // This would ideally link to starting the interview
               }}>
                   <Play className="mr-2 h-3 w-3" /> Start Session
               </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
