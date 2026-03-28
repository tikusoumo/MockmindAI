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
  Users
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
} from "@livekit/components-react";
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

  const [liveKitToken, setLiveKitToken] = useState<string>("");
  const [liveKitUrl, setLiveKitUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
     let mounted = true;
     import("@/lib/backend").then(({ backendPost }) => {
        backendPost<{token: string, url: string}>("/livekit/token", {
           room_name: `interview-${templateId || "practice"}`,
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
  }, [templateId, currentUser?.name]);

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
            <InterviewSession currentUser={currentUser} template={dummyTemplate} isDummyMode={true} />
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
      <InterviewSession currentUser={currentUser} template={dummyTemplate} isDummyMode={false} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function InterviewSession({ currentUser, template, isDummyMode }: { currentUser: User; template?: InterviewTemplate; isDummyMode: boolean }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<{name: string, text: string, time: string}[]>([
      { name: "System", text: "Welcome to the interview session. Multiple participants can join.", time: "10:00 AM" }
  ]);
  const [chatInput, setChatInput] = useState("");

  const isCodingRound = template?.type === "Machine Coding";
  const [code, setCode] = useState("// Write your solution here...\n\nfunction solution() {\n  \n}");

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

  // --- Dummy Arrays for Layout ---
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  useEffect(() => {
    const aiInterval = setInterval(() => {
      setIsAgentSpeaking(prev => !prev);
    }, 4000);
    return () => clearInterval(aiInterval);
  }, []);

  const interviewers = [
      { id: "ai-1", name: "Sarah (Lead)", role: "AI Agent", avatar: "https://i.pravatar.cc/150?u=sarah", speaking: isAgentSpeaking, isAI: true },
      { id: "hm-1", name: "David Chen", role: "Manager", avatar: "https://i.pravatar.cc/150?u=david", speaking: false, isAI: false },
  ];

  const candidates = [
      { id: "self", name: currentUser?.name || "You", role: "Candidate", avatar: currentUser?.avatar, isLocal: true, camOn: isCameraEnabled, micOn: isMicEnabled },
      { id: "peer-1", name: "Eliza (Pairing)", role: "Candidate", avatar: "https://i.pravatar.cc/150?u=eliza", isLocal: false, camOn: true, micOn: false },
  ];

  const allParticipants = [...interviewers, ...candidates];

  return (
    <div className="flex flex-col gap-4 h-full w-full min-h-[600px] relative">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 truncate text-2xl font-bold leading-none">
              {template ? template.title : "Tech Round: React & System Design"}
            </h1>
            <Badge variant="outline" className="shrink-0 bg-green-500/10 text-green-500 border-green-500/20">Live</Badge>
            <span className="shrink-0 tabular-nums text-sm text-muted-foreground">{formatTime(elapsedTime)}</span>
            <div className="flex -space-x-2 ml-4">
                {allParticipants.slice(0, 3).map((p) => (
                    <Avatar key={p.id} className="h-6 w-6 border border-zinc-900">
                        <AvatarImage src={p.avatar} />
                        <AvatarFallback>{p.name[0]}</AvatarFallback>
                    </Avatar>
                ))}
                {allParticipants.length > 3 && (
                     <div className="h-6 w-6 rounded-full bg-zinc-800 border border-zinc-900 flex items-center justify-center text-[10px] text-zinc-400">+{allParticipants.length - 3}</div>
                )}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 relative" onClick={() => setIsChatOpen(!isChatOpen)}>
          <MessageSquare className="mr-2 h-4 w-4" /> 
          Chat
          <Badge className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center bg-indigo-500">1</Badge>
        </Button>
      </div>

      <div className={cn(
          "grid gap-3 flex-1 overflow-hidden",
          isCodingRound ? "lg:grid-cols-3" : cn(
               allParticipants.length <= 2 ? "grid-cols-1 sm:grid-cols-2" :
               allParticipants.length <= 4 ? "grid-cols-2" :
               "grid-cols-2 lg:grid-cols-3"
          )
      )}>
         {/* Code Editor Area for Machine Coding */}
         {isCodingRound && (
             <div className="lg:col-span-2 flex flex-col gap-2 h-full min-h-[400px]">
                <Card className="flex-1 overflow-hidden border-zinc-800 bg-zinc-950 p-0 shadow-xl">
                    <CodeEditor 
                      value={code} 
                      onChange={(val) => setCode(val || "")} 
                      defaultLanguage="javascript" 
                    />
                </Card>
             </div>
         )}

         {/* Participants Grid / List */}
         <div className={cn(
             "flex flex-col gap-3 min-h-[200px]", 
             isCodingRound && "lg:col-span-1 overflow-y-auto custom-scrollbar pr-1",
             !isCodingRound && "col-span-full grid gap-3 grid-cols-2"
         )}>
             {allParticipants.map((p) => {
                 const isAI = 'isAI' in p ? p.isAI : false;
                 const isLocal = 'isLocal' in p ? p.isLocal : false;
                 const micOn = isLocal ? isMicEnabled : (('micOn' in p) ? (p as any).micOn : true);
                 const speaking = isLocal ? (isMicEnabled && true) : ('speaking' in p ? (p as any).speaking : false);
                 const hasCam = isLocal ? isCameraEnabled : ('camOn' in p ? (p as any).camOn : false);
                 const isCamOff = isLocal ? !isCameraEnabled : (('camOn' in p) ? !(p as any).camOn : false);

                 return (
                    <Card key={p.id} className={cn(
                        "relative flex flex-col items-center justify-center overflow-hidden transition-all duration-300",
                        isCodingRound ? "h-[180px]" : "h-full min-h-[220px]",
                        isAI ? "bg-linear-to-b from-indigo-950 to-slate-950" : "bg-zinc-900",
                        speaking && isAI ? "border-indigo-500 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]" : 
                        speaking && !isAI ? "border-green-500 shadow-[0_0_20px_-5px_rgba(34,197,94,0.3)]" : "border-zinc-800"
                    )}>
                         {isAI && (
                             <div className="absolute inset-0 flex items-center justify-center opacity-10">
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
                                 <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                             </div>
                         )}

                         {!hasCam && (
                            <div className="z-10 relative">
                                {speaking && isAI && <div className="absolute -inset-2 rounded-full bg-indigo-500/20 blur-lg animate-pulse"></div>}
                                {speaking && !isAI && <div className="absolute -inset-2 rounded-full bg-green-500/10 blur-md animate-pulse"></div>}
                                
                                <Avatar className={cn(
                                    "border-2 transition-all duration-300 shadow-md",
                                    !isCodingRound ? "h-20 w-20" : "h-14 w-14",
                                    speaking && isAI ? "border-indigo-500 scale-105" : 
                                    speaking && !isAI ? "border-green-500 scale-105" : "border-zinc-700"
                                )}>
                                    <AvatarImage src={p.avatar} />
                                    <AvatarFallback>{p.name[0]}</AvatarFallback>
                                </Avatar>
                            </div>
                         )}

                         <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2 px-1 transition-all duration-300">
                            {/* Name and Role */}
                            <div className="space-y-0.5 text-left">
                                <h3 className="text-sm font-semibold text-white flex items-center gap-1 drop-shadow-md">
                                    {p.name} {p.id === 'self' && "(You)"}
                                </h3>
                                <p className={cn(
                                    "text-xs font-medium transition-colors drop-shadow-md",
                                    speaking && isAI ? "text-indigo-300" : 
                                    speaking && !isAI ? "text-green-400" : "text-slate-400"
                                )}>
                                    {p.role} {isAI && speaking ? "- Speaking..." : ""}
                                </p>
                            </div>

                            {/* Status Badges - grouped together with name/role */}
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {isCamOff && (
                                    <Badge variant="secondary" className="bg-black/80 text-white border-none p-0 w-6 h-6 flex items-center justify-center rounded-md shadow-sm">
                                        <VideoOff className="w-3.5 h-3.5" />
                                    </Badge>
                                )}
                                {(!micOn || (p.id !== 'self' && 'micOn' in p && !(p as any).micOn)) && (
                                    <Badge variant="secondary" className="bg-black/80 text-white border-none py-0 px-1.5 h-6 text-[10px] shadow-sm">
                                        <MicOff className="w-3 h-3 text-red-500 mr-1"/>Muted
                                    </Badge>
                                )}
                            </div>

                            {/* Audio Visualizer - real mic audio for local, simulated for others */}
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
             })}
         </div>
      </div>

      {/* Popover Chat Panel */}
      {isChatOpen && (
          <div className="absolute top-16 right-4 z-40 w-full max-w-[380px] max-h-[550px] flex flex-col rounded-2xl border border-white/10 bg-zinc-950/90 backdrop-blur-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-200 ease-out origin-top-right">
             {/* Header */}
             <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex flex-col text-left">
                   <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      Chat
                   </h3>
                   <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mt-0.5">Live Session</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-all" onClick={() => setIsChatOpen(false)}>
                   <X className="w-4 h-4"/>
                </Button>
             </div>
             
             {/* Messages Area */}
             <ScrollArea className="flex-1 max-h-[380px]">
                <div className="p-4 space-y-4">
                   {chatMessages.map((msg, i) => {
                        const isSelf = msg.name === "You" || (currentUser && msg.name === currentUser.name);
                        return (
                            <div key={i} className={cn("flex flex-col gap-1", isSelf ? "items-end text-right" : "items-start text-left")}>
                               {!isSelf && (
                                   <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight ml-1">{msg.name}</span>
                               )}
                               <div className={cn(
                                   "px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed max-w-[90%] shadow-sm",
                                   isSelf
                                       ? "bg-indigo-600 text-white rounded-br-none"
                                       : "bg-zinc-800/90 text-zinc-100 rounded-bl-none border border-white/5"
                               )}>
                                   {msg.text}
                               </div>
                               <span className="text-[8px] text-zinc-600 px-1 mt-0.5 font-medium uppercase font-mono">{msg.time}</span>
                            </div>
                        );
                   })}
                </div>
             </ScrollArea>

             {/* Input Area */}
             <div className="p-4 border-t border-white/5 bg-black/10 rounded-b-2xl">
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
                         placeholder="Message everyone..." 
                         className="w-full h-10 rounded-xl border border-white/10 bg-zinc-900/50 backdrop-blur-sm pl-4 pr-10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all selection:bg-indigo-500/30"
                     />
                     <Button 
                        type="submit" 
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-1 top-1 h-8 w-8 text-indigo-400 hover:text-indigo-300 hover:bg-transparent transition-colors"
                    >
                         <Send className="w-4 h-4" />
                     </Button>
                 </form>
             </div>
          </div>
      )}

      {/* Controls Bar */}
      <Card className="p-3 z-20 border-zinc-800 bg-zinc-950/80 backdrop-blur-xl relative">
        <div className="flex items-center justify-between relative pl-2 pr-4">
          <div className="flex bg-zinc-900 rounded-2xl p-1 gap-1 border border-zinc-800 shadow-xl">
             {/* Mic Selector box */}
             <div className="w-14 h-12 flex items-stretch rounded-xl border border-transparent hover:border-zinc-800 bg-zinc-950/50 transition-colors overflow-hidden">
               <Button 
                 variant={!isMicEnabled ? "destructive" : "ghost"} 
                 className={cn("flex-1 h-full rounded-none p-0 transition-colors", isMicEnabled && "bg-transparent hover:bg-zinc-800")}
                 onClick={toggleMic}
               >
                 {!isMicEnabled ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-green-500" />}
               </Button>
               <div className="w-px bg-zinc-800 my-2" />
               <Select value={activeMicId} onValueChange={setActiveMicId}>
                  <SelectTrigger className="w-5 h-full! rounded-none border-0 bg-transparent p-0 flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 [&>span]:hidden focus:ring-0 shadow-none hover:bg-zinc-800 transition-colors cursor-pointer z-10 !data-[size=default]:h-full !data-[size=sm]:h-full">
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
               <div className="w-px bg-zinc-800 my-2" />
               <Select value={activeCameraId} onValueChange={setActiveCameraId}>
                  <SelectTrigger className="w-5 h-full! rounded-none border-0 bg-transparent p-0 flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 [&>span]:hidden focus:ring-0 shadow-none hover:bg-zinc-800 transition-colors cursor-pointer z-10 !data-[size=default]:h-full !data-[size=sm]:h-full">
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
             {/* Screen Share Button */}
             <Button
                variant={isScreenShareEnabled ? "default" : "secondary"}
                size="icon"
                className={cn("h-12 w-12 rounded-full shadow-lg transition-all", isScreenShareEnabled && "bg-indigo-600 hover:bg-indigo-700")}
                onClick={toggleScreenShare}
             >
                <MonitorUp className="h-5 w-5" />
             </Button>
          
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
