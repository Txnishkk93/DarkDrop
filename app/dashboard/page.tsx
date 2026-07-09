"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, Loader2, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { MediaCard } from "@/components/MediaCard";
import { SpotifyCard } from "@/components/SpotifyCard";
import { FormatSelector } from "@/components/FormatSelector";
import { DownloadTypeSelector } from "@/components/DownloadTypeSelector";
import { ProgressBar } from "@/components/ProgressBar";
import {
  fetchMediaInfo,
  fetchSpotifyInfo,
  startDownload,
  isSpotifyUrl,
  type MediaInfo,
  type SpotifyInfo,
  type ProgressResponse,
} from "@/lib/api";

import { toast } from "sonner";

// Add this helper function to poll progress
async function getProgress(jobId: string): Promise<ProgressResponse> {
  const response = await fetch(`/api/progress/${jobId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch progress');
  }
  return response.json();
}

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [spotifyInfo, setSpotifyInfo] = useState<SpotifyInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState("");
  const [downloadType, setDownloadType] = useState<"video" | "audio">("video");
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  
  // Spotify download state
  const [spotifyJobId, setSpotifyJobId] = useState<string | null>(null);
  const [spotifyDownloading, setSpotifyDownloading] = useState(false);
  const [spotifyProgress, setSpotifyProgress] = useState<ProgressResponse | null>(null);

  // Spotify download handler
  const handleSpotifyDownload = async () => {
    if (!url.trim()) return;
    
    setSpotifyDownloading(true);
    setSpotifyProgress({ success: true, status: "pending", progress: 0 });
    
    try {
      const response = await startDownload(url, "bestaudio", "audio", "mp3");
      
      if (response.success && response.job_id) {
        setSpotifyJobId(response.job_id);
        toast.success("Spotify download started");
      } else {
        throw new Error(response.error || "Failed to start Spotify download");
      }
    } catch (error) {
      console.error("Spotify download error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start Spotify download");
      setSpotifyDownloading(false);
      setSpotifyProgress(null);
    }
  };

  // Poll Spotify download progress
  useEffect(() => {
    if (!spotifyJobId || !spotifyDownloading) return;
    
    const interval = setInterval(async () => {
      try {
        const progressData = await getProgress(spotifyJobId);
        setSpotifyProgress(progressData);
        
        if (progressData.status === "completed") {
          setSpotifyDownloading(false);
          toast.success("Spotify download complete!");
          clearInterval(interval);
        } else if (progressData.status === "error") {
          setSpotifyDownloading(false);
          toast.error(progressData.error || "Spotify download failed");
          clearInterval(interval);
        }
      } catch (error) {
        console.error("Error polling Spotify progress:", error);
        setSpotifyDownloading(false);
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [spotifyJobId, spotifyDownloading]);

  const handleSpotifyDownloadFile = () => {
    if (spotifyProgress?.file_url) {
      // Create a temporary link element to trigger download
      const link = document.createElement('a');
      link.href = spotifyProgress.file_url;
      link.download = ''; // Browser will use filename from Content-Disposition header
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleFetchInfo = async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    setLoading(true);
    setMediaInfo(null);
    setSpotifyInfo(null);
    setProgress(null);
    setJobId(null);
    setSelectedFormat("");

    try {
      if (isSpotifyUrl(url)) {
        const info = await fetchSpotifyInfo(url);
        setSpotifyInfo(info);
        toast.success("Spotify track info loaded");
      } else {
        const info = await fetchMediaInfo(url);
        setMediaInfo(info);
        
        if (info.formats?.length > 0) {
          setSelectedFormat(info.formats[0].format_id);
        }
        
        toast.success("Media info loaded");
      }
    } catch (error) {
      console.error("Error fetching info:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch media info. Make sure the URL is valid.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartDownload = async () => {
    if (!selectedFormat) {
      toast.error("Please select a format");
      return;
    }

    setDownloading(true);
    setProgress({ success: true, status: "pending", progress: 0 });

    try {
      console.log("Starting download:", { url, selectedFormat, downloadType, audioFormat });
      
      const response = await startDownload(
        url,
        selectedFormat,
        downloadType,
        downloadType === "audio" ? audioFormat : undefined,
      );

      console.log("Download response:", response);

      if (response.success && response.job_id) {
        setJobId(response.job_id);
        toast.success("Download started");
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
      console.log("Progress update:", progressData);
      
      setProgress(progressData);

      if (progressData.status === "completed") {
        setDownloading(false);
        toast.success("Download complete!");
      } else if (progressData.status === "error") {
        setDownloading(false);
        toast.error(progressData.error || "Download failed");
      }
    } catch (error) {
      console.error("Error polling progress:", error);
      // Don't stop on polling errors, let it retry
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !downloading) return;

    const interval = setInterval(pollProgress, 1000);
    return () => clearInterval(interval);
  }, [jobId, downloading, pollProgress]);

  const handleDownloadFile = () => {
    if (progress?.file_url) {
      // Create a temporary link element to trigger download
      const link = document.createElement('a');
      link.href = progress.file_url;
      link.download = ''; // Browser will use filename from Content-Disposition header
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Download started in your browser");
    }
  };

  return (
    <div className="min-h-screen bg-background noise-texture">
      <Navbar />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2 animate-fade-in">
            <h1 className="text-3xl sm:text-4xl font-bold">Media Downloader</h1>
            <p className="text-muted-foreground">
              Paste a URL to download videos or music
            </p>
          </div>

          {/* URL Input */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm animate-fade-in">
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="url"
                    placeholder="Paste video or music URL here..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="pl-12 py-6 rounded-xl bg-secondary/50 border-border/50 text-base"
                    onKeyDown={(e) => e.key === "Enter" && handleFetchInfo()}
                  />
                </div>
                <Button
                  onClick={handleFetchInfo}
                  disabled={loading || !url.trim()}
                  className="px-8 py-6 rounded-xl glow-hover"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Fetch Info"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Spotify Info */}
          {spotifyInfo && (
            <div className="space-y-4">
              <SpotifyCard
                title={spotifyInfo.title}
                artist={spotifyInfo.artist}
                album={spotifyInfo.album}
                coverImage={spotifyInfo.cover_image}
                onDownload={
                  spotifyProgress?.status === "completed" && spotifyProgress.file_url
                    ? handleSpotifyDownloadFile
                    : handleSpotifyDownload
                }
                downloading={spotifyDownloading}
                downloadReady={spotifyProgress?.status === "completed" && !!spotifyProgress.file_url}
              />
              
              {/* Spotify Progress */}
              {spotifyProgress && spotifyProgress.progress > 0 && (
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <ProgressBar
                      progress={spotifyProgress.progress}
                      status={spotifyProgress.status}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Media Info */}
          {mediaInfo && (
            <div className="space-y-6">
              <MediaCard
                title={mediaInfo.title}
                thumbnail={mediaInfo.thumbnail}
                duration={mediaInfo.duration}
                platform={mediaInfo.extractor}
              />

              {/* Download Options */}
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm animate-fade-in">
                <CardContent className="p-6 space-y-6">
                  {mediaInfo.formats && mediaInfo.formats.length > 0 && (
                    <FormatSelector
                      formats={mediaInfo.formats}
                      audioFormats={mediaInfo.audio_formats}
                      selectedFormat={selectedFormat}
                      onFormatChange={setSelectedFormat}
                      downloadType={downloadType}
                    />
                  )}

                  <DownloadTypeSelector
                    type={downloadType}
                    audioFormat={audioFormat}
                    onTypeChange={setDownloadType}
                    onAudioFormatChange={setAudioFormat}
                  />

                  {/* Progress */}
                  {progress && progress.progress > 0 && (
                    <ProgressBar
                      progress={progress.progress}
                      status={progress.status}
                    />
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {progress?.status === "completed" && progress.file_url ? (
                      <Button
                        onClick={handleDownloadFile}
                        className="w-full py-6 rounded-xl glow-hover"
                      >
                        <Download className="mr-2 h-5 w-5" />
                        Save File to Computer
                      </Button>
                    ) : (
                      <Button
                        onClick={handleStartDownload}
                        disabled={downloading || !selectedFormat}
                        className="w-full py-6 rounded-xl glow-hover"
                      >
                        {downloading ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-5 w-5" />
                            Start Download
                          </>
                        )}
                      </Button>
                    )}

                    {progress?.status === "error" && (
                      <div className="flex items-center gap-2 text-destructive text-sm justify-center">
                        <AlertCircle className="h-4 w-4" />
                        <span>{progress.error || "An error occurred"}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty State */}
          {!loading && !mediaInfo && !spotifyInfo && (
            <div className="text-center py-12 text-muted-foreground animate-fade-in">
              <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Enter a URL to get started</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}