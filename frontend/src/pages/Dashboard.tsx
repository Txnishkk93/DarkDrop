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
  getProgress,
  isSpotifyUrl,
  MediaInfo,
  SpotifyInfo,
  ProgressResponse,
} from "@/lib/api";
import { toast } from "sonner";

export default function Dashboard() {
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

  const handleFetchInfo = async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    setLoading(true);
    setMediaInfo(null);
    setSpotifyInfo(null);
    setProgress(null);
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
      toast.error("Failed to fetch media info. Make sure the URL is valid.");
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
    setProgress({ status: "pending", progress: 0 });

    try {
      const response = await startDownload(
        url,
        selectedFormat,
        downloadType,
        downloadType === "audio" ? audioFormat : undefined
      );

      if (response.success) {
        setJobId(response.job_id);
        toast.success("Download started");
      } else {
        throw new Error("Failed to start download");
      }
    } catch (error) {
      console.error("Error starting download:", error);
      toast.error("Failed to start download");
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
        toast.success("Download complete!");
      } else if (progressData.status === "error") {
        setDownloading(false);
        toast.error(progressData.error || "Download failed");
      }
    } catch (error) {
      console.error("Error polling progress:", error);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !downloading) return;

    const interval = setInterval(pollProgress, 1000);
    return () => clearInterval(interval);
  }, [jobId, downloading, pollProgress]);

  const handleDownloadFile = () => {
    if (progress?.file_url) {
      window.open(progress.file_url, "_blank");
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
            <SpotifyCard
              title={spotifyInfo.title}
              artist={spotifyInfo.artist}
              album={spotifyInfo.album}
              coverImage={spotifyInfo.cover_image}
            />
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
                      selectedFormat={selectedFormat}
                      onFormatChange={setSelectedFormat}
                    />
                  )}

                  <DownloadTypeSelector
                    type={downloadType}
                    audioFormat={audioFormat}
                    onTypeChange={setDownloadType}
                    onAudioFormatChange={setAudioFormat}
                  />

                  {/* Progress */}
                  {progress && (
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
                        Download File
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
