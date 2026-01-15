"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { User } from "@/data/mockData";
import { useBackendData } from "@/lib/backend";
import { fallbackCurrentUser } from "@/lib/fallback-data";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useVoiceAssistant,
  useConnectionState,
  BarVisualizer,
  VideoTrack,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { RoomEvent, ConnectionState, LocalParticipant, Track } from "livekit-client";

export default function InterviewPage() {
  const currentUser = useBackendData<User>("/api/user", fallbackCurrentUser);
  const [token, setToken] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [roomName, setRoomName] = useState("interview-" + Math.random().toString(36).substring(7));

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/livekit/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_name: roomName,
            participant_name: currentUser?.name || "Candidate",
          }),
        });
        const data = await response.json();
        setToken(data.token);
        setUrl(data.url);
      } catch (e) {
        console.error("Failed to fetch token", e);
      }
    })();
  }, [currentUser, roomName]);

  if (!token || !url) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      connect={true}
      audio={true}
      video={true} // Enable video if desired, currently page UI assumes video
      className="flex h-full flex-col gap-4"
    >
      <InterviewSession currentUser={currentUser} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function InterviewSession({ currentUser }: { currentUser: User }) {
  const { state: agentState, audioTrack: agentAudioTrack } = useVoiceAssistant();
  const roomState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer effect
  useEffect(() => {
    if (roomState === ConnectionState.Connected) {
      const timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [roomState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isAgentSpeaking = agentState === "speaking";
  const isAgentThinking = false; // agentState type does not include thinking/transcribing in this version

  // Toggle helpers
  const toggleMic = useCallback(() => {
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleCam = useCallback(() => {
    localParticipant.setCameraEnabled(!isCameraEnabled);
  }, [localParticipant, isCameraEnabled]);


  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 truncate text-2xl font-bold leading-none">
              Tech Round: React & System Design
            </h1>
            <Badge
              variant="outline"
              className="shrink-0 bg-green-500/10 text-green-500 border-green-500/20"
            >
              {roomState === ConnectionState.Connected ? "Live" : roomState}
            </Badge>
            <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
              {formatTime(elapsedTime)}
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm">
          <MessageSquare className="mr-2 h-4 w-4" /> Show Transcript
        </Button>
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-2">
        {/* AI Interviewer View */}
        <Card className={cn(
          "relative flex flex-col items-center justify-center overflow-hidden transition-all duration-500",
          "bg-linear-to-b from-indigo-950 to-slate-950",
          isAgentSpeaking ? "border-indigo-500 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]" : "border-indigo-500/20"
        )}>
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
             {/* Use LiveKit's BarVisualizer if available or custom, here sticking to custom simulation style for consistent UI but driven by state if possible, 
                 or we can hook up a visualizer to the agent track if we wanted to be fancy. 
                 For now, keeping the pulsing animation logic tied to isAgentSpeaking state for simplicity and look. 
             */}
             {agentAudioTrack && (
                <div className="h-32 w-64 flex items-center justify-center">
                    <BarVisualizer
                        state={agentState}
                        trackRef={{ publication: agentAudioTrack.publication, participant: agentAudioTrack.participant, source: Track.Source.Microphone }}
                        barCount={7}
                        options={{ minHeight: 20, maxHeight: 60 }}
                        className="h-full w-full"
                    />
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
            {/* LiveKit handles local video, we can render it. 
                Using custom loop wrapper or just a VideoTrack from livekit/components-react 
            */}
             
            {!isCameraEnabled ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Avatar className="h-24 w-24 border-4 border-zinc-700 mb-2">
                        <AvatarImage src={currentUser?.avatar} />
                        <AvatarFallback>{currentUser?.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <p className="font-semibold text-lg text-white">{currentUser?.name}</p>
                    <p className="text-xs text-muted-foreground">Camera is off</p>
                </div>
            ) : (
                <div className="absolute inset-0 bg-zinc-800">
                     {/* We can use VideoTrack here for local participant */}
                     <div className="h-full w-full object-cover -scale-x-100">
                         {/* Since we are inside LiveKitRoom, LiveKit handles the track publication. 
                             To render self view: */}
                         {/* <VideoTrack trackRef={...} />  - Needs track reference. 
                             Easier: Use standard HTML video element with the track if we extract it, 
                             or use `VideoConference` component which does layout, but we have a custom layout.
                             Let's assume simply that we want to show the local video track.
                         */}
                         <LocalVideoView /> 
                     </div>
                </div>
            )}
          
          <div className="absolute bottom-4 left-4">
            <div className={cn(
              "backdrop-blur-md px-3 py-1 rounded-md text-sm font-medium transition-colors",
              isMicrophoneEnabled ? "bg-green-500/80 text-white" : "bg-black/50 text-white"
            )}>
              {isMicrophoneEnabled ? "You (Mic On)" : "You (Mic Off)"}
            </div>
          </div>
        </Card>
      </div>

      {/* Controls Bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <Button 
              variant={!isMicrophoneEnabled ? "destructive" : "secondary"} 
              size="icon" 
              className="h-12 w-12 rounded-full"
              onClick={toggleMic}
            >
              {!isMicrophoneEnabled ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            
            <Button 
              variant={!isCameraEnabled ? "destructive" : "secondary"} 
              size="icon" 
              className="h-12 w-12 rounded-full"
              onClick={toggleCam}
            >
              {!isCameraEnabled ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </Button>

            <Link href="/">
              <Button 
                variant="destructive" 
                size="icon" 
                className="h-12 w-12 rounded-full"
              >
                <PhoneOff className="h-5 w-5" />
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-2">
             <div className="w-10"></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

import { useTracks } from "@livekit/components-react";

function LocalVideoView() {
    const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const localTrack = tracks.find((t) => t.participant instanceof LocalParticipant);
    
    if (!localTrack?.publication?.track) return null;

    return <VideoTrack trackRef={localTrack} className="h-full w-full object-cover" />;
}
