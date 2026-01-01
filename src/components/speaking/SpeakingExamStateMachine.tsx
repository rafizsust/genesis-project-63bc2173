import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { SafeAudioPlayer } from "@/components/common/SafeAudioPlayer";
import { toast } from "sonner";
import { 
  Play,
  Mic, 
  MicOff, 
  Clock, 
  ChevronRight, 
  Volume2,
  Loader2,
  CheckCircle,
} from "lucide-react";

export type SpeakingExamState = 
  | "idle"
  | "listening"      // Playing audio question
  | "thinking"       // Preparation time (Part 2 only)
  | "recording"      // User is speaking
  | "saving"         // Uploading audio
  | "next"           // Transitioning to next question
  | "completed";

interface SpeakingQuestion {
  id: string;
  text: string;
  audioUrl?: string;
  partNumber: number;
  isRequired?: boolean;
}

interface SpeakingExamStateMachineProps {
  questions: SpeakingQuestion[];
  partNumber: 1 | 2 | 3;
  onQuestionComplete: (questionId: string, audioBlob: Blob) => Promise<void>;
  onPartComplete: () => void;
  preparationTimeSeconds?: number; // For Part 2
  speakingTimeSeconds?: number;    // For Part 2
  accentHint?: string;
}

export function SpeakingExamStateMachine({
  questions,
  partNumber,
  onQuestionComplete,
  onPartComplete,
  preparationTimeSeconds = 60,
  speakingTimeSeconds = 120,
  accentHint,
}: SpeakingExamStateMachineProps) {
  const [state, setState] = useState<SpeakingExamState>("idle");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const countdownIntervalRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Handle state transitions
  const startListening = useCallback(() => {
    setState("listening");
  }, []);

  const onAudioEnded = useCallback(() => {
    if (partNumber === 2 && state === "listening") {
      // Start thinking/preparation time for Part 2
      setState("thinking");
      setCountdown(preparationTimeSeconds);
      
      countdownIntervalRef.current = window.setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            startRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Start recording immediately for Part 1 & 3
      startRecording();
    }
  }, [partNumber, state, preparationTimeSeconds]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setState("recording");
      setRecordingTime(0);

      // Start recording timer
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          // Auto-stop for Part 2 after speaking time
          if (partNumber === 2 && prev >= speakingTimeSeconds - 1) {
            stopRecording();
            return speakingTimeSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast.error("Microphone access denied. Please allow microphone access.");
      setState("idle");
    }
  };

  const stopRecording = useCallback(async () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setState("saving");

    // Wait a bit for final data chunks
    await new Promise((resolve) => setTimeout(resolve, 500));

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    
    try {
      await onQuestionComplete(currentQuestion.id, audioBlob);
      
      if (isLastQuestion) {
        setState("completed");
        onPartComplete();
      } else {
        setState("next");
        // Auto-advance after short delay
        setTimeout(() => {
          setCurrentQuestionIndex((prev) => prev + 1);
          setState("idle");
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to save recording:", error);
      toast.error("Failed to save recording. Please try again.");
      setState("recording");
    }
  }, [currentQuestion, isLastQuestion, onQuestionComplete, onPartComplete]);

  const skipThinking = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    startRecording();
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStateIcon = () => {
    switch (state) {
      case "listening":
        return <Volume2 className="h-6 w-6 animate-pulse text-blue-500" />;
      case "thinking":
        return <Clock className="h-6 w-6 text-amber-500" />;
      case "recording":
        return <Mic className="h-6 w-6 animate-pulse text-red-500" />;
      case "saving":
        return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
      case "completed":
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      default:
        return <Play className="h-6 w-6" />;
    }
  };

  const getStateLabel = () => {
    switch (state) {
      case "idle":
        return "Ready to Start";
      case "listening":
        return "Listen to the Question";
      case "thinking":
        return "Preparation Time";
      case "recording":
        return "Recording Your Answer";
      case "saving":
        return "Saving...";
      case "next":
        return "Next Question";
      case "completed":
        return "Part Complete!";
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {getStateIcon()}
            <span>{getStateLabel()}</span>
          </CardTitle>
          <Badge variant="outline">
            Part {partNumber} • Question {currentQuestionIndex + 1}/{questions.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress */}
        <Progress 
          value={(currentQuestionIndex / questions.length) * 100} 
          className="h-2"
        />

        {/* Question Display */}
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-lg font-medium">{currentQuestion?.text}</p>
        </div>

        {/* Audio Player (for listening state) */}
        {(state === "idle" || state === "listening") && currentQuestion && (
          <SafeAudioPlayer
            audioUrl={currentQuestion.audioUrl}
            fallbackText={currentQuestion.text}
            accentHint={accentHint}
            autoPlay={state === "listening"}
            onEnded={onAudioEnded}
            showControls={state === "listening"}
          />
        )}

        {/* Thinking Timer (Part 2) */}
        {state === "thinking" && (
          <div className="text-center space-y-4">
            <div className="text-6xl font-mono font-bold text-amber-500">
              {formatTime(countdown)}
            </div>
            <p className="text-muted-foreground">
              Prepare your answer. Recording will start automatically.
            </p>
            <Button variant="outline" onClick={skipThinking}>
              Skip Preparation
            </Button>
          </div>
        )}

        {/* Recording UI */}
        {state === "recording" && (
          <div className="text-center space-y-4">
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
              <div className="relative w-24 h-24 bg-red-500 rounded-full flex items-center justify-center">
                <Mic className="h-10 w-10 text-white" />
              </div>
            </div>
            <div className="text-3xl font-mono font-bold">
              {formatTime(recordingTime)}
              {partNumber === 2 && (
                <span className="text-sm text-muted-foreground ml-2">
                  / {formatTime(speakingTimeSeconds)}
                </span>
              )}
            </div>
            <Button 
              onClick={stopRecording}
              variant="destructive"
              size="lg"
            >
              <MicOff className="h-5 w-5 mr-2" />
              Stop Recording
            </Button>
          </div>
        )}

        {/* Saving State */}
        {state === "saving" && (
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <p className="text-muted-foreground">Saving your answer...</p>
          </div>
        )}

        {/* Completed State */}
        {state === "completed" && (
          <div className="text-center space-y-4">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
            <p className="text-lg font-medium">Part {partNumber} Complete!</p>
          </div>
        )}

        {/* Start Button (idle state) */}
        {state === "idle" && (
          <Button 
            onClick={startListening} 
            size="lg" 
            className="w-full"
          >
            <Play className="h-5 w-5 mr-2" />
            Start Question
          </Button>
        )}

        {/* Next Question Transition */}
        {state === "next" && (
          <div className="text-center space-y-4">
            <ChevronRight className="h-12 w-12 mx-auto text-primary animate-bounce" />
            <p className="text-muted-foreground">Moving to next question...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SpeakingExamStateMachine;
