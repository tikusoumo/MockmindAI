"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  MessageSquare,
  MoreVertical,
  Loader2
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { InterviewTemplate } from "@/data/mockData";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { User } from "@/data/mockData";
import { useBackendData } from "@/lib/backend";
import { fallbackCurrentUser } from "@/lib/fallback-data";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { AudioVisualizer } from "@/components/interview/AudioVisualizer";

export default function InterviewPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] w-full relative group">
      <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
        <InterviewPageContent />
      </Suspense>
    </div>
  );
}

function InterviewPageContent() {
  const currentUser = useBackendData<User>("/api/user", fallbackCurrentUser);
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const customTitle = searchParams.get("title");
  const customType = searchParams.get("type");

  const isCodingRound = templateId === "machine-coding" || customType === "Machine Coding";

  const dummyTemplate: InterviewTemplate = {
    id: templateId || "dummy",
    title: customTitle || "Tech Round: React & System Design",
    type: (customType as any) || (isCodingRound ? "Machine Coding" : "Technical"),
    mode: (searchParams.get("mode") as any) || "strict",
    duration: "45 mins",
    difficulty: (searchParams.get("difficulty") as any) || "Medium",
    questions: [],
    description: "Practice session",
    icon: isCodingRound ? "Code" : "Sparkles",
    color: isCodingRound ? "blue" : "blue"
  };

  return (
    <div className="flex flex-col gap-4 h-full w-full">
      <InterviewSession currentUser={currentUser} template={dummyTemplate} />
    </div>
  );
}

