import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, Loader2, XCircle, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface WebAudioScheduledPlayerProps {
  audioUrls: {
    part1?: string | null;
    part2?: string | null;
    part3?: string | null;
    part4?: string | null;
  };
  initialStartTime?: number; // Start timestamp in seconds (for filtered practice)
  initialPart?: number; // Which part to start from (1-4)
  onPartChange?: (partNumber: number) => void;
  onTestComplete?: () => void;
  onReviewStart?: () => void;
}

// Official IELTS timing (in seconds)
const PAUSE_BETWEEN_PARTS = 30;
const PAUSE_AFTER_PART_4 = 30;
const FINAL_REVIEW_TIME = 120;

type PlayerPhase =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'part_pause'
  | 'part4_pause'
  | 'final_review'
  | 'completed';

const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type ParsedStorageRef = { bucket: string; path: string };

function parseSupabaseStorageObjectUrl(url: string): ParsedStorageRef | null {
  try {
    const u = new URL(url);
    const markerPublic = '/storage/v1/object/public/';
    const markerSign = '/storage/v1/object/sign/';
    const marker = u.pathname.includes(markerPublic) ? markerPublic : u.pathname.includes(markerSign) ? markerSign : null;
    if (!marker) return null;

    const after = u.pathname.split(marker)[1];
    if (!after) return null;

    const [bucket, ...pathParts] = after.split('/').filter(Boolean);
    const path = pathParts.join('/');
    if (!bucket || !path) return null;

    return { bucket, path: decodeURIComponent(path) };
  } catch {
    return null;
  }
}

