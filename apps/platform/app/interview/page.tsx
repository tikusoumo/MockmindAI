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
  ChevronLeft,
  ChevronRight,
  FileText,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { InterviewTemplate } from "@/data/mockData";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { User } from "@/data/mockData";
import { fallbackCurrentUser } from "@/lib/fallback-data";
import { toast } from "sonner";
import { ParticipantVisualizer } from "@/components/interview/ParticipantVisualizer";
import { useMediaDevices } from "@/hooks/useMediaDevices";

import { 
  LiveKitRoom, 
  RoomAudioRenderer,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  VideoTrack,
  useTracks,
  TrackRefContext,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import '@livekit/components-styles';

// Internal component to safely wrap LiveKit VideoTrack in a context where needed
function TrackRefContextIfNeeded({ p }: { p: any }) {
    if (!p.lkpParticipant) return null;
    const pub = p.lkpParticipant.getTrackPublication(Track.Source.Camera);
    if (!pub) return null;

    const trackRef = {
        participant: p.lkpParticipant,
        source: Track.Source.Camera,
        publication: pub
    };

    return (
        <TrackRefContext.Provider value={trackRef}>
            <VideoTrack />
        </TrackRefContext.Provider>
    );
}

function LiveKitConnectionOverlay() {
  const room = useRoomContext();
  const [lastKnownState, setLastKnownState] = useState("connecting");

  useEffect(() => {
    const anyRoom = room as any;
    if (!anyRoom) return;

    const normalize = (state: unknown) => String(state ?? "").toLowerCase();

    const onConnectionStateChanged = (state: unknown) => {
      setLastKnownState(normalize(state));
    };

    anyRoom.on?.("connectionStateChanged", onConnectionStateChanged);

    return () => {
      anyRoom.off?.("connectionStateChanged", onConnectionStateChanged);
    };
  }, [room]);

  const anyRoom = room as any;
  const currentState = String(anyRoom?.state ?? anyRoom?.connectionState ?? lastKnownState).toLowerCase();
  const isConnecting = currentState !== "connected";

  if (!isConnecting) return null;

  return (
    <div className="fixed inset-0 z-[165] bg-background/70 backdrop-blur-sm flex items-center justify-center">
      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm font-medium">Connecting to server...</span>
      </div>
    </div>
  );
}

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const customTitle = searchParams.get("title");
  const customType = searchParams.get("type");
  const sessionId = searchParams.get("sessionId");
  const modeParam = searchParams.get("mode") || "strict";

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/auth?returnTo=${encodeURIComponent(currentUrl)}`);
    }
  }, [router]);

  const hasToken = typeof window !== "undefined" ? !!localStorage.getItem("auth_token") : true;

    // Load actual user before generating LiveKit token so that the generated token gets the real user name
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isUserLoaded, setIsUserLoaded] = useState(false);

    useEffect(() => {
        let mounted = true;
        if (!hasToken) {
            if (mounted) setIsUserLoaded(true);
            return;
        }

        import("@/lib/backend").then(({ backendGet }) => {
            backendGet<User>("/api/user")
                .then(user => {
                    if (mounted) {
                        setCurrentUser(user);
                        setIsUserLoaded(true);
                    }
                })
                .catch(() => {
                    if (mounted) {
                        setCurrentUser(fallbackCurrentUser);
                        setIsUserLoaded(true);
                    }
                });
        });
        return () => { mounted = false; };
    }, [hasToken]);

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
    mode: sessionDbData?.aiBehavior || (modeParam as any) || "strict",
    duration: "45 mins",
    difficulty: sessionDbData?.difficulty || (searchParams.get("difficulty") as any) || "Medium",
    questions: [],
    description: sessionDbData?.focusAreas || "Practice session",
    icon: isCodingRound ? "Code" : "Sparkles",
    color: isCodingRound ? "blue" : "blue",
    persona: sessionDbData?.persona || searchParams.get("persona") || "Sarah",
  };

  const [liveKitToken, setLiveKitToken] = useState<string>("");
  const [liveKitUrl, setLiveKitUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
     let mounted = true;
     if (!hasToken || !isUserLoaded) return;

      setIsFetchingToken(true);
      setError("");

       import("@/lib/backend").then(({ backendPost }) => {
        backendPost<{token: string, url: string}>("/api/livekit/token", {
           room_name: `interview-${sessionId || templateId || "practice"}`,
           participant_name: currentUser?.name || "Candidate",            
           metadata: JSON.stringify({
               templateId: templateId,
               sessionId: sessionId,
               templateTitle: customTitle || "Interview",
              mode: modeParam
            })        }).then((data) => {
           if (mounted) {
              setLiveKitToken(data.token);
              setLiveKitUrl(data.url);
              setIsFetchingToken(false);
           }
        }).catch((err) => {
           if (mounted) {
               console.error("Failed to fetch LiveKit token", err);
               setIsFetchingToken(false);
               setError("Unable to connect to server");
           }
        });
     });
     return () => { mounted = false; };
  }, [hasToken, templateId, sessionId, currentUser?.name, isUserLoaded, customTitle, modeParam, retryNonce]);

  if (!currentUser || !liveKitToken) {
     return (
       <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-4 text-center bg-background/70 backdrop-blur-sm px-6">
         <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
         <p className="text-muted-foreground text-sm">
           {!isUserLoaded
             ? "Preparing interview..."
             : isFetchingToken
               ? "Connecting to server..."
               : error || "Connecting to session..."}
         </p>
         {!!error && (
           <Button variant="outline" onClick={() => setRetryNonce((v) => v + 1)}>
             Retry
           </Button>
         )}
       </div>
     );
  }

  return (
    <LiveKitRoom
      token={liveKitToken}
      serverUrl={liveKitUrl}
      connect={true}
      video={false}
      audio={true}
      className="flex flex-col gap-4 h-full w-full"
    >
      <LiveKitConnectionOverlay />
      <InterviewSessionWithLiveKit currentUser={currentUser} template={dummyTemplate} isDummyMode={false} sessionDbData={sessionDbData} />
      <RoomAudioRenderer volume={1} muted={false} />
    </LiveKitRoom>
  );
}

// Wrapper component that uses LiveKit hooks and passes participants to InterviewSession
function InterviewSessionWithLiveKit({ currentUser, template, isDummyMode, sessionDbData }: { currentUser: User; template?: InterviewTemplate; isDummyMode: boolean; sessionDbData?: any; }) {
  const rawRemoteParticipants = useRemoteParticipants();
  const room = useRoomContext();
  
  return (
    <InterviewSession 
      currentUser={currentUser} 
      template={template} 
      isDummyMode={isDummyMode} 
      sessionDbData={sessionDbData}
      liveKitParticipants={rawRemoteParticipants}
      liveKitRoom={room}
    />
  );
}

function InterviewSession({ currentUser, template, isDummyMode, sessionDbData, liveKitParticipants = [], liveKitRoom = null }: { currentUser: User; template?: InterviewTemplate; isDummyMode: boolean; sessionDbData?: any; liveKitParticipants?: any[]; liveKitRoom?: any }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccessType, setInviteAccessType] = useState(sessionDbData?.accessType || "restricted");
  const [isInviting, setIsInviting] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail && inviteAccessType === sessionDbData?.accessType) {
        toast.error("Please enter an email or change access type.");
        return;
    }
    if (!sessionDbData?.id) {
        toast.error("You are in a sandbox session resulting from a direct link template. Please start a real session from the dashboard to invite users.");
        return;
    }
    try {
        setIsInviting(true);
        const { backendPost } = await import("@/lib/backend");
        const payload = {
            emails: inviteEmail ? [inviteEmail] : [],
            accessType: inviteAccessType === 'anyone' ? 'link' : inviteAccessType
        };
        await backendPost(`/api/sessions/${sessionDbData?.id}/invite`, payload);
        toast.success("Session updated / Invitation sent!");
        setInviteEmail("");
    } catch (err: any) {
        toast.error("Failed to send invite: " + err.message);
    } finally {
        setIsInviting(false);
    }
  };

  const [chatMessages, setChatMessages] = useState<{name: string, text: string, time: string}[]>([
      { name: "System", text: "Welcome to the interview session. Multiple participants can join.", time: "10:00 AM" }
  ]);
  const [chatInput, setChatInput] = useState("");

  const effectiveType = sessionDbData?.type || template?.type;
  const isCodingRound = effectiveType === "Machine Coding" || effectiveType === "Technical" || template?.id === "machine-coding-round" || template?.id === "tech-round";
  const [code, setCode] = useState("// Write your solution here...\n\nfunction solution() {\n  \n}");
  const [currentEditorLanguage, setCurrentEditorLanguage] = useState("javascript");
  
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
  const { localParticipant: liveKitLocalParticipant } = useLocalParticipant();
  const lkParticipant = isDummyMode ? null : liveKitLocalParticipant;
  const isScreenShareEnabled = lkParticipant?.isScreenShareEnabled ?? false;

  const toggleMic = useCallback(() => setIsMicEnabled(prev => !prev), [setIsMicEnabled]);
  const toggleCam = useCallback(() => setIsCameraEnabled(prev => !prev), [setIsCameraEnabled]);
  const toggleScreenShare = useCallback(() => {
     if (lkParticipant) lkParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: false }).catch(console.error);
  }, [lkParticipant, isScreenShareEnabled]);

  // Sync local participant media with UI toggles
  useEffect(() => {
    if (lkParticipant) {
      lkParticipant.setMicrophoneEnabled(isMicEnabled).catch(console.error);
    }
  }, [lkParticipant, isMicEnabled]);

  useEffect(() => {
    if (lkParticipant) {
      lkParticipant.setCameraEnabled(isCameraEnabled).catch(console.error);
    }
  }, [lkParticipant, isCameraEnabled]);

  // Browsers may block remote audio until a user gesture. Try once on mount,
  // and retry after the first click/keypress so agent TTS becomes audible.
  useEffect(() => {
    if (isDummyMode || !liveKitRoom) return;

    const unlockAudio = () => {
      if (typeof liveKitRoom.startAudio === "function") {
        liveKitRoom.startAudio().catch((err: unknown) => {
          setIsAudioBlocked(true);
          console.warn("LiveKit audio unlock pending user gesture", err);
        }).then(() => {
          setIsAudioBlocked(false);
        });
      }
    };

    unlockAudio();
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [isDummyMode, liveKitRoom]);

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
  // These states are set by LiveKitSessionContent when not in dummy mode
  const remoteParticipants = liveKitParticipants || [];
  const isAgentSpeaking = remoteParticipants.some(p => p.identity.startsWith('agent-') && p.isSpeaking);
  const isAgentConnected = remoteParticipants.some(p => p.identity.startsWith('agent-'));
  const isAgentListening = isAgentConnected && !isAgentSpeaking;

  // --- Session End / Report Modal ---
  const [showReportModal, setShowReportModal] = useState(false);
  const [liveReport, setLiveReport] = useState<any>(null);
  const [isEndingInterview, setIsEndingInterview] = useState(false);

  const handleEndInterview = useCallback(async () => {
    if (showReportModal) return;
    setShowReportModal(true);
    setIsEndingInterview(true);

    try {
      if (!isDummyMode && liveKitRoom) {
        await Promise.resolve(liveKitRoom.disconnect());
      }
    } catch (err) {
      console.error("Failed to disconnect LiveKit room on end interview", err);
    } finally {
      setIsEndingInterview(false);
    }
  }, [showReportModal, isDummyMode, liveKitRoom]);

  useEffect(() => {
    if (!showReportModal || !sessionDbData?.id) return;
    setLiveReport(null);

    const pollStartedAt = Date.now();

    const interval = setInterval(async () => {
      try {
        const { backendGet } = await import("@/lib/backend");
        const res: any = await backendGet(`/api/reports/${sessionDbData?.id}`);
        const reportId = String(res?.id || "");
        if (!reportId) {
          return;
        }

        // Always render current payload so the modal doesn't spin forever while pending.
        setLiveReport(res);

        if (!reportId.startsWith("rep_pending_")) {
          clearInterval(interval);
          return;
        }

        // Stop polling after 2 minutes and let the report page continue the pending state.
        if (Date.now() - pollStartedAt > 120000) {
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [showReportModal, sessionDbData?.id]);

  const isPendingLiveReport = Boolean(liveReport?.id?.startsWith("rep_pending_"));

  const fallbackInterviewers = [
      { id: "ai-1", name: "Sarah (Lead)", role: "AI Agent", avatar: "https://i.pravatar.cc/150?u=sarah", speaking: isAgentSpeaking, isAI: true },
      { id: "hm-1", name: "David Chen", role: "Manager", avatar: "https://i.pravatar.cc/150?u=david", speaking: false, isAI: false },
  ];

  const fallbackCandidates = [
      { id: "self", name: currentUser?.name || "You", role: "Candidate", avatar: currentUser?.avatar, isLocal: true, camOn: isCameraEnabled, micOn: isMicEnabled },
      { id: "peer-1", name: "Eliza (Pairing)", role: "Candidate", avatar: "https://i.pravatar.cc/150?u=eliza", isLocal: false, camOn: true, micOn: false },
  ];

  let interviewers: any[], candidates: any[];

  if (sessionDbData && sessionDbData.participants) {
      interviewers = [
          { id: "ai-1", name: `${sessionDbData?.persona || 'Sarah'} (Lead)`, role: "AI Agent", avatar: `https://i.pravatar.cc/150?u=${sessionDbData?.persona?.toLowerCase() || 'sarah'}`, speaking: isAgentSpeaking, isAI: true, isHost: false }
      ];

      const sessionParts = sessionDbData.participants || [];

      sessionParts.forEach((p: any) => {
            const pName = p.name || p.email?.split('@')[0] || "Unknown";        
            const matchingLkParticipant = remoteParticipants.find((lkp: any) => lkp.name === pName || lkp.identity.includes(pName));
            if (!matchingLkParticipant) return; // Only show if they've joined LiveKit

            const isLkSpeaking = matchingLkParticipant.isSpeaking;
            const roleNormalized = p.role?.toLowerCase() || '';

            if (roleNormalized === 'interviewer' || roleNormalized === 'observer') {
                interviewers.push({
                    id: p.id,
                    lkpIdentity: matchingLkParticipant.identity,
                    lkpParticipant: matchingLkParticipant,
                    name: pName,
                    role: p.role,
                    avatar: `https://i.pravatar.cc/150?u=${p.email}`,
                    speaking: isLkSpeaking,
                    isHost: sessionDbData.userId === p.userId
              });
          }
      });

      candidates = [
          { id: "self", name: currentUser?.name || "You", role: "Candidate", avatar: currentUser?.avatar, isLocal: true, camOn: isCameraEnabled, micOn: isMicEnabled, isHost: sessionDbData.userId === (currentUser as any)?.id }
      ];

      sessionParts.forEach((p: any) => {
          const roleNormalized = p.role?.toLowerCase() || '';
            const pName = p.name || p.email?.split('@')[0] || "Unknown";        
            const matchingLkParticipant = remoteParticipants.find((lkp: any) => lkp.name === pName || lkp.identity.includes(pName));

            // Only render candidate if they actully joined LiveKit
            if (!matchingLkParticipant) return;

          if (roleNormalized === 'candidate' && p.email !== (currentUser as any)?.email) {
              candidates.push({
                  id: p.id,
                  lkpIdentity: matchingLkParticipant.identity,
                  lkpParticipant: matchingLkParticipant,
                  name: pName,
                  role: p.role,
                  avatar: `https://i.pravatar.cc/150?u=${p.email}`,
                  isLocal: false,
                  camOn: matchingLkParticipant.isCameraEnabled,
                  micOn: matchingLkParticipant.isMicrophoneEnabled,
                  speaking: matchingLkParticipant.isSpeaking,
                  isHost: sessionDbData.userId === p.userId
              });
          }
      });
  } else {
      // Dynamic rendering directly from templates instead of the static 4 users
      const personaName = sessionDbData?.persona || template?.persona || "Sarah";
      interviewers = [
          { id: "ai-1", name: `${personaName} (Lead)`, role: "AI Agent", avatar: `https://i.pravatar.cc/150?u=${personaName.toLowerCase()}`, speaking: isAgentSpeaking, isAI: true, isHost: false }
      ];
      candidates = [
          { id: "self", name: currentUser?.name || "You", role: "Candidate", avatar: currentUser?.avatar, isLocal: true, camOn: isCameraEnabled, micOn: isMicEnabled, isHost: sessionDbData?.userId === (currentUser as any)?.id }
      ];
  }

  // Catch-all for any connected remote participant not matched above
  remoteParticipants.forEach((lkp: any) => {
      if (lkp.identity.startsWith('agent-')) return;

      const inCandidates = candidates.find((c: any) => c.lkpIdentity === lkp.identity || (c.id !== 'self' && c.name === lkp.name && !c.lkpIdentity));
      const inInterviewers = interviewers.find((i: any) => i.lkpIdentity === lkp.identity || (i.id !== 'ai-1' && i.name === lkp.name && !i.lkpIdentity));       

      if (!inCandidates && !inInterviewers) {
          candidates.push({
              id: lkp.identity,
              lkpIdentity: lkp.identity,
              lkpParticipant: lkp,
              name: lkp.name || lkp.identity,
              role: "Guest",
              avatar: `https://i.pravatar.cc/150?u=${lkp.identity}`,
              isLocal: false,
              camOn: lkp.isCameraEnabled,
              micOn: lkp.isMicrophoneEnabled,
              speaking: lkp.isSpeaking,
              isHost: false
          });
      }
  });

  const allParticipants = [...interviewers, ...candidates];

  // Helper derived states for layout
  const effectiveViewMode = isScreenShareActive ? "presentation" : isCodingRound ? "coding" : (pinnedId || viewMode === "speaker") ? "speaker" : "grid";        

  const mainParticipant = pinnedId
      ? allParticipants.find(p => p.id === pinnedId)
      : allParticipants.find(p => p.speaking) || allParticipants[0];

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

             {/* Remote user camera feed */}
             {!isLocal && !isAI && p.lkpParticipant && hasCam && (
                 <div className="absolute inset-0 z-0 [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>video]:transform [&>video]:-scale-x-100">
                     <TrackRefContextIfNeeded p={p} />
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
                        {p.isHost && (
                            <Badge variant="secondary" className={cn("px-1.5 py-0 text-[10px] ml-1 font-medium", hasCam ? "bg-indigo-500/30 text-white border-white/20" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20")}>
                                Host
                            </Badge>
                        )}
                    </h3>
                    <p className={cn(
                        "text-xs font-medium transition-colors drop-shadow-md",
                        speaking && isAI ? "text-indigo-400 dark:text-indigo-300" : 
                        speaking && !isAI ? "text-emerald-500 dark:text-emerald-400" : "text-muted-foreground"
                    )}>
                        {p.role}{isAI && speaking ? " · Speaking..." : isAI && isAgentListening ? " · Listening..." : ""}
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
      {!isDummyMode && isAudioBlocked && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-[160]">
          <Button
            className="rounded-full shadow-xl"
            onClick={() => {
              if (liveKitRoom && typeof liveKitRoom.startAudio === "function") {
                liveKitRoom.startAudio()
                  .then(() => setIsAudioBlocked(false))
                  .catch((err: unknown) => {
                    setIsAudioBlocked(true);
                    console.warn("Manual LiveKit audio unlock failed", err);
                  });
              }
            }}
          >
            Enable AI Audio
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 min-w-0">
        {/* LEFT — Title + status */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold leading-none min-w-0 shrink">
            {sessionDbData?.title || template?.title || "Session"}
          </h1>
          <Badge variant="outline" className="shrink-0 bg-green-500/10 text-green-500 border-green-500/20 text-[11px]">Live</Badge>
          <span className="shrink-0 tabular-nums text-sm text-muted-foreground font-mono">{formatTime(elapsedTime)}</span>
        </div>

        {/* RIGHT — Invite + Avatars + View Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Avatar stack */}
          <div className="flex -space-x-2">
            {allParticipants.slice(0, 3).map((p) => (
              <Avatar key={p.id} className="h-6 w-6 border border-muted drop-shadow-sm">
                <AvatarImage src={p.avatar} />
                <AvatarFallback className="text-[10px]">{p.name[0]}</AvatarFallback>
              </Avatar>
            ))}
            {allParticipants.length > 3 && (
              <div className="h-6 w-6 rounded-full bg-secondary border border-muted flex items-center justify-center text-[10px] text-muted-foreground shadow-sm">
                +{allParticipants.length - 3}
              </div>
            )}
          </div>

          {/* Invite dialog */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0">
                <Users className="h-3 w-3" />
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Share Meeting Session</DialogTitle>
                <DialogDescription>
                  Invite others to join this interview or change link access settings.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-semibold">General Access</h4>
                  <Select value={inviteAccessType === 'link' ? 'anyone' : inviteAccessType} onValueChange={(val) => setInviteAccessType(val === 'anyone' ? 'link' : val)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Access Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restricted">Restricted (Only invited can join)</SelectItem>
                      <SelectItem value="anyone">Anyone with link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <h4 className="text-sm font-semibold">Invite via Email</h4>
                  <div className="flex w-full items-center space-x-2">
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <Button variant="secondary" onClick={handleInvite} disabled={isInviting}>
                      {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send Invite
                    </Button>
                  </div>
                </div>
                <div className="mt-4 p-4 border rounded bg-secondary/30">
                  <p className="text-xs text-muted-foreground mb-2">Meeting Link</p>
                  <div className="flex items-center space-x-2">
                    <Input readOnly value={typeof window !== 'undefined' ? window.location.href : ''} className="text-xs" />
                    <Button size="sm" onClick={() => {
                      navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : '');
                      toast.success("Meeting link copied to clipboard!");
                    }}>Copy</Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* View mode + other controls */}
          <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-sm shrink-0">
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

                             <div className="flex-1 min-h-[300px] relative isolate">
                                <CodeEditor 
                                    value={code} 
                                    onChange={(val) => setCode(val || "")} 
                                    defaultLanguage={currentEditorLanguage}
                                    onCodeSnapshot={(c, lang) => { setCode(c); setCurrentEditorLanguage(lang); }}
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
            
               {/* Center exit button — opens post-session report */}
              <Button 
                variant="destructive" 
                size="icon" 
                className="h-14 w-14 rounded-full shadow-xl hover:bg-red-600 hover:scale-105 transition-all outline-4 outline-red-900/20 shrink-0 mx-2"
                title="End Interview"
                onClick={handleEndInterview}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="hover:bg-secondary text-muted-foreground rounded-full">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
      {/* End-of-session Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-linear-to-r from-indigo-600 to-indigo-500 p-6 text-white relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-10">
                <Trophy className="w-32 h-32 -mt-4 -mr-4" />
              </div>
              <div className="relative z-10">
                <p className="text-indigo-200 text-sm font-medium uppercase tracking-widest mb-1">Session Complete</p>
                <h2 className="text-2xl font-bold">{sessionDbData?.title || template?.title || "Interview"}</h2>
                <p className="text-indigo-200 text-sm mt-1">{formatTime(elapsedTime)} duration</p>
              </div>
            </div>
              {!liveReport ? (
              <div className="p-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <p className="text-sm font-medium text-muted-foreground animate-pulse">
                    {isEndingInterview ? "Ending call and preparing report..." : "AI is finalizing your report..."}
                  </p>
              </div>
            ) : (
              <>
                  {isPendingLiveReport && (
                    <div className="px-6 pt-4">
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                        Report is still finalizing. You can open it now and it will keep updating.
                      </div>
                    </div>
                  )}
                <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                  {[
                    { label: "Overall", value: `${liveReport.overallScore}%`, color: "text-primary" },
                    { label: "Hard Skills", value: `${liveReport.hardSkillsScore}%`, color: "text-blue-500" },
                    { label: "Soft Skills", value: `${liveReport.softSkillsScore}%`, color: "text-emerald-500" },
                  ].map((s) => (
                    <div key={s.label} className="p-4 text-center">
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="p-6 space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Session Highlights</h3>
                  <div className="space-y-2">
                    {liveReport.swot?.strengths?.slice(0, 2).map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-3 text-sm bg-muted/40 rounded-lg px-3 py-2.5">
                        <span className="text-base shrink-0">✅</span>
                        <span className="text-foreground/80">{s}</span>
                      </div>
                    ))}
                    {liveReport.swot?.weaknesses?.slice(0, 1).map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-3 text-sm bg-muted/40 rounded-lg px-3 py-2.5">
                        <span className="text-base shrink-0">💡</span>
                        <span className="text-foreground/80">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" className="flex-1" onClick={() => { setShowReportModal(false); window.location.href = "/"; }}>
                Leave Session
              </Button>
              <Button
                disabled={!liveReport && !sessionDbData?.id}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => {
                  const reportId = String(liveReport?.id || "");
                  const targetId = reportId && !reportId.startsWith("rep_pending_")
                    ? reportId
                    : (sessionDbData?.id || "latest");
                  setShowReportModal(false);
                  window.location.href = `/report/${targetId}`;
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                View Full Report
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
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






