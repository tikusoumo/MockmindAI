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
  Loader2,
  MonitorUp,
  X,
  Send,
  Users,
  LayoutGrid,
  User as UserIcon,
  Pin,
  Maximize,
  Minimize,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { InterviewTemplate } from "@/data/mockData";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { User } from "@/data/mockData";
import { useBackendData } from "@/lib/backend";
import { fallbackCurrentUser } from "@/lib/fallback-data";
import { ParticipantVisualizer } from "@/components/interview/ParticipantVisualizer";
import { useMediaDevices } from "@/hooks/useMediaDevices";

import { 
  LiveKitRoom, 
  RoomAudioRenderer,
  useLocalParticipant,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import '@livekit/components-styles';

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
  const sessionId = searchParams.get("sessionId");

  const [sessionDbData, setSessionDbData] = useState<any>(null);

  useEffect(() => {
     if (sessionId) {
         import("@/lib/backend").then(({ backendGet }) => {
             backendGet(`/api/sessions/${sessionId}`)
               .then(setSessionDbData)
               .catch(console.error);
         });
     }
  }, [sessionId]);

  const effectiveType = sessionDbData?.type || customType;
  const isCodingRound = templateId === "machine-coding-round" || templateId === "tech-round" || effectiveType === "Machine Coding" || effectiveType === "Technical";  

  const dummyTemplate: InterviewTemplate = {
    id: templateId || "dummy",
    title: sessionDbData?.title || customTitle || "Tech Round: React & System Design",
    type: (effectiveType as any) || (isCodingRound ? "Machine Coding" : "Technical"),
    mode: sessionDbData?.aiBehavior || (searchParams.get("mode") as any) || "strict",
    duration: "45 mins",
    difficulty: sessionDbData?.difficulty || (searchParams.get("difficulty") as any) || "Medium",
    questions: [],
    description: sessionDbData?.focusAreas || "Practice session",
    icon: isCodingRound ? "Code" : "Sparkles",
    color: isCodingRound ? "blue" : "blue"
  };

  const [liveKitToken, setLiveKitToken] = useState<string>("");
  const [liveKitUrl, setLiveKitUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
     let mounted = true;
     import("@/lib/backend").then(({ backendPost }) => {
        backendPost<{token: string, url: string}>("/api/livekit/token", {
           room_name: `interview-${sessionId || templateId || "practice"}`,
           participant_name: currentUser?.name || "Candidate",
        }).then((data) => {
           if (mounted) {
              setLiveKitToken(data.token);
              setLiveKitUrl(data.url);
           }
        }).catch((err) => {
           // We suppress LiveKit token errors for now so we can still view the Dummy UI!
           if (mounted) {
               console.warn("LiveKit offline. Rendering dummy UI mode.");
               setLiveKitToken("dummy"); // Bypass to allow rendering UI
           }
        });
     });
     return () => { mounted = false; };
  }, [templateId, sessionId, currentUser?.name]);

  if (!liveKitToken) {
     return <div className="flex flex-col h-full items-center justify-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Connecting to session...</p>
     </div>
  }

  // If token is literally "dummy", we bypass actual LiveKit connection
  if (liveKitToken === "dummy") {
      return (
          <div className="flex flex-col gap-4 h-full w-full">
            <InterviewSession currentUser={currentUser} template={dummyTemplate} isDummyMode={true} sessionDbData={sessionDbData} />
          </div>
      );
  }

  return (
    <LiveKitRoom
      token={liveKitToken}
      serverUrl={liveKitUrl}
      connect={true}
      video={true}
      audio={true}
      className="flex flex-col gap-4 h-full w-full"
    >
      <InterviewSession currentUser={currentUser} template={dummyTemplate} isDummyMode={false} sessionDbData={sessionDbData} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function InterviewSession({ currentUser, template, isDummyMode, sessionDbData }: { currentUser: User; template?: InterviewTemplate; isDummyMode: boolean; sessionDbData?: any; }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState<{name: string, text: string, time: string}[]>([
      { name: "System", text: "Welcome to the interview session. Multiple participants can join.", time: "10:00 AM" }
  ]);
  const [chatInput, setChatInput] = useState("");

  const effectiveType = sessionDbData?.type || template?.type;
  const isCodingRound = effectiveType === "Machine Coding" || effectiveType === "Technical" || template?.id === "machine-coding-round" || template?.id === "tech-round";
  const [code, setCode] = useState("// Write your solution here...\n\nfunction solution() {\n  \n}");
  
  // IDE Toggles
  const [isIdeCollapsed, setIsIdeCollapsed] = useState(false);
  const [isIdeFullscreen, setIsIdeFullscreen] = useState(false);
  const fullScreenContainerRef = useRef<HTMLDivElement>(null);

  // ─── Real hardware access for camera + mic ───
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

  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Attach camera stream to video element
  useEffect(() => {
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [stream, isCameraEnabled]);

  // LiveKit WebRTC Hooks (only when connected)
  const lkParticipant = !isDummyMode ? useLocalParticipant().localParticipant : null;
  const isScreenShareEnabled = lkParticipant?.isScreenShareEnabled ?? false;

  const toggleMic = useCallback(() => setIsMicEnabled(prev => !prev), [setIsMicEnabled]);
  const toggleCam = useCallback(() => setIsCameraEnabled(prev => !prev), [setIsCameraEnabled]);
  const toggleScreenShare = useCallback(() => {
     if (lkParticipant) lkParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: false }).catch(console.error);
  }, [lkParticipant, isScreenShareEnabled]);

  // Fullscreen effect listener for IDE
  useEffect(() => {
     const onFullscreenChange = () => setIsIdeFullscreen(!!document.fullscreenElement);
     document.addEventListener('fullscreenchange', onFullscreenChange);
     return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
      if (!isIdeFullscreen && fullScreenContainerRef.current) {
          fullScreenContainerRef.current.requestFullscreen().catch(console.error);
      } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(console.error);
      }
  };

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

  // --- View & Layout States ---
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "speaker">("grid");
  const [localScreenShare, setLocalScreenShare] = useState(false); // mock screen share state

  const isScreenShareActive = !isDummyMode ? isScreenShareEnabled : localScreenShare;

  const handleToggleScreenShare = useCallback(() => {
     if (!isDummyMode) {
         toggleScreenShare();
     } else {
         setLocalScreenShare(prev => !prev);
     }
  }, [isDummyMode, toggleScreenShare]);

  // --- Arrays for Layout ---
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  useEffect(() => {
    const aiInterval = setInterval(() => {
      setIsAgentSpeaking(prev => !prev);
    }, 4000);
    return () => clearInterval(aiInterval);
  }, []);

  const fallbackInterviewers = [
      { id: "ai-1", name: "Sarah (Lead)", role: "AI Agent", avatar: "https://i.pravatar.cc/150?u=sarah", speaking: isAgentSpeaking, isAI: true },
      { id: "hm-1", name: "David Chen", role: "Manager", avatar: "https://i.pravatar.cc/150?u=david", speaking: false, isAI: false },
  ];

  const fallbackCandidates = [
      { id: "self", name: currentUser?.name || "You", role: "Candidate", avatar: currentUser?.avatar, isLocal: true, camOn: isCameraEnabled, micOn: isMicEnabled },
      { id: "peer-1", name: "Eliza (Pairing)", role: "Candidate", avatar: "https://i.pravatar.cc/150?u=eliza", isLocal: false, camOn: true, micOn: false },
  ];

  let interviewers, candidates;

  if (sessionDbData && sessionDbData.participants) {
      interviewers = [
          { id: "ai-1", name: `${sessionDbData?.persona || 'Sarah'} (Lead)`, role: "AI Agent", avatar: `https://i.pravatar.cc/150?u=${sessionDbData?.persona?.toLowerCase() || 'sarah'}`, speaking: isAgentSpeaking, isAI: true }
      ];
      
      const sessionParts = sessionDbData.participants || [];

      sessionParts.forEach((p: any) => {
          const roleNormalized = p.role?.toLowerCase() || '';
          if (roleNormalized === 'interviewer' || roleNormalized === 'observer') {
              interviewers.push({
                  id: p.id,
                  name: p.name || p.email?.split('@')[0] || "Unknown",
                  role: p.role,
                  avatar: `https://i.pravatar.cc/150?u=${p.email}`,
                  speaking: false,
                  isAI: false
              });
          }
      });

      candidates = [
          { id: "self", name: currentUser?.name || "You", role: "Candidate", avatar: currentUser?.avatar, isLocal: true, camOn: isCameraEnabled, micOn: isMicEnabled }
      ];
      
      sessionParts.forEach((p: any) => {
          const roleNormalized = p.role?.toLowerCase() || '';
          if (roleNormalized === 'candidate' && p.email !== currentUser?.email) {
              candidates.push({
                  id: p.id,
                  name: p.name || p.email?.split('@')[0] || "Unknown",
                  role: p.role,
                  avatar: `https://i.pravatar.cc/150?u=${p.email}`,
                  isLocal: false,
                  camOn: true,
                  micOn: false
              });
          }
      });
  } else {
      // Dynamic rendering directly from templates instead of the static 4 users
      const personaName = (searchParams.get("persona") as string) || template?.persona || "Sarah";
      interviewers = [
          { id: "ai-1", name: `${personaName} (Lead)`, role: "AI Agent", avatar: `https://i.pravatar.cc/150?u=${personaName.toLowerCase()}`, speaking: isAgentSpeaking, isAI: true }
      ];
      candidates = [
          { id: "self", name: currentUser?.name || "You", role: "Candidate", avatar: currentUser?.avatar, isLocal: true, camOn: isCameraEnabled, micOn: isMicEnabled }
      ];
  }

  const allParticipants = [...interviewers, ...candidates];

  // Helper derived states for layout
  const effectiveViewMode = isScreenShareActive ? "presentation" : isCodingRound ? "coding" : (pinnedId || viewMode === "speaker") ? "speaker" : "grid";
  
  const mainParticipant = pinnedId 
      ? allParticipants.find(p => p.id === pinnedId) 
      : allParticipants.find(p => 'speaking' in p && p.speaking) || allParticipants[0];

  const handlePin = (id: string) => {
      setPinnedId(prev => prev === id ? null : id);
  };

  // Helper component to render a single participant card
  const renderParticipant = (p: any, isMainView = false) => {
      const isAI = 'isAI' in p ? p.isAI : false;
      const isLocal = 'isLocal' in p ? p.isLocal : false;
      const micOn = isLocal ? isMicEnabled : (('micOn' in p) ? (p as any).micOn : true);
      const speaking = isLocal ? (isMicEnabled && true) : ('speaking' in p ? (p as any).speaking : false);
      const hasCam = isLocal ? isCameraEnabled : ('camOn' in p ? (p as any).camOn : false);
      const isCamOff = isLocal ? !isCameraEnabled : (('camOn' in p) ? !(p as any).camOn : false);
      const isPinned = pinnedId === p.id;

      return (
        <Card key={p.id} className={cn(
            "group relative flex flex-col items-center justify-center overflow-hidden transition-all duration-300 w-full h-full",
            isMainView ? "min-h-[300px]" : (effectiveViewMode === "coding" ? "h-[180px]" : "min-h-[200px]"),
            isAI 
                ? "bg-linear-to-b from-indigo-50 to-white dark:from-indigo-950 dark:to-slate-950" 
                : "bg-secondary/40 shadow-sm",
            speaking && isAI ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-background shadow-[0_0_30px_-5px_rgba(99,102,241,0.4)] z-10 border-transparent" : 
            speaking && !isAI ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] z-10 border-transparent" : "border-border"
        )}>
             {/* Pin Button */}
             <Button
                variant="secondary"
                size="icon"
                className={cn(
                    "absolute top-3 right-3 z-30 h-8 w-8 rounded-full shadow-md bg-black/40 hover:bg-black/60 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity",
                    isPinned && "opacity-100 bg-indigo-500/80 hover:bg-indigo-600",
                    isMainView && "opacity-100"
                )}
                onClick={() => handlePin(p.id)}
             >
                 <Pin className="h-4 w-4" />
             </Button>

             {isAI && (
                 <div className="absolute inset-0 flex items-center justify-center opacity-10 dark:opacity-20">
                    {speaking && (
                        <div className="h-20 w-48 flex items-center justify-center gap-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="w-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ height: '20px', animationDelay: `${i * 0.15}s` }} />
                            ))}
                        </div>
                    )}
                 </div>
             )}

             {/* Local user camera feed */}
             {isLocal && hasCam && (
                 <div className="absolute inset-0 z-0">
                     <video
                         ref={localVideoRef}
                         autoPlay
                         playsInline
                         muted
                         className="w-full h-full object-cover transform -scale-x-100"
                     />
                     <div className="absolute inset-0 bg-linear-to-t from-black/60 dark:from-black/80 via-transparent to-transparent" />
                 </div>
             )}

             {!hasCam && (
                <div className="z-10 relative">
                    {speaking && isAI && <div className="absolute -inset-2 rounded-full bg-indigo-500/20 blur-lg animate-pulse"></div>}
                    {speaking && !isAI && <div className="absolute -inset-2 rounded-full bg-emerald-500/10 blur-md animate-pulse"></div>}
                    
                    <Avatar className={cn(
                        "border-2 transition-all duration-300 shadow-md",
                        isMainView ? "h-32 w-32" : (!isCodingRound ? "h-20 w-20" : "h-14 w-14"),
                        speaking && isAI ? "border-indigo-500 scale-105" : 
                        speaking && !isAI ? "border-emerald-500 scale-105" : "border-muted"
                    )}>
                        <AvatarImage src={p.avatar} />
                        <AvatarFallback>{p.name[0]}</AvatarFallback>
                    </Avatar>
                </div>
             )}

             <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2 px-1 transition-all duration-300">
                {/* Name and Role */}
                <div className="space-y-0.5 text-left">
                    <h3 className={cn(
                        "text-sm font-semibold flex items-center gap-1 drop-shadow-md",
                        hasCam ? "text-white" : "text-foreground"
                    )}>
                        {p.name} {p.id === 'self' && "(You)"}
                    </h3>
                    <p className={cn(
                        "text-xs font-medium transition-colors drop-shadow-md",
                        speaking && isAI ? "text-indigo-400 dark:text-indigo-300" : 
                        speaking && !isAI ? "text-emerald-500 dark:text-emerald-400" : "text-muted-foreground"
                    )}>
                        {p.role} {isAI && speaking ? "- Speaking..." : ""}
                    </p>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-1 mt-0.5">
                    {isCamOff && (
                        <Badge variant="secondary" className="bg-black/60 dark:bg-black/80 text-white border-none p-0 w-6 h-6 flex items-center justify-center rounded-md shadow-sm">
                            <VideoOff className="w-3.5 h-3.5" />
                        </Badge>
                    )}
                    {(!micOn || (p.id !== 'self' && 'micOn' in p && !(p as any).micOn)) && (
                        <Badge variant="secondary" className="bg-black/60 dark:bg-black/80 text-white border-none py-0 px-1.5 h-6 text-[10px] shadow-sm">
                            <MicOff className="w-3 h-3 text-red-500 mr-1"/>Muted
                        </Badge>
                    )}
                </div>

                {/* Audio Visualizer */}
                {micOn && (
                    <ParticipantVisualizer
                        stream={isLocal ? stream : undefined}
                        isActive={speaking}
                        variant={isAI ? "indigo" : "emerald"}
                        align="left"
                    />
                )}
             </div>
        </Card>
      );
  };

  return (
    <div className={cn("flex flex-col gap-4 min-h-full w-full relative transition-all duration-300", isIdeFullscreen && "fixed inset-0 z-[100] bg-background h-screen w-screen p-4")} ref={fullScreenContainerRef}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 truncate text-2xl font-bold leading-none">
              {sessionDbData?.title || template?.title || "Session"}
            </h1>
            <Badge variant="outline" className="shrink-0 bg-green-500/10 text-green-500 border-green-500/20">Live</Badge>
            <span className="shrink-0 tabular-nums text-sm text-muted-foreground">{formatTime(elapsedTime)}</span>
            <div className="flex -space-x-2 ml-4">
                {allParticipants.slice(0, 3).map((p) => (
                    <Avatar key={p.id} className="h-6 w-6 border border-muted drop-shadow-sm">
                        <AvatarImage src={p.avatar} />
                        <AvatarFallback className="text-[10px]">{p.name[0]}</AvatarFallback>
                    </Avatar>
                ))}
                {allParticipants.length > 3 && (
                     <div className="h-6 w-6 rounded-full bg-secondary border border-muted flex items-center justify-center text-[10px] text-muted-foreground shadow-sm">+{allParticipants.length - 3}</div>
                )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-sm mr-2 hidden sm:flex">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("h-7 w-7 rounded-md", viewMode === 'grid' && "bg-secondary text-foreground")}
                    onClick={() => { setViewMode('grid'); setPinnedId(null); }}
                    title="Grid View"
                >
                    <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("h-7 w-7 rounded-md", viewMode === 'speaker' && "bg-secondary text-foreground")}
                    onClick={() => setViewMode('speaker')}
                    title="Speaker View"
                >
                    <UserIcon className="h-4 w-4" />
                </Button>
                <div className="w-px h-4 bg-border mx-1" />
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    onClick={toggleFullscreen}
                    title={isIdeFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                    {isIdeFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
            </div>
            <Button variant="outline" size="sm" className="h-8 relative" onClick={() => setIsChatOpen(!isChatOpen)}>
              <MessageSquare className="mr-2 h-4 w-4" /> 
              Chat
              <Badge className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center bg-indigo-500">1</Badge>
            </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 p-1 -m-1 relative">
         {(effectiveViewMode === 'grid' || (effectiveViewMode === 'coding' && isIdeCollapsed)) && (
             <div className={cn(
                 "grid gap-3 flex-1 h-full w-full pb-20 items-center content-center max-h-full",
                 allParticipants.length <= 2 ? "grid-cols-1 sm:grid-cols-2" :
                 allParticipants.length <= 4 ? "grid-cols-2" :
                 "grid-cols-2 lg:grid-cols-3"
             )}>
                 {allParticipants.map(p => (
                     <div key={p.id} className="w-full h-full max-h-[45vh] lg:max-h-[600px] flex justify-center">
                         {renderParticipant(p, false)}
                     </div>
                 ))}
             </div>
         )}
         
         {/* Floating Expand button for strictly collapsed IDE view */}
         {effectiveViewMode === 'coding' && isIdeCollapsed && (
             <div className="absolute left-4 top-4 z-40 animate-in slide-in-from-left-4 fade-in duration-300">
                <Button 
                   onClick={() => setIsIdeCollapsed(false)}
                   className="shadow-xl bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-4 h-11 flex items-center gap-2 transition-all hover:scale-105 ring-2 ring-background border-none"
                >
                   <ChevronRight className="w-4 h-4"/>
                   <span className="font-semibold text-sm">Open IDE</span>
                </Button>
             </div>
         )}

         {(effectiveViewMode !== 'grid' && !(effectiveViewMode === 'coding' && isIdeCollapsed)) && (
             <div className="flex flex-col lg:flex-row w-full h-full gap-3 relative p-2 transition-all duration-300">
                 {/* Primary Focus Area */}
                 <div className="flex flex-col transition-all duration-300 flex-1 min-h-[300px] min-w-0">
                     {effectiveViewMode === 'coding' && (
                          <Card className="flex border-border bg-card shadow-xl transition-all duration-300 flex-col flex-1">
                             {/* IDE Header Toolbar */}
                             <div 
                                role="button"
                                className="flex items-center justify-between shrink-0 cursor-pointer hover:bg-muted/50 transition-colors h-12 border-b border-border bg-muted/40 px-4" 
                                onClick={() => setIsIdeCollapsed(true)}
                             >
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="font-mono text-[10px] bg-indigo-500/10 text-indigo-500 border-indigo-500/20">Machine Coding</Badge>
                                    <span className="text-sm font-semibold text-foreground/80">Active Editor</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background transition-colors" onClick={(e) => { e.stopPropagation(); setIsIdeCollapsed(true); }}>
                                        <ChevronLeft className="h-5 w-5" />
                                    </Button>
                                </div>
                             </div>

                             <div className="flex-1 min-h-[300px] p-0 relative isolate">
                                <CodeEditor 
                                    value={code} 
                                    onChange={(val) => setCode(val || "")} 
                                    defaultLanguage="javascript" 
                                />
                             </div>
                          </Card>
                     )}
                     {effectiveViewMode === 'presentation' && (
                          <Card className="flex-1 overflow-hidden border-border bg-black flex items-center justify-center flex-col relative group shadow-xl">
                              <MonitorUp className="w-16 h-16 text-indigo-500/20 absolute z-0" />
                              {isDummyMode ? (
                                  <div className="z-10 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-md">
                                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                                      You are sharing your screen
                                  </div>
                              ) : (
                                  <LiveKitScreenShare />
                              )}
                          </Card>
                     )}
                     {effectiveViewMode === 'speaker' && mainParticipant && (
                          <div className="flex-1 flex p-2 -m-2">
                              {renderParticipant(mainParticipant, true)}
                          </div>
                     )}
                 </div>

                 {/* Sidebar Participants */}
                 <div className="shrink-0 custom-scrollbar transition-all duration-300 pr-1 h-[140px] lg:h-full lg:w-[280px] xl:w-[320px] overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden">
                    <div className="flex gap-2 p-1 min-h-full lg:flex-col justify-start">
                       {allParticipants
                           .filter(p => effectiveViewMode !== 'speaker' || p.id !== mainParticipant?.id)
                           .map(p => (
                            <div key={p.id} className="shrink-0 w-[200px] lg:w-full aspect-video">
                                {renderParticipant(p, false)}
                            </div>
                       ))}
                    </div>
                 </div>
             </div>
         )}
      </div>

      {/* Global Sheet Chat Panel (Full Viewport Height) */}
      {isChatOpen && (
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[380px] h-screen flex flex-col border-l border-border bg-background/95 dark:bg-card/90 backdrop-blur-3xl shadow-[-30px_0_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[-30px_0_60px_-15px_rgba(0,0,0,0.7)] animate-in slide-in-from-right duration-500 ease-out">
             {/* Header */}
             <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0 bg-secondary/10 dark:bg-black/20">
                <div className="flex flex-col text-left">
                   <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                      Session Chat
                   </h3>
                   <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5">Live Interview</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" onClick={() => setIsChatOpen(false)}>
                   <X className="w-5 h-5"/>
                </Button>
             </div>
             
             {/* Messages Area */}
             <ScrollArea className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-6">
                   {chatMessages.map((msg, i) => {
                        const isSelf = msg.name === "You" || (currentUser && msg.name === currentUser.name);
                        return (
                            <div key={i} className={cn("flex flex-col gap-1.5", isSelf ? "items-end text-right" : "items-start text-left")}>
                               {!isSelf && (
                                   <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight ml-1">{msg.name}</span>
                               )}
                               <div className={cn(
                                   "px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed max-w-[90%] shadow-md wrap-break-word whitespace-pre-wrap",
                                   isSelf
                                       ? "bg-indigo-600 text-white rounded-br-none shadow-indigo-500/20"
                                       : "bg-secondary/80 dark:bg-zinc-800/90 text-foreground dark:text-zinc-100 rounded-bl-none border border-border/50 shadow-black/5 dark:shadow-black/30"
                               )}>
                                   {msg.text}
                               </div>
                               <span className="text-[9px] text-muted-foreground px-1 mt-0.5 font-bold uppercase font-mono tracking-tighter">{msg.time}</span>
                            </div>
                        );
                   })}
                </div>
             </ScrollArea>

             {/* Input Area */}
             <div className="p-6 border-t border-border bg-secondary/10 dark:bg-black/40 shrink-0">
                 <form 
                    className="relative flex items-center" 
                    onSubmit={(e) => { 
                        e.preventDefault(); 
                        if(chatInput.trim()) { 
                            setChatMessages([...chatMessages, {
                                name: "You", 
                                text: chatInput, 
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            }]); 
                            setChatInput(""); 
                        } 
                    }}
                >
                     <input
                         value={chatInput} 
                         onChange={(e) => setChatInput(e.target.value)}
                         placeholder="Message session..." 
                         className="w-full h-12 rounded-xl border border-border bg-background dark:bg-zinc-900/40 backdrop-blur-sm pl-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all selection:bg-indigo-500/30"
                     />
                     <Button 
                        type="submit" 
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-1 top-1 h-10 w-10 text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-transparent transition-colors"
                    >
                         <Send className="w-5 h-5 scroll-translate-x-1 transition-transform" />
                     </Button>
                 </form>
             </div>
          </div>
      )}

      {/* Controls Bar */}
      <div className="sticky bottom-4 z-50 mt-auto mx-auto w-full max-w-fit pointer-events-none px-4">
        <Card className="p-3 border-border bg-card/85 backdrop-blur-3xl shadow-2xl dark:shadow-black/50 pointer-events-auto rounded-full ring-1 ring-border/50">
          <div className="flex items-center justify-between gap-6 px-4">
            <div className="flex bg-background/50 rounded-full p-1 gap-1 border border-border shadow-inner">
               {/* Mic Selector box */}
               <div className="h-12 flex items-stretch rounded-full hover:bg-background/80 transition-colors overflow-hidden shrink-0">
                 <Button 
                   variant={!isMicEnabled ? "destructive" : "ghost"} 
                   className={cn("h-full px-4 rounded-none transition-colors", isMicEnabled && "bg-transparent hover:bg-secondary")}
                   onClick={toggleMic}
                 >
                   {!isMicEnabled ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />}
                 </Button>
                 <div className="w-px bg-border my-2" />
                 <Select value={activeMicId} onValueChange={setActiveMicId}>
                    <SelectTrigger className="w-6 h-full! rounded-none border-0 bg-transparent p-0 flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 [&>span]:hidden focus:ring-0 shadow-none hover:bg-secondary transition-colors cursor-pointer z-10 !data-[size=default]:h-full !data-[size=sm]:h-full">
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" sideOffset={8} className="w-[240px] bg-popover border-border text-popover-foreground">
                       {microphones.map(m => (
                         <SelectItem key={m.deviceId} value={m.deviceId} className="text-xs">{m.label || `Mic ${m.deviceId.slice(0,5)}`}</SelectItem>
                       ))}
                    </SelectContent>
                 </Select>
               </div>

               {/* Cam Selector box */}
               <div className="h-12 flex items-stretch rounded-full hover:bg-background/80 transition-colors overflow-hidden shrink-0">
                 <Button 
                   variant={!isCameraEnabled ? "destructive" : "ghost"} 
                   className={cn("h-full px-4 rounded-none transition-colors", isCameraEnabled && "bg-transparent hover:bg-secondary")}
                   onClick={toggleCam}
                 >
                   {!isCameraEnabled ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5 text-blue-500 dark:text-blue-400" />}
                 </Button>
                 <div className="w-px bg-border my-2" />
                 <Select value={activeCameraId} onValueChange={setActiveCameraId}>
                    <SelectTrigger className="w-6 h-full! rounded-none border-0 bg-transparent p-0 flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 [&>span]:hidden focus:ring-0 shadow-none hover:bg-secondary transition-colors cursor-pointer z-10 !data-[size=default]:h-full !data-[size=sm]:h-full">
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" sideOffset={8} className="w-[240px] bg-popover border-border text-popover-foreground">
                       {cameras.map(c => (
                         <SelectItem key={c.deviceId} value={c.deviceId} className="text-xs">{c.label || `Camera ${c.deviceId.slice(0,5)}`}</SelectItem>
                       ))}
                    </SelectContent>
                 </Select>
               </div>
            </div>

            <div className="flex items-center gap-4">
               {/* Screen Share Button */}
               <Button
                  variant={isScreenShareActive ? "default" : "secondary"}
                  size="icon"
                  className={cn("h-14 w-14 rounded-full shadow-lg transition-all shrink-0", isScreenShareActive && "bg-indigo-600 hover:bg-indigo-700")}
                  onClick={handleToggleScreenShare}
               >
                  <MonitorUp className="h-6 w-6" />
               </Button>
            
               {/* Center exit button */}
              <Link href="/">
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="h-14 w-14 rounded-full shadow-xl hover:bg-red-600 hover:scale-105 transition-all outline-4 outline-red-900/20 shrink-0 mx-2"
                  title="End Interview"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </Link>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="hover:bg-secondary text-muted-foreground rounded-full">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function LiveKitScreenShare() {
  const tracks = useTracks([Track.Source.ScreenShare]);
  const trackRef = tracks[0];

  if (!trackRef) {
     return (
         <div className="z-10 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-md">
             <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
             Starting screen share...
         </div>
     );
  }

  return <VideoTrack trackRef={trackRef} className="w-full h-full object-contain absolute inset-0 z-10 bg-black" />;
}