function InterviewSession({ currentUser, template }: { currentUser: User; template?: InterviewTemplate }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const {
      stream,
      cameras,
      microphones,
      activeCameraId,
      setActiveCameraId,
      activeMicId,
      setActiveMicId,
      isCameraEnabled,
      setIsCameraEnabled,
      isMicEnabled,
      setIsMicEnabled,
  } = useMediaDevices();

  const videoRefCoding = useRef<HTMLVideoElement>(null);
  const videoRefStandard = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (stream) {
      if (videoRefCoding.current) videoRefCoding.current.srcObject = stream;
      if (videoRefStandard.current) videoRefStandard.current.srcObject = stream;
    }
  }, [stream, isCameraEnabled]);
  
  // Dummy AI state
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isAgentThinking, setIsAgentThinking] = useState(false);

  // Toggle AI speaking state every few seconds for demonstration
  useEffect(() => {
    const aiInterval = setInterval(() => {
      setIsAgentSpeaking(prev => {
        if (!prev) {
          setIsAgentThinking(false);
          return true;
        } else {
          setIsAgentThinking(true);
          setTimeout(() => setIsAgentThinking(false), 2000);
          return false;
        }
      });
    }, 5000);
    return () => clearInterval(aiInterval);
  }, []);

  const isCodingRound = template?.type === "Machine Coding";
  const [code, setCode] = useState("// Write your solution here...\n\nfunction solution() {\n  \n}");

  // Timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMic = useCallback(() => setIsMicEnabled(prev => !prev), [setIsMicEnabled]);
  const toggleCam = useCallback(() => setIsCameraEnabled(prev => !prev), [setIsCameraEnabled]);

  return (
    <div className="flex flex-col gap-4 h-full w-full min-h-[600px]">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 truncate text-2xl font-bold leading-none">
              {template ? template.title : "Tech Round: React & System Design"}
            </h1>
            <Badge
              variant="outline"
              className="shrink-0 bg-green-500/10 text-green-500 border-green-500/20"
            >
              Live
            </Badge>
            <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
              {formatTime(elapsedTime)}
            </span>
             {template && (
                <Badge variant="secondary" className="hidden sm:inline-flex">
                    {template.type}
                </Badge>
             )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8">
          <MessageSquare className="mr-2 h-4 w-4" /> Show Transcript
        </Button>
      </div>

      {isCodingRound ? (
        <div className="grid gap-4 lg:grid-cols-2 min-h-[500px]">
           {/* Code Editor Area */}
           <div className="flex flex-col gap-2 h-full min-h-[400px]">
              <Card className="flex-1 overflow-hidden border-zinc-800 bg-zinc-950 p-0">
                  <CodeEditor 
                    value={code} 
                    onChange={(val) => setCode(val || "")} 
                    defaultLanguage="javascript" 
                  />
              </Card>
           </div>

           {/* Video Side Area */}
           <div className="flex flex-col gap-4">
              {/* AI Interviewer - Smaller in coding round */}
              <Card className={cn(
                "relative flex flex-col items-center justify-center overflow-hidden transition-all duration-500 min-h-[200px]",
                "bg-linear-to-b from-indigo-950 to-slate-950",
                isAgentSpeaking ? "border-indigo-500 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]" : "border-indigo-500/20"
              )}>
                {/* Visualizer Background Placeholder */}
                 <div className="absolute inset-0 flex items-center justify-center opacity-20">
                    {isAgentSpeaking && (
                        <div className="h-20 w-32 flex items-center justify-center gap-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="w-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ height: `${Math.random() * 40 + 10}px`, animationDelay: `${i * 0.1}s` }} />
                            ))}
                        </div>
                    )}
                  </div>

                  <div className="z-10 flex flex-row items-center gap-4 px-4 py-8">
                    <div className="relative">
                      {isAgentSpeaking && (
                        <div className="absolute -inset-2 rounded-full bg-indigo-500/20 blur-lg animate-pulse"></div>
                      )}
                      <Avatar className={cn(
                        "h-16 w-16 border-2 transition-all duration-300",
                        isAgentSpeaking ? "border-indigo-500 scale-105" : "border-indigo-500/30"
                      )}>
                        <AvatarImage src="https://i.pravatar.cc/150?u=ai-interviewer" />
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                    </div>
                    
                    <div className="text-left space-y-0.5">
                      <h3 className="text-base font-semibold text-white">Sarah (Tech Lead)</h3>
                      <p className={cn(
                        "text-xs font-medium transition-colors duration-300",
                        isAgentSpeaking ? "text-indigo-300" : 
                        isAgentThinking ? "text-yellow-400" : "text-slate-400"
                      )}>
                        {isAgentSpeaking ? "Speaking..." : 
                         isAgentThinking ? "Thinking..." : "Listening..."}
                      </p>
                    </div>
                  </div>
              </Card>

              {/* User View - Smaller */}
              <Card className={cn(
                "relative flex flex-col items-center justify-center overflow-hidden bg-zinc-900 transition-all duration-300 min-h-[200px]",
                "border-zinc-800"
              )}>
                {!isCameraEnabled ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground z-10 py-8">
                        <Avatar className="h-16 w-16 border-2 border-zinc-700 mb-1">
                            <AvatarImage src={currentUser?.avatar} />
                            <AvatarFallback>{currentUser?.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <p className="text-sm font-semibold text-white">{currentUser?.name || "Alex Chen"}</p>
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center overflow-hidden">
                         <video ref={videoRefCoding} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
                    </div>
                )}
                 <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2">
                    <div className={cn(
                      "backdrop-blur-md px-2 py-0.5 rounded text-xs font-medium transition-colors",
                      isMicEnabled ? "bg-green-500/80 text-white" : "bg-black/50 text-white"
                    )}>
                      {isMicEnabled ? "Mic On" : "Mic Off"}
                    </div>
                  </div>
              </Card>
           </div>
        </div>
      ) : (
      <div className="grid gap-4 lg:grid-cols-2 min-h-[500px]">
        {/* AI Interviewer View */}
        <Card className={cn(
          "relative flex flex-col items-center justify-center overflow-hidden transition-all duration-500",
          "bg-linear-to-b from-indigo-950 to-slate-950",
          isAgentSpeaking ? "border-indigo-500 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]" : "border-indigo-500/20"
        )}>
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
             {isAgentSpeaking && (
                <div className="h-32 w-64 flex items-center justify-center gap-2">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div key={i} className="w-2 bg-indigo-500 rounded-full animate-pulse" style={{ height: `${Math.random() * 60 + 20}px`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                </div>
             )}
          </div>
          
          <div className="z-10 flex flex-col items-center gap-4">
            <div className="relative">
              {isAgentSpeaking && (
                <div className="absolute -inset-4 rounded-full bg-indigo-500/20 blur-xl animate-pulse"></div>
              )}
              <Avatar className={cn(
                "h-32 w-32 border-4 transition-all duration-300",
                isAgentSpeaking ? "border-indigo-500 scale-105" : "border-indigo-500/30"
              )}>
                <AvatarImage src="https://i.pravatar.cc/150?u=ai-interviewer" />
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
              
              {isAgentThinking && (
                <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-1 shadow-lg border">
                  <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
                </div>
              )}
            </div>
            
            <div className="text-center space-y-1">
              <h3 className="text-xl font-semibold text-white">Sarah (Tech Lead)</h3>
              <p className={cn(
                "text-sm font-medium transition-colors duration-300",
                isAgentSpeaking ? "text-indigo-300" : 
                isAgentThinking ? "text-yellow-400" : "text-slate-400"
              )}>
                {isAgentSpeaking ? "Speaking..." : 
                 isAgentThinking ? "Thinking..." : "Listening..."}
              </p>
            </div>
          </div>
        </Card>

        {/* User View */}
        <Card className={cn(
          "relative flex flex-col items-center justify-center overflow-hidden bg-zinc-900 transition-all duration-300",
          "border-zinc-800"
        )}>
            {!isCameraEnabled ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground z-10">
                    <Avatar className="h-24 w-24 border-4 border-zinc-700 mb-2">
                        <AvatarImage src={currentUser?.avatar} />
                        <AvatarFallback>{currentUser?.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <p className="font-semibold text-lg text-white">{currentUser?.name}</p>
                    <p className="text-xs text-muted-foreground">Camera is off</p>
                </div>
            ) : (
                <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center overflow-hidden">
                     <video ref={videoRefStandard} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
                </div>
            )}
          
          <div className="absolute bottom-4 left-4 z-10">
            <div className={cn(
              "backdrop-blur-md px-3 py-1 rounded-md text-sm font-medium transition-colors mb-2 inline-block",
              isMicEnabled ? "bg-green-500/80 text-white" : "bg-black/50 text-white"
            )}>
              {isMicEnabled ? "You (Mic On)" : "You (Mic Off)"}
            </div>
            
             <AudioVisualizer stream={stream} isActive={isMicEnabled} />
          </div>
        </Card>
      </div>
      )}

      {/* Controls Bar */}
      <Card className="p-3 z-10 border-zinc-800 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex items-center justify-between relative pl-2 pr-4">
          <div className="flex bg-zinc-900 rounded-2xl p-1 gap-1 border border-zinc-800 shadow-sm relative z-10">
             {/* Mic Selector box */}
             <div className="w-14 h-12 flex items-stretch rounded-xl border border-transparent hover:border-zinc-800 bg-zinc-950/50 transition-colors overflow-hidden">
               <Button 
                 variant={!isMicEnabled ? "destructive" : "ghost"} 
                 className={cn("flex-1 h-full rounded-none p-0 transition-colors", isMicEnabled && "bg-transparent hover:bg-zinc-800")}
                 onClick={toggleMic}
               >
                 {!isMicEnabled ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-green-500" />}
               </Button>
               <div className="w-[1px] bg-zinc-800 my-2" />
               <Select value={activeMicId} onValueChange={setActiveMicId}>
                  <SelectTrigger className="w-5 !h-full rounded-none border-0 bg-transparent p-0 flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 [&>span]:hidden focus:ring-0 shadow-none hover:bg-zinc-800 transition-colors cursor-pointer z-10 !data-[size=default]:h-full !data-[size=sm]:h-full">
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" sideOffset={8} className="w-[240px] bg-zinc-900 border-zinc-800 text-zinc-300">
                     {microphones.map(m => (
                       <SelectItem key={m.deviceId} value={m.deviceId} className="text-xs">{m.label || `Mic ${m.deviceId.slice(0,5)}`}</SelectItem>
                     ))}
                  </SelectContent>
               </Select>
             </div>

             {/* Cam Selector box */}
             <div className="w-14 h-12 flex items-stretch rounded-xl border border-transparent hover:border-zinc-800 bg-zinc-950/50 transition-colors overflow-hidden">
               <Button 
                 variant={!isCameraEnabled ? "destructive" : "ghost"} 
                 className={cn("flex-1 h-full rounded-none p-0 transition-colors", isCameraEnabled && "bg-transparent hover:bg-zinc-800")}
                 onClick={toggleCam}
               >
                 {!isCameraEnabled ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5 text-blue-500" />}
               </Button>
               <div className="w-[1px] bg-zinc-800 my-2" />
               <Select value={activeCameraId} onValueChange={setActiveCameraId}>
                  <SelectTrigger className="w-5 !h-full rounded-none border-0 bg-transparent p-0 flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 [&>span]:hidden focus:ring-0 shadow-none hover:bg-zinc-800 transition-colors cursor-pointer z-10 !data-[size=default]:h-full !data-[size=sm]:h-full">
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" sideOffset={8} className="w-[240px] bg-zinc-900 border-zinc-800 text-zinc-300">
                     {cameras.map(c => (
                       <SelectItem key={c.deviceId} value={c.deviceId} className="text-xs">{c.label || `Camera ${c.deviceId.slice(0,5)}`}</SelectItem>
                     ))}
                  </SelectContent>
               </Select>
             </div>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center gap-4 z-20">
             {/* Center exit button */}
            <Link href="/">
              <Button 
                variant="destructive" 
                size="icon" 
                className="h-12 w-12 rounded-full shadow-lg hover:bg-red-600 hover:scale-105 transition-all outline-4 outline-red-900/20 shrink-0"
              >
                <PhoneOff className="h-5 w-5" />
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-2 relative z-10">
            <Button variant="ghost" size="icon" className="hover:bg-zinc-800 text-zinc-400">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}


