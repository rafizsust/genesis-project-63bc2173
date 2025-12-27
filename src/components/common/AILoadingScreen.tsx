import { Brain, Loader2, CheckCircle2, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface AILoadingScreenProps {
  title: string;
  description: string;
  progressSteps: string[];
  currentStepIndex: number;
  estimatedTime?: string;
  estimatedSeconds?: number; // For progress calculation
}

export function AILoadingScreen({
  title,
  description,
  progressSteps,
  currentStepIndex,
  estimatedTime = '15-30 seconds',
  estimatedSeconds,
}: AILoadingScreenProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Timer to track elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage (cap at 95% until complete)
  const progressPercent = estimatedSeconds 
    ? Math.min(95, (elapsedSeconds / estimatedSeconds) * 100)
    : null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="min-h-full flex items-center justify-center py-8 px-4">
        <div className="text-center max-w-lg space-y-8">
        {/* AI Brain Logo with Animation */}
        <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-primary/50 animate-pulse-ring" />
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-pulse-ring animation-delay-200" />
          <Brain size={64} className="text-primary relative z-10 animate-float" />
        </div>

        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground text-lg">
          {description.replace(/Our AI is/g, 'AI is').replace(/our AI is/g, 'AI is')}
        </p>

        {/* Elapsed Time Display */}
        <div className="flex items-center justify-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <Clock className="w-5 h-5 text-primary" />
            <div className="text-left">
              <div className="text-xs text-muted-foreground">Elapsed</div>
              <div className="text-lg font-mono font-bold text-primary">{formatTime(elapsedSeconds)}</div>
            </div>
          </div>
          <div className="text-muted-foreground">vs</div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 border border-border">
            <div className="text-left">
              <div className="text-xs text-muted-foreground">Estimated</div>
              <div className="text-lg font-mono font-medium text-foreground">{estimatedTime}</div>
            </div>
          </div>
        </div>

        {/* Progress Bar (if estimatedSeconds provided) */}
        {progressPercent !== null && (
          <div className="w-full max-w-xs mx-auto space-y-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {progressPercent >= 95 ? 'Almost there...' : `~${Math.round(progressPercent)}% complete`}
            </p>
          </div>
        )}

        {/* Progress Steps */}
        <div className="space-y-4 pt-2">
          {progressSteps.map((step, index) => (
            <div key={index} className="flex items-center justify-center gap-3">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-300",
                index < currentStepIndex
                  ? "bg-success text-success-foreground" // Completed
                  : index === currentStepIndex
                  ? "bg-primary text-primary-foreground" // Active
                  : "bg-muted text-muted-foreground" // Pending
              )}>
                {index < currentStepIndex ? (
                  <CheckCircle2 size={16} />
                ) : index === currentStepIndex ? (
                  <Loader2 size={16} className="animate-spin-slow" />
                ) : (
                  <Circle size={12} />
                )}
              </div>
              <span className={cn(
                "text-lg font-medium transition-colors duration-300",
                index < currentStepIndex
                  ? "text-success"
                  : index === currentStepIndex
                  ? "text-primary"
                  : "text-muted-foreground"
              )}>
                {step}
              </span>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
