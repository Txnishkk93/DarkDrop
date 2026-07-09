import { MediaFormat } from "@/lib/api";
import { FormatRow } from "./FormatRow";

interface FormatListProps {
  url: string;
  formats: MediaFormat[];
}

export function FormatList({ url, formats }: FormatListProps) {
  if (!formats || formats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">Available Qualities</h3>
        <p className="text-sm text-muted-foreground">
          Select a quality below to download. All video formats include audio.
        </p>
      </div>
      
      <div className="flex flex-col gap-3 mt-4">
        {formats.map((format) => (
          <FormatRow key={format.format_id} url={url} format={format} />
        ))}
      </div>
    </div>
  );
}
