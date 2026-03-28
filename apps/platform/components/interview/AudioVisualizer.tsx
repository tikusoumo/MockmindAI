"use client";

import { useEffect, useRef, useState } from "react";

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
  barCount?: number;
}

export function AudioVisualizer({ stream, isActive, barCount = 7 }: AudioVisualizerProps) {
  const [volumes, setVolumes] = useState<number[]>(Array(barCount).fill(6));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // History tracking to cascade waves from the center outward
  const halfCount = Math.ceil(barCount / 2);
  const historyRef = useRef<number[]>(Array(halfCount).fill(6));
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !isActive) {
        setVolumes(Array(barCount).fill(6)); 
        historyRef.current = Array(halfCount).fill(6);
        return;
    }

    if (stream.getAudioTracks().length === 0) return;

    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const context = audioContextRef.current;

    if (context.state === 'suspended') {
        context.resume();
    }

    analyserRef.current = context.createAnalyser();
    analyserRef.current.fftSize = 256;
    analyserRef.current.smoothingTimeConstant = 0.4; // Extremely snappy for the center bar calculation

    sourceRef.current = context.createMediaStreamSource(stream);
    sourceRef.current.connect(analyserRef.current);
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const updateVolume = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);

      // Average the low/mid frequencies (first 40 bins out of 128)
      let sum = 0;
      for (let i = 0; i < 40; i++) {
        sum += dataArray[i];
      }
      let avg = sum / 40;
      
      // THRESHOLD: Ignore ambient noise (e.g. computer fans, distant hum)
      const NOISE_THRESHOLD = 30; // Elegantly high, but low enough for speaking voices
      if (avg < NOISE_THRESHOLD) {
          avg = 0;
      } else {
          avg = avg - NOISE_THRESHOLD; 
      }

      // SENSITIVITY MATH: Map the remainder to the UI bounds
      let normalized = avg / (255 - NOISE_THRESHOLD);
      let curve = Math.pow(normalized, 0.6); 
      let multiplier = Math.min(curve * 3.5, 1.0); // High boost to jump quickly once past threshold
      
      let currentHeight = 6 + multiplier * 42;

      // CASCADE DELAY LOGIC: Creates the "generate from the middle" trail effect
      frameRef.current++;
      // Every 3 frames (~50ms), push the history outward left and right
      if (frameRef.current % 3 === 0) {
          historyRef.current.unshift(currentHeight);
          historyRef.current = historyRef.current.slice(0, halfCount);
      } else {
          // Keep the center bar instantly updated with the max amplitude of this micro-window
          historyRef.current[0] = Math.max(historyRef.current[0] || 6, currentHeight);
      }
      
      const leftSide = [];
      const rightSide = [];
      
      for (let i = 1; i < halfCount; i++) {
         // Apply dampening so the wave naturally shrinks as it travels outward (6px is the floor)
         let rawHist = historyRef.current[i] || 6;
         let dampedHeight = 6 + Math.max(0, (rawHist - 6) * Math.pow(0.5, i)); 
         leftSide.unshift(dampedHeight);
         rightSide.push(dampedHeight);
      }
      
      const newVolumes = [];
      if (barCount % 2 !== 0) {
          newVolumes.push(...leftSide, historyRef.current[0], ...rightSide);
      } else {
          newVolumes.push(...leftSide, historyRef.current[0], historyRef.current[0], ...rightSide);
      }

      setVolumes([...newVolumes]);
      animationFrameRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
    };
  }, [stream, isActive, barCount]);

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 h-16 w-32 flex items-center justify-center gap-[5px] z-20 pointer-events-none">
      {volumes.map((vol, i) => (
        <div 
          key={i} 
          className="w-1.5 bg-emerald-500 rounded-full transition-all duration-75 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
          style={{ height: `${Math.max(vol, 6)}px` }} 
        />
      ))}
    </div>
  );
}