async function getSignedUrl(url: string): Promise<string> {
  // If it's an external URL (R2, CDN, or any non-Supabase URL), use it directly
  // This supports Cloudflare R2 and other external audio sources
  if (!url.includes('/storage/v1/')) {
    return url;
  }

  // If it's already a public Supabase URL, use it directly
  if (url.includes('/storage/v1/object/public/')) {
    return url;
  }

  // For Supabase private storage URLs, generate a signed URL
  const storageRef = parseSupabaseStorageObjectUrl(url);
  if (!storageRef) {
    // Fallback: if we can't parse but it looks like Supabase, return as-is
    return url;
  }

  // Generate a signed URL for private buckets
  const { data, error } = await supabase.storage
    .from(storageRef.bucket)
    .createSignedUrl(storageRef.path, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to get signed URL: ${error?.message || 'Unknown error'}`);
  }

  return data.signedUrl;
}

export function WebAudioScheduledPlayer({
  audioUrls,
  initialStartTime = 0,
  initialPart,
  onPartChange,
  onTestComplete,
  onReviewStart,
}: WebAudioScheduledPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [phase, setPhase] = useState<PlayerPhase>('loading');
  const [currentPart, setCurrentPart] = useState(initialPart || 1);
  const [currentTime, setCurrentTime] = useState(initialStartTime);
  const [hasAppliedInitialSeek, setHasAppliedInitialSeek] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pauseCountdown, setPauseCountdown] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [completedParts, setCompletedParts] = useState<Set<number>>(new Set());
  const [signedUrls, setSignedUrls] = useState<Record<number, string>>({});
  
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownEndRef = useRef(0);

  // Build list of parts we have URLs for - memoized to prevent re-renders
  const availableParts = useMemo(() => [
    audioUrls.part1 ? 1 : null,
    audioUrls.part2 ? 2 : null,
    audioUrls.part3 ? 3 : null,
    audioUrls.part4 ? 4 : null,
  ].filter(Boolean) as number[], [audioUrls.part1, audioUrls.part2, audioUrls.part3, audioUrls.part4]);

  // Use refs to store current values for event handlers
  const currentPartRef = useRef(currentPart);
  const availablePartsRef = useRef(availableParts);
  const phaseRef = useRef(phase);
  
  useEffect(() => {
    currentPartRef.current = currentPart;
  }, [currentPart]);
  
  useEffect(() => {
    availablePartsRef.current = availableParts;
  }, [availableParts]);
  
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Countdown helper
  const startCountdown = useCallback((seconds: number, onComplete: () => void) => {
    setPauseCountdown(seconds);
    countdownEndRef.current = Date.now() + seconds * 1000;

    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((countdownEndRef.current - Date.now()) / 1000));
      setPauseCountdown(remaining);
      if (remaining === 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        onComplete();
      }
    };
    tick();
    countdownIntervalRef.current = setInterval(tick, 250);
  }, []);

  // Handle end of a part (natural or skip)
  const handlePartEnd = useCallback(() => {
    const part = currentPartRef.current;
    const parts = availablePartsRef.current;
    
    console.log('handlePartEnd called, currentPart:', part, 'availableParts:', parts);
    
    setCompletedParts((prev) => new Set([...prev, part]));

    const currentIdx = parts.indexOf(part);
    
    if (currentIdx < parts.length - 1) {
      // There's a next part - show 30s pause
      console.log('Starting 30s pause before next part');
      setPhase('part_pause');
      startCountdown(PAUSE_BETWEEN_PARTS, () => {
        const nextPart = parts[currentIdx + 1];
        console.log('Countdown finished, playing next part:', nextPart);
        setCurrentPart(nextPart);
        setCurrentTime(0);
        onPartChange?.(nextPart);
        
        // Auto-play next part after audio loads
        setPhase('playing');
      });
    } else {
      // Last part ended - show 30s pause then final review
      console.log('Last part ended, starting part4_pause');
      setPhase('part4_pause');
      startCountdown(PAUSE_AFTER_PART_4, () => {
        setPhase('final_review');
        onReviewStart?.();
        startCountdown(FINAL_REVIEW_TIME, () => {
          setPhase('completed');
          onTestComplete?.();
        });
      });
    }
  }, [onPartChange, onReviewStart, onTestComplete, startCountdown]);

  // Store handlePartEnd in a ref so event listeners always have the latest version
  const handlePartEndRef = useRef(handlePartEnd);
  useEffect(() => {
    handlePartEndRef.current = handlePartEnd;
  }, [handlePartEnd]);

  // Generate signed URLs for all parts on mount
  useEffect(() => {
    const generateSignedUrls = async () => {
      try {
        const urls: Record<number, string> = {};
        const urlMap: Record<number, string> = {};
        if (audioUrls.part1) urlMap[1] = audioUrls.part1;
        if (audioUrls.part2) urlMap[2] = audioUrls.part2;
        if (audioUrls.part3) urlMap[3] = audioUrls.part3;
        if (audioUrls.part4) urlMap[4] = audioUrls.part4;

        const partsToLoad = [1, 2, 3, 4].filter(p => urlMap[p]) as number[];
        
        for (const partNum of partsToLoad) {
          const url = urlMap[partNum];
          if (url) {
            console.log(`Getting URL for part ${partNum}:`, url);
            urls[partNum] = await getSignedUrl(url);
            console.log(`Got URL for part ${partNum}:`, urls[partNum]);
          }
        }
        
        setSignedUrls(urls);
        // Use initialPart if provided, otherwise use first available part
        if (initialPart && partsToLoad.includes(initialPart)) {
          setCurrentPart(initialPart);
        } else if (partsToLoad.length > 0) {
          setCurrentPart(partsToLoad[0]);
        }
        setPhase('ready');
      } catch (err: unknown) {
        console.error('Error generating signed URLs:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load audio';
        setError(errorMessage);
        setPhase('ready');
      }
    };

    if (availableParts.length > 0) {
      generateSignedUrls();
    } else {
      setPhase('ready');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrls.part1, audioUrls.part2, audioUrls.part3, audioUrls.part4]);

  // Load audio for current part when it changes
  useEffect(() => {
    const audio = audioRef.current;
    const url = signedUrls[currentPart];
    
    if (audio && url) {
      console.log('Loading audio for part', currentPart, ':', url);
      audio.src = url;
      audio.load();
    }
  }, [currentPart, signedUrls]);

  // Auto-play when phase becomes 'playing' (handles both initial start and part transitions)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (phase === 'playing') {
      const url = signedUrls[currentPart];
      if (!url) return;
      
      const startPlayback = () => {
        // Apply initial seek time if not yet applied and this is the initial part
        if (!hasAppliedInitialSeek && initialStartTime > 0 && currentPart === (initialPart || 1)) {
          console.log('Seeking to initial start time:', initialStartTime);
          audio.currentTime = initialStartTime;
          setHasAppliedInitialSeek(true);
        }
        audio.play().catch(e => console.error('Play failed:', e));
      };
      
      // Check if audio is ready to play
      if (audio.readyState >= 3) { // HAVE_FUTURE_DATA or better
        console.log('Audio ready, starting playback immediately');
        startPlayback();
      } else {
        // Wait for audio to be ready
        const handleCanPlay = () => {
          console.log('Audio can play, starting playback');
          startPlayback();
          audio.removeEventListener('canplaythrough', handleCanPlay);
        };
        audio.addEventListener('canplaythrough', handleCanPlay);
        
        return () => {
          audio.removeEventListener('canplaythrough', handleCanPlay);
        };
      }
    }
  }, [phase, currentPart, signedUrls, hasAppliedInitialSeek, initialStartTime, initialPart]);

  // Set up audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      console.log('Audio loaded, duration:', audio.duration);
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      console.log('Audio ended event fired');
      handlePartEndRef.current();
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', e, audio.error);
      setError('Failed to play audio. Please try again.');
    };

    const handlePlay = () => {
      console.log('Audio play event fired');
    };

    const handlePause = () => {
      console.log('Audio pause event fired');
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  // Apply volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Apply playback rate changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Skip countdown and start next part immediately
  const skipToNextPart = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setPauseCountdown(0);

    const parts = availablePartsRef.current;
    const part = currentPartRef.current;
    const currentIdx = parts.indexOf(part);
    
    if (phase === 'part_pause' && currentIdx < parts.length - 1) {
      const nextPart = parts[currentIdx + 1];
      setCurrentPart(nextPart);
      setCurrentTime(0);
      onPartChange?.(nextPart);
      setPhase('playing');
    } else if (phase === 'part4_pause') {
      setPhase('final_review');
      onReviewStart?.();
      startCountdown(FINAL_REVIEW_TIME, () => {
        setPhase('completed');
        onTestComplete?.();
      });
    } else if (phase === 'final_review') {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setPhase('completed');
      onTestComplete?.();
    }
  }, [phase, onPartChange, onReviewStart, onTestComplete, startCountdown]);

  // Skip current part audio and move to next part pause
  const finishCurrentPart = useCallback(() => {
    if (phase !== 'playing' && phase !== 'paused') return;
    
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    handlePartEndRef.current();
  }, [phase]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    console.log('togglePlayPause called, phase:', phase, 'audio src:', audio.src);

    if (phase === 'ready') {
      setPhase('playing');
      audio.play()
        .then(() => console.log('Play started successfully'))
        .catch(e => console.error('Play failed:', e));
      return;
    }

    if (phase === 'playing') {
      audio.pause();
      setPhase('paused');
    } else if (phase === 'paused') {
      audio.play()
        .then(() => console.log('Resume started successfully'))
        .catch(e => console.error('Resume failed:', e));
      setPhase('playing');
    }
  }, [phase]);

  // Seek
  const handleSeek = useCallback((value: number[]) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  }, []);

  // Volume
  const handleVolumeChange = useCallback((value: number[]) => {
    const v = value[0] / 100;
    setVolume(v);
    if (v === 0) setIsMuted(true);
    else if (isMuted) setIsMuted(false);
  }, [isMuted]);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  // Playback rate
  const handlePlaybackRateChange = useCallback((value: string) => {
    const rate = parseFloat(value);
    setPlaybackRate(rate);
  }, []);

  // Format time helper
  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Phase display
  const getPhaseDisplay = () => {
    switch (phase) {
      case 'loading':
        return 'Loading audio...';
      case 'ready':
        return 'Ready to start';
      case 'paused':
        return `Part ${currentPart} - Paused`;
      case 'part_pause':
        return `Check answers for Part ${currentPart}`;
      case 'part4_pause':
        return 'Check answers for Part 4';
      case 'final_review':
        return 'Final review - Check all answers';
      case 'completed':
        return 'Test completed';
      default:
        return `Part ${currentPart}`;
    }
  };

  const isPausePhase = phase === 'part_pause' || phase === 'part4_pause' || phase === 'final_review';
  const isCompleted = phase === 'completed';
  const isPlayingOrPaused = phase === 'playing' || phase === 'paused';

  if (availableParts.length === 0) {
    return (
      <div className="flex items-center justify-center p-2 text-muted-foreground rounded-md">
        <span className="text-sm">No audio available</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-2 bg-destructive/10 text-destructive rounded-md">
        <XCircle size={16} className="mr-1" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Audio element */}
      <audio ref={audioRef} preload="auto" />

      {/* Countdown during pause phases */}
      {isPausePhase && (
        <div className="flex items-center justify-center py-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatTime(pauseCountdown)}
            </div>
            <div className="text-xs text-muted-foreground">
              {phase === 'final_review' ? 'Time remaining to check all answers' : 'Time to check your answers'}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={skipToNextPart}
            className="flex items-center gap-1"
          >
            <SkipForward size={16} />
            {phase === 'part_pause' ? 'Start Next Part' : phase === 'final_review' ? 'Finish Test' : 'Continue'}
          </Button>
        </div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <div className="flex items-center justify-center py-2">
          <div className="text-center">
            <div className="text-lg font-semibold text-green-600 dark:text-green-400">
              Listening test completed
            </div>
            <div className="text-xs text-muted-foreground">Please submit your answers</div>
          </div>
        </div>
      )}

      {/* Main Controls */}
      {(phase === 'ready' || isPlayingOrPaused || phase === 'loading') && (
        <div className="flex items-center gap-2">
          {phase === 'loading' ? (
            <div className="flex items-center justify-center w-full min-h-[32px]">
              <Loader2 size={18} className="animate-spin text-primary" />
              <span className="ml-1 text-xs text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <>
              {/* Play/Pause Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlayPause}
                className="flex-shrink-0 h-8 w-8"
              >
                {phase === 'playing' ? <Pause size={20} /> : <Play size={20} />}
              </Button>

              {/* Skip to next part button (only during playing, not on last part) */}
              {isPlayingOrPaused && availableParts.indexOf(currentPart) < availableParts.length - 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={finishCurrentPart}
                  className="flex-shrink-0 h-8 w-8"
                  title="Skip to next part"
                >
                  <SkipForward size={18} />
                </Button>
              )}

              {/* Progress Bar */}
              <div className="flex-1 flex items-center gap-1 min-w-0">
                <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0">
                  {formatTime(currentTime)}
                </span>
                <Slider
                  value={[currentTime]}
                  max={duration || 1}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="flex-1 min-w-[60px]"
                />
                <span className="text-xs text-muted-foreground w-10 text-left flex-shrink-0">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Volume Control */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" onClick={toggleMute} className="h-7 w-7">
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  className="w-14"
                />
              </div>

              {/* Playback Speed */}
              <Select value={playbackRate.toString()} onValueChange={handlePlaybackRateChange}>
                <SelectTrigger className="w-[70px] h-7 text-xs">
                  <SelectValue placeholder="Speed" />
                </SelectTrigger>
                <SelectContent>
                  {playbackSpeeds.map((speed) => (
                    <SelectItem key={speed} value={speed.toString()}>
                      {speed}x
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Phase indicator and progress dots - right of speed controller */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span
                  className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
                    phase === 'playing' && 'bg-primary/20 text-primary',
                    phase === 'paused' && 'bg-muted text-muted-foreground',
                    phase === 'ready' && 'bg-muted text-muted-foreground'
                  )}
                >
                  {getPhaseDisplay()}
                </span>
                
                {/* Part progress dots */}
                <div className="flex items-center gap-1">
                  {availableParts.map((part: number) => (
                    <div
                      key={part}
                      className={cn(
                        'w-2 h-2 rounded-full transition-colors',
                        completedParts.has(part) && 'bg-green-500',
                        part === currentPart && !completedParts.has(part) && 'bg-primary',
                        part > currentPart && !completedParts.has(part) && 'bg-muted-foreground/30'
                      )}
                      title={`Part ${part}`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
