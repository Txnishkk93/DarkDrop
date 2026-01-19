import { Link } from "react-router-dom";
import { ArrowRight, Download, Youtube, Instagram, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";

const platforms = [
  { name: "YouTube", icon: Youtube },
  { name: "Instagram", icon: Instagram },
  { name: "TikTok", icon: Music2 },
  { name: "X (Twitter)", icon: Download },
  { name: "Spotify", icon: Music2 },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background noise-texture">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center grid-pattern overflow-hidden">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background pointer-events-none" />
        
        <div className="container relative z-10 px-4 sm:px-6 lg:px-8 py-32">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3 mb-6 animate-fade-in">
              <div className="p-3 rounded-2xl bg-primary/10 backdrop-blur-sm border border-border/50">
                <Download className="h-10 w-10" />
              </div>
            </div>
            
            {/* Title */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight animate-fade-in">
              DarkDrop
            </h1>
            
            {/* Subtitle */}
            <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-in">
              Download videos & music from YouTube, Instagram, X, TikTok, Spotify
            </p>

            {/* Platform icons */}
            <div className="flex items-center justify-center gap-4 flex-wrap animate-fade-in">
              {platforms.map((platform) => (
                <div
                  key={platform.name}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50 text-sm text-muted-foreground"
                >
                  <platform.icon className="h-4 w-4" />
                  <span>{platform.name}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <div className="pt-6 animate-fade-in">
              <Link to="/dashboard">
                <Button
                  size="lg"
                  className="group px-8 py-6 text-lg rounded-2xl glow-hover"
                >
                  Go to Downloader
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>

            {/* Features */}
            <div className="pt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center animate-fade-in">
              <div className="p-6 rounded-2xl bg-card/30 border border-border/50 backdrop-blur-sm">
                <h3 className="font-semibold mb-2">Fast Downloads</h3>
                <p className="text-sm text-muted-foreground">
                  High-speed downloads with multiple format options
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-card/30 border border-border/50 backdrop-blur-sm">
                <h3 className="font-semibold mb-2">Multiple Platforms</h3>
                <p className="text-sm text-muted-foreground">
                  Support for all major social media platforms
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-card/30 border border-border/50 backdrop-blur-sm">
                <h3 className="font-semibold mb-2">Video & Audio</h3>
                <p className="text-sm text-muted-foreground">
                  Download as video or extract audio only
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
