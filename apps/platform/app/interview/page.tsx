"use client";

import { useState, useEffect, useRef } from "react";
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

type InterviewState = 'ai-speaking' | 'user-speaking' | 'processing' | 'listening';

export default function InterviewPage() {
  const currentUser = useBackendData<User>("/api/user", fallbackCurrentUser);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [interviewState, setInterviewState] = useState<InterviewState>('ai-speaking');
  const [audioLevel, setAudioLevel] = useState(0);

  type WindowWithWebkitAudioContext = Window & {
    webkitAudioContext?: typeof AudioContext;
  };

  // Store random bar heights for AI wave animation
  const aiWaveHeights = Array.from({ length: 12 }, (_, i) => {
    const t = (Math.sin(i * 1.35) + 1) / 2; // 0..1, deterministic
    return 20 + t * 60;
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentVolumeRef = useRef(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  // Timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize Audio
  useEffect(() => {
    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const AudioContextCtor =
          window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
        if (!AudioContextCtor) return;
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 256;
        source.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        sourceRef.current = source;

        const checkAudioLevel = () => {
          if (isMuted) {
             setAudioLevel(0);
             animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
             return;
          }

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          
          // Calculate average volume
          // Focus on lower frequencies where voice energy is concentrated
          const voiceData = dataArray.slice(0, dataArray.length / 2);
          const average = voiceData.reduce((a, b) => a + b) / voiceData.length;
          
          // Apply a boost curve for visualization (square root boosts low values)
          const normalized = average / 255;
          const boosted = Math.pow(normalized, 0.6) * 255 * 1.5; // 1.5x gain after curve
          
          // Smooth the volume change (Linear Interpolation)
          // current = current + (target - current) * factor
          // Lower factor = smoother but slower response
          currentVolumeRef.current += (Math.min(255, boosted) - currentVolumeRef.current) * 0.15;
          
          setAudioLevel(currentVolumeRef.current);

          // VAD Logic - Thresholds
          const SPEECH_THRESHOLD = 5; // Lowered from 10
          const SILENCE_THRESHOLD = 3; // Lowered from 5

          if (average > SPEECH_THRESHOLD) { 
            if (interviewState === 'listening') {
              setInterviewState('user-speaking');
            }
            
            // Reset silence timer if user is speaking
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (interviewState === 'user-speaking' && average < SILENCE_THRESHOLD) {
            // If silence detected while user was speaking
            if (!silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                setInterviewState('processing');
                silenceTimerRef.current = null;
              }, 2000); // 2 seconds of silence to confirm end of speech
            }
          }

          animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
        };

        checkAudioLevel();
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }
    };

    initAudio();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isMuted, interviewState]);

  // Initialize Camera
  useEffect(() => {
    const stopVideo = () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      if (videoStreamRef.current) {
        for (const track of videoStreamRef.current.getTracks()) {
          track.stop();
        }
        videoStreamRef.current = null;
      }
    };

    const initVideo = async () => {
      setIsCameraLoading(true);
      setCameraError(null);

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError("Camera is not supported in this browser.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        videoStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to access camera.";
        setCameraError(message);
        stopVideo();
      } finally {
        setIsCameraLoading(false);
      }
    };

    if (isVideoOff) {
      stopVideo();
      setCameraError(null);
      setIsCameraLoading(false);
      return;
    }

    initVideo();

    return () => {
      stopVideo();
    };
  }, [isVideoOff]);

  // AI Simulation effect
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (interviewState === 'ai-speaking') {
      // AI speaks for 4 seconds, then goes to listening mode
      timeout = setTimeout(() => {
        setInterviewState('listening');
      }, 4000);
    } else if (interviewState === 'processing') {
      // AI processes for 2 seconds, then speaks
      timeout = setTimeout(() => {
        setInterviewState('ai-speaking');
      }, 2000);
    }

    return () => clearTimeout(timeout);
  }, [interviewState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
              Live
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
          interviewState === 'ai-speaking' ? "border-indigo-500 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]" : "border-indigo-500/20"
        )}>
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            {/* Dynamic Audio Wave Animation */}
            <div className="flex items-center gap-1 h-32">
              {[...Array(12)].map((_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "w-3 bg-indigo-500 rounded-full transition-all duration-300",
                    interviewState === 'ai-speaking' ? "animate-pulse" : "h-2 opacity-30"
                  )}
                  style={{ 
                    height:
                      interviewState === 'ai-speaking'
                        ? `${aiWaveHeights[i]}%`
                        : '10%',
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: '0.6s'
                  }} 
                />
              ))}
            </div>
          </div>
          
          <div className="z-10 flex flex-col items-center gap-4">
            <div className="relative">
              {interviewState === 'ai-speaking' && (
                <div className="absolute -inset-4 rounded-full bg-indigo-500/20 blur-xl animate-pulse"></div>
              )}
              <Avatar className={cn(
                "h-32 w-32 border-4 transition-all duration-300",
                interviewState === 'ai-speaking' ? "border-indigo-500 scale-105" : "border-indigo-500/30"
              )}>
                <AvatarImage src="https://i.pravatar.cc/150?u=ai-interviewer" />
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
              
              {interviewState === 'processing' && (
                <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-1 shadow-lg border">
                  <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
                </div>
              )}
            </div>
            
            <div className="text-center space-y-1">
              <h3 className="text-xl font-semibold text-white">Sarah (Tech Lead)</h3>
              <p className={cn(
                "text-sm font-medium transition-colors duration-300",
                interviewState === 'ai-speaking' ? "text-indigo-300" : 
                interviewState === 'processing' ? "text-yellow-400" : "text-slate-400"
              )}>
                {interviewState === 'ai-speaking' ? "Speaking..." : 
                 interviewState === 'processing' ? "Thinking..." : "Listening..."}
              </p>
            </div>
          </div>
        </Card>

        {/* User View */}
        <Card className={cn(
          "relative flex flex-col items-center justify-center overflow-hidden bg-zinc-900 transition-all duration-300",
          interviewState === 'user-speaking' ? "border-green-500 shadow-[0_0_30px_-5px_rgba(34,197,94,0.2)]" : "border-zinc-800"
        )}>
          {isVideoOff || cameraError ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Avatar className="h-24 w-24 border-4 border-zinc-700 mb-2">
                <AvatarImage src={currentUser.avatar} />
                <AvatarFallback>{currentUser.name[0]}</AvatarFallback>
              </Avatar>
              <p className="font-semibold text-lg text-white">{currentUser.name}</p>
              <p className="text-xs text-muted-foreground">
                {cameraError ? "Camera unavailable" : "Camera is off"}
              </p>
            </div>
          ) : (
            <div className="absolute inset-0 bg-zinc-800">
              <video
                ref={videoRef}
                className="h-full w-full object-cover -scale-x-100"
                autoPlay
                playsInline
                muted
              />

              {isCameraLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-200 bg-black/40">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Starting camera…</span>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* User Voice Visualizer Overlay */}
          {interviewState === 'user-speaking' && !isMuted && (
            <div className="absolute bottom-4 right-4 flex gap-1 items-center h-8">
                {[0.2, 0.4, 0.7, 1.0, 0.7, 0.4, 0.2].map((multiplier, i) => (
                <div 
                  key={i} 
                  className="w-1.5 bg-green-500 rounded-full"
                  style={{ 
                    height: `${Math.max(20, Math.min(100, (audioLevel / 255) * 100 * multiplier * 1.5))}%`,
                    opacity: Math.max(0.4, Math.min(1, (audioLevel / 255) + 0.2))
                  }} 
                />
              ))}
            </div>
          )}

          <div className="absolute bottom-4 left-4">
            <div className={cn(
              "backdrop-blur-md px-3 py-1 rounded-md text-sm font-medium transition-colors",
              interviewState === 'user-speaking' ? "bg-green-500/80 text-white" : "bg-black/50 text-white"
            )}>
              {interviewState === 'user-speaking' ? "You (Speaking)" : "You"}
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
              variant={isMuted ? "destructive" : "secondary"} 
              size="icon" 
              className="h-12 w-12 rounded-full"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            
            <Button 
              variant={isVideoOff ? "destructive" : "secondary"} 
              size="icon" 
              className="h-12 w-12 rounded-full"
              onClick={() => setIsVideoOff(!isVideoOff)}
            >
              {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
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
             {/* Spacer to balance layout */}
             <div className="w-10"></div>
          </div>
        </div>
      </Card>
    </div>
  );
}
