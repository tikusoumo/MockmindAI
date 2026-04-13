"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useMediaDevices() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>("");
  const [activeMicId, setActiveMicId] = useState<string>("");
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);

  // We need to keep a ref to the current stream so we can shut it down 
  // explicitly if we switch devices.
  const streamRef = useRef<MediaStream | null>(null);

  const getDevices = useCallback(async () => {
    try {
      // Must request permissions first to get non-redacted device labels
      const permissionProbeStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      const devices = await navigator.mediaDevices.enumerateDevices();
      // Release probe tracks immediately; this stream is only for permission + labels.
      permissionProbeStream.getTracks().forEach((track) => track.stop());
      const videoDevices = devices.filter((device) => device.kind === "videoinput");
      const audioDevices = devices.filter((device) => device.kind === "audioinput");
      setCameras(videoDevices);
      setMicrophones(audioDevices);

      if (videoDevices.length > 0 && !activeCameraId) setActiveCameraId(videoDevices[0].deviceId);
      if (audioDevices.length > 0 && !activeMicId) setActiveMicId(audioDevices[0].deviceId);
    } catch (e) {
      console.error("Error accessing media devices. Prompting for permissions failed.", e);
    }
  }, [activeCameraId, activeMicId]);

  useEffect(() => {
    getDevices();
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", getDevices);
  }, [getDevices]);

  useEffect(() => {
    let active = true;

    async function setupStream() {
      // Recreate stream only when the selected input device changes.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: activeCameraId ? { deviceId: { exact: activeCameraId } } : true,
          audio: activeMicId ? { deviceId: { exact: activeMicId } } : true,
        });

        if (active) {
          setStream(newStream);
          streamRef.current = newStream;
        } else {
          newStream.getTracks().forEach((track) => track.stop());
        }
      } catch (err) {
        console.error("Failed to get local stream", err);
        if (active) {
          setStream(null);
          streamRef.current = null;
        }
      }
    }

    if (activeCameraId || activeMicId) {
      setupStream();
    }

    return () => {
      active = false;
    };
  }, [activeCameraId, activeMicId]);

  useEffect(() => {
    const currentStream = streamRef.current;
    if (!currentStream) {
      return;
    }

    currentStream.getVideoTracks().forEach((track) => {
      track.enabled = isCameraEnabled;
    });
    currentStream.getAudioTracks().forEach((track) => {
      track.enabled = isMicEnabled;
    });
  }, [isCameraEnabled, isMicEnabled, stream]);

  // Clean up completely on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
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
  };
}
