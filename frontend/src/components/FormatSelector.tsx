import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaFormat, formatFileSize } from "@/lib/api";

interface FormatSelectorProps {
  formats: MediaFormat[];
  audioFormats?: MediaFormat[];
  selectedFormat: string;
  onFormatChange: (formatId: string) => void;
  downloadType: "video" | "audio";
}

export function FormatSelector({
  formats,
  audioFormats,
  selectedFormat,
  onFormatChange,
  downloadType,
}: FormatSelectorProps) {
  // Use audio formats if downloadType is audio, otherwise use video formats
  const displayFormats = downloadType === "audio" && audioFormats?.length 
    ? audioFormats 
    : formats;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        Select Quality
      </label>
      <Select value={selectedFormat} onValueChange={onFormatChange}>
        <SelectTrigger className="w-full rounded-xl bg-secondary/50 border-border/50">
          <SelectValue placeholder="Choose quality" />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border/50">
          {displayFormats.map((format) => (
            <SelectItem
              key={format.format_id}
              value={format.format_id}
              className="cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">
                  {format.quality}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="uppercase text-muted-foreground text-xs">
                  {format.ext}
                </span>
                {format.filesize && format.filesize > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground text-xs">
                      {formatFileSize(format.filesize)}
                    </span>
                  </>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {downloadType === "video" && (
        <p className="text-xs text-muted-foreground">
          All video formats include audio
        </p>
      )}
    </div>
  );
}