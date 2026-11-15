"use client";

import { useState } from "react";
import { Link2, Loader2, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { MediaCard } from "@/components/MediaCard";
import { FormatList } from "@/components/FormatList";
import {
  ApiError,
  fetchMediaInfo,
  type MediaInfo,
} from "@/lib/api";

import { toast } from "sonner";

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const handleFetchInfo = async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    setLoading(true);
    setMediaInfo(null);
    setErrorMessage(null);
    setCanRetry(false);

    try {
      const info = await fetchMediaInfo(url);
      setMediaInfo(info);
      setErrorMessage(null);
      setCanRetry(false);
      toast.success("Media info loaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch media info.";
      setErrorMessage(message);
      setCanRetry(error instanceof ApiError && error.retryable);
      toast.error(message);
    } finally {
      setLoading(false);
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
              Paste a URL to download videos
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
                    placeholder="Paste video URL here..."
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

          {errorMessage && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              {canRetry && (
                <Button variant="outline" size="sm" onClick={handleFetchInfo} disabled={loading || !url.trim()}>
                  Retry
                </Button>
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
                platform={mediaInfo.platform}
              />

              {/* Download Options */}
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm animate-fade-in">
                <CardContent className="p-6 space-y-6">
                  <FormatList url={url} formats={mediaInfo.formats || []} />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty State */}
          {!loading && !mediaInfo && (
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