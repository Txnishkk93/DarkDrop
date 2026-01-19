import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  progress: number;
  status: string;
}

export function ProgressBar({ progress, status }: ProgressBarProps) {
  const getStatusText = () => {
    switch (status) {
      case "pending":
        return "Preparing...";
      case "downloading":
        return "Downloading...";
      case "processing":
        return "Processing...";
      case "completed":
        return "Complete!";
      case "error":
        return "Error occurred";
      default:
        return "Processing...";
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{getStatusText()}</span>
        <span className="font-medium">{Math.round(progress)}%</span>
      </div>
      <Progress
        value={progress}
        className="h-2 bg-secondary/50"
      />
    </div>
  );
}
