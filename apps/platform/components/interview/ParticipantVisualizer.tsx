"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ParticipantVisualizerProps {
  /** If provided, uses real audio analysis. Otherwise simulates. */
  stream?: MediaStream | null;
  /** Whether the person is actively speaking / mic active */
  isActive: boolean;
  /** Number of bars to render (must be odd for center symmetry) */
  barCount?: number;
  /** Color variant */
  variant?: "indigo" | "emerald";
  /** Alignment of bars */
  align?: "center" | "left";
}

const BAR_FLOOR = 4;
const BAR_MAX = 24;

export function ParticipantVisualizer({
  stream,
  isActive,
  barCount = 7,
  variant = "emerald",
  align = "center",
}: ParticipantVisualizerProps) {
  const [volumes, setVolumes] = useState<number[]>(Array(barCount).fill(BAR_FLOOR));

  const halfCount = Math.ceil(barCount / 2);
  const historyRef = useRef<number[]>(Array(halfCount).fill(BAR_FLOOR));
  const frameRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Real audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Simulation state
  const simPhaseRef = useRef<number>(0);
  const simTargetRef = useRef<number>(BAR_FLOOR);
  const simCurrentRef = useRef<number>(BAR_FLOOR);

  useEffect(() => {
    if (!isActive) {
      setVolumes(Array(barCount).fill(BAR_FLOOR));
      historyRef.current = Array(halfCount).fill(BAR_FLOOR);
      simCurrentRef.current = BAR_FLOOR;
      simTargetRef.current = BAR_FLOOR;
      return;
    }

    const hasRealStream = stream && stream.getAudioTracks().length > 0;

    // Setup real audio analysis if stream provided
    if (hasRealStream) {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") ctx.resume();

      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.4;

      sourceRef.current = ctx.createMediaStreamSource(stream!);
      sourceRef.current.connect(analyserRef.current);
    }

    const dataArray = analyserRef.current
      ? new Uint8Array(analyserRef.current.frequencyBinCount)
      : null;

    const tick = () => {
      let currentHeight: number;

      if (analyserRef.current && dataArray) {
        // ─── Real Audio Path ───
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < 40; i++) sum += dataArray[i];
        let avg = sum / 40;

        const NOISE_THRESHOLD = 30;
        avg = avg < NOISE_THRESHOLD ? 0 : avg - NOISE_THRESHOLD;

        const normalized = avg / (255 - NOISE_THRESHOLD);
        const curve = Math.pow(normalized, 0.6);
        const multiplier = Math.min(curve * 3.5, 1.0);
        currentHeight = BAR_FLOOR + multiplier * (BAR_MAX - BAR_FLOOR);
      } else {
        // ─── Simulated Speech Path ───
        // Natural speech: alternate between bursts and pauses
        simPhaseRef.current++;

        // Every ~12 frames (~200ms), pick a new target height
        if (simPhaseRef.current % 12 === 0) {
          // 30% chance of a pause, 70% chance of a speech burst
          const isPause = Math.random() < 0.3;
          simTargetRef.current = isPause
            ? BAR_FLOOR + Math.random() * 3
            : BAR_FLOOR + 6 + Math.random() * (BAR_MAX - BAR_FLOOR - 6);
        }

        // Smooth interpolation toward target (easing)
        simCurrentRef.current += (simTargetRef.current - simCurrentRef.current) * 0.18;
        currentHeight = simCurrentRef.current;
      }

      // ─── Center-Outward Cascade ───
      frameRef.current++;
      if (frameRef.current % 3 === 0) {
        historyRef.current.unshift(currentHeight);
        historyRef.current = historyRef.current.slice(0, halfCount);
      } else {
        historyRef.current[0] = Math.max(historyRef.current[0] || BAR_FLOOR, currentHeight);
      }

      const leftSide: number[] = [];
      const rightSide: number[] = [];

      for (let i = 1; i < halfCount; i++) {
        const raw = historyRef.current[i] || BAR_FLOOR;
        const damped = BAR_FLOOR + Math.max(0, (raw - BAR_FLOOR) * Math.pow(0.55, i));
        leftSide.unshift(damped);
        rightSide.push(damped);
      }

      const result =
        barCount % 2 !== 0
          ? [...leftSide, historyRef.current[0], ...rightSide]
          : [...leftSide, historyRef.current[0], historyRef.current[0], ...rightSide];

      setVolumes([...result]);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
    };
  }, [stream, isActive, barCount, halfCount]);

  const barColor =
    variant === "indigo"
      ? "bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.5)]"
      : "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]";

  const barIdle = "bg-zinc-700";

  return (
    <div className={cn("h-6 w-24 flex items-end gap-[3px]", align === "left" ? "justify-start" : "justify-center")}>
      {volumes.map((vol, i) => (
        <div
          key={i}
          className={cn(
            "w-1 rounded-full transition-[background-color] duration-150",
            isActive ? barColor : barIdle
          )}
          style={{ height: `${Math.max(vol, BAR_FLOOR)}px` }}
        />
      ))}
    </div>
  );
}

