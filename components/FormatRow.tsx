"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ProgressBar";
import { toast } from "sonner";
import {
  startDownload,
  downloadFileToDisk,
  type MediaFormat,
  type ProgressResponse,
  formatFileSize,
} from "@/lib/api";

async function getProgress(jobId: string): Promise<ProgressResponse> {
  const response = await fetch(`/api/media/progress/${jobId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch progress");
  }
  return response.json();
}

interface FormatRowProps {
  url: string;
  format: MediaFormat;
}

export function FormatRow({ url, format }: FormatRowProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [savingBlob, setSavingBlob] = useState(false);

  const handleStartDownload = async () => {
    setDownloading(true);
    setProgress({ success: true, status: "pending", progress: 0 });

    try {
      const response = await startDownload(url, format.format_id);

      if (response.success && response.job_id) {
        setJobId(response.job_id);
        toast.success(`Download started for ${format.quality}`);
      } else {
        throw new Error(response.error || "Failed to start download");
      }
    } catch (error) {
      console.error("Error starting download:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start download");
      setDownloading(false);
      setProgress(null);
    }
  };

  const pollProgress = useCallback(async () => {
    if (!jobId) return;

    try {
      const progressData = await getProgress(jobId);
      setProgress(progressData);

      if (progressData.status === "completed") {
        setDownloading(false);
        toast.success(`Download complete for ${format.quality}!`);
      } else if (progressData.status === "error") {
        setDownloading(false);
        toast.error(progressData.error || `Download failed for ${format.quality}`);
      }
    } catch (error) {
      console.error("Error polling progress:", error);
      // Don't stop on polling errors, let it retry
    }
  }, [jobId, format.quality]);

  useEffect(() => {
    if (!jobId || !downloading) return;
    const interval = setInterval(pollProgress, 1000);
    return () => clearInterval(interval);
  }, [jobId, downloading, pollProgress]);

  const handleDownloadFile = async () => {
    if (progress?.file_url) {
      setSavingBlob(true);
      try {
        await downloadFileToDisk(progress.file_url);
        toast.success(`File saved to your computer!`);
      } catch (err: any) {
        toast.error(err.message || "Failed to save file.");
      } finally {
        setSavingBlob(false);
      }
    }
  };

  // Auto-trigger save when completed
  useEffect(() => {
    if (progress?.status === "completed" && progress?.file_url && !savingBlob) {
      handleDownloadFile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.status, progress?.file_url]);

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-secondary/30 border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-semibold text-lg">{format.quality}</span>
          <span className="text-sm text-muted-foreground uppercase flex items-center gap-2">
            {format.ext}
            {format.filesize && format.filesize > 0 && (
              <>
                <span>•</span>
                <span>{formatFileSize(format.filesize)}</span>
              </>
            )}
          </span>
        </div>

        <div>
          {progress?.status === "completed" && progress.file_url ? (
            <Button
              onClick={handleDownloadFile}
              disabled={savingBlob}
              variant="default"
              className="glow-hover min-w-[120px]"
            >
              {savingBlob ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Save Again
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleStartDownload}
              disabled={downloading}
              variant={downloading ? "secondary" : "default"}
              className="glow-hover min-w-[120px]"
            >
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {progress && progress.progress > 0 && progress.status !== "completed" && (
        <ProgressBar progress={progress.progress} status={progress.status} />
      )}

      {progress?.status === "error" && (
        <div className="flex items-center gap-2 text-destructive text-sm mt-1">
          <AlertCircle className="h-4 w-4" />
          <span>{progress.error || "An error occurred"}</span>
        </div>
      )}
    </div>
  );
}
