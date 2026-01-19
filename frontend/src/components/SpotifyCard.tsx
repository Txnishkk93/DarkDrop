import { Music2, Disc3, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SpotifyCardProps {
  title: string;
  artist: string;
  album: string;
  coverImage: string;
}

export function SpotifyCard({ title, artist, album, coverImage }: SpotifyCardProps) {
  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm animate-fade-in">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row gap-4 p-4">
          <div className="relative w-full sm:w-32 h-32 flex-shrink-0 overflow-hidden rounded-xl">
            <img
              src={coverImage}
              alt={title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/placeholder.svg";
              }}
            />
          </div>
          <div className="flex flex-col justify-center gap-2 min-w-0 flex-1">
            <h3 className="text-lg font-medium leading-tight line-clamp-2 flex items-center gap-2">
              <Music2 className="h-4 w-4 flex-shrink-0" />
              {title}
            </h3>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{artist}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Disc3 className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{album}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-4">
          <Button disabled className="w-full" variant="secondary">
            Coming Soon
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
