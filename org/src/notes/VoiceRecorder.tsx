/**
 * VoiceRecorder — capture audio via MediaRecorder, produce a File for the blob pipeline.
 *
 * Records as audio/webm;codecs=opus (Chrome/Firefox) or audio/mp4 (Safari).
 * Outputs a File object that feeds directly into NoteForm's pendingFiles.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { formatFileSize } from "../blobs";

/** Preferred MIME for recording — webm/opus everywhere it's supported, mp4 fallback */
function preferredMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) return "audio/ogg;codecs=opus";
  return "";
}

function mimeToExt(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "audio";
}

interface Props {
  onRecorded: (file: File) => void;
}

export function VoiceRecorder({ onRecorded }: Props) {
  const [supported] = useState(() => typeof MediaRecorder !== "undefined" && !!preferredMime());
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = preferredMime();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || preferredMime();
        const blob = new Blob(chunksRef.current, { type: mime });
        const ext = mimeToExt(mime);
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const file = new File([blob], `voice-${ts}.${ext}`, { type: mime });

        // Show preview before confirming
        setPreviewFile(file);
        setPreviewUrl(URL.createObjectURL(blob));

        // Stop mic
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(250); // collect in 250ms chunks for smoother stop
      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecording(true);

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch (err) {
      console.warn("Mic access denied:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
  }, []);

  const confirmRecording = useCallback(() => {
    if (previewFile) {
      onRecorded(previewFile);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewFile(null);
      setPreviewUrl(null);
      setElapsed(0);
    }
  }, [previewFile, previewUrl, onRecorded]);

  const discardRecording = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
    setElapsed(0);
  }, [previewUrl]);

  if (!supported) return null;

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="voice-recorder">
      {!recording && !previewUrl && (
        <button type="button" className="voice-rec-btn" onClick={startRecording} title="Record voice note">
          <span className="voice-rec-mic" />
        </button>
      )}

      {recording && (
        <div className="voice-rec-active">
          <span className="voice-rec-pulse" />
          <span className="voice-rec-time">{fmtTime(elapsed)}</span>
          <button type="button" className="voice-rec-stop" onClick={stopRecording} title="Stop recording">
            <span className="voice-rec-stop-icon" />
          </button>
        </div>
      )}

      {previewUrl && previewFile && (
        <div className="voice-rec-preview">
          <audio src={previewUrl} controls className="voice-rec-audio" />
          <span className="voice-rec-size">{formatFileSize(previewFile.size)}</span>
          <button type="button" className="btn-primary btn-sm" onClick={confirmRecording}>Attach</button>
          <button type="button" className="voice-rec-discard" onClick={discardRecording}>&times;</button>
        </div>
      )}
    </div>
  );
}
