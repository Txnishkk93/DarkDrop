import { Video, Music } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DownloadTypeSelectorProps {
  type: "video" | "audio";
  audioFormat: string;
  onTypeChange: (type: "video" | "audio") => void;
  onAudioFormatChange: (format: string) => void;
}

const audioFormats = ["mp3", "wav", "m4a"];

export function DownloadTypeSelector({
  type,
  audioFormat,
  onTypeChange,
  onAudioFormatChange,
}: DownloadTypeSelectorProps) {
  return (
    <div className="space-y-4">
      <label className="text-sm font-medium text-muted-foreground">
        Download Type
      </label>
      <RadioGroup
        value={type}
        onValueChange={(value) => onTypeChange(value as "video" | "audio")}
        className="flex gap-4"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="video" id="video" />
          <Label
            htmlFor="video"
            className="flex items-center gap-2 cursor-pointer"
          >
            <Video className="h-4 w-4" />
            Video
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="audio" id="audio" />
          <Label
            htmlFor="audio"
            className="flex items-center gap-2 cursor-pointer"
          >
            <Music className="h-4 w-4" />
            Audio
          </Label>
        </div>
      </RadioGroup>

      {type === "audio" && (
        <div className="space-y-2 animate-fade-in">
          <label className="text-sm font-medium text-muted-foreground">
            Audio Format
          </label>
          <Select value={audioFormat} onValueChange={onAudioFormatChange}>
            <SelectTrigger className="w-full rounded-xl bg-secondary/50 border-border/50">
              <SelectValue placeholder="Select audio format" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border/50">
              {audioFormats.map((format) => (
                <SelectItem key={format} value={format} className="cursor-pointer">
                  <span className="uppercase font-medium">{format}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
