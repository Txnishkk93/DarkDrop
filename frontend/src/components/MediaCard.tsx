import { Clock, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDuration } from "@/lib/api";

interface MediaCardProps {
  title: string;
  thumbnail: string;
  duration: number;
  platform: string;
}

export function MediaCard({ title, thumbnail, duration, platform }: MediaCardProps) {
  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm animate-fade-in">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row gap-4 p-4">
          <div className="relative w-full sm:w-48 h-32 sm:h-28 flex-shrink-0 overflow-hidden rounded-xl">
            <img
              src={thumbnail}
              alt={title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/placeholder.svg";
              }}
            />
          </div>
          <div className="flex flex-col justify-center gap-2 min-w-0">
            <h3 className="text-lg font-medium leading-tight line-clamp-2">
              {title}
            </h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Globe className="h-4 w-4" />
                <span className="capitalize">{platform}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>{formatDuration(duration)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
