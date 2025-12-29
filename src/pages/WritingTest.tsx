import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { GripVertical, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WritingTaskDisplay } from '@/components/writing/WritingTaskDisplay';
import { WritingInputPanel } from '@/components/writing/WritingInputPanel';
import { WritingTimer } from '@/components/writing/WritingTimer';
import { WritingTestControls } from '@/components/writing/WritingTestControls';
import { HighlightNoteProvider } from '@/hooks/useHighlightNotes';
import { NoteSidebar } from '@/components/common/NoteSidebar';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { describeApiError } from '@/lib/apiErrors';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { AILoadingScreen } from '@/components/common/AILoadingScreen';
import { useFullscreenTest } from '@/hooks/useFullscreenTest';


// Define types for the new structure
type WritingTest = Tables<'writing_tests'>;
type WritingTask = Tables<'writing_tasks'>;
// WritingSubmission type available from Tables<'writing_submissions'>

// Helper to render rich text (markdown-like formatting)
const renderRichText = (text: string): string => {
  if (!text) return '';
  
  return text
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-2 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-3 mb-2">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Underline (already HTML)
    // Bullet points
    .replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br/>');
};

export default function WritingTest() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [writingTest, setWritingTest] = useState<WritingTest | null>(null);
  const [task1, setTask1] = useState<WritingTask | null>(null);
  const [task2, setTask2] = useState<WritingTask | null>(null);
  const [activeTask, setActiveTask] = useState<'task1' | 'task2'>('task1');

  const [submissionText1, setSubmissionText1] = useState('');
  const [wordCount1, setWordCount1] = useState(0);
  const [submissionId1, setSubmissionId1] = useState<string | null>(null);

  const [submissionText2, setSubmissionText2] = useState('');
  const [wordCount2, setWordCount2] = useState(0);
  const [submissionId2, setSubmissionId2] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [timeLeft, setTimeLeft] = useState(0);
  const [fontSize, setFontSize] = useState(14);
  const [isPaused, setIsPaused] = useState(false);
  const [customTime, setCustomTime] = useState(60);

  // Fullscreen mode
  const { isFullscreen, enterFullscreen, toggleFullscreen } = useFullscreenTest();

  const [isNoteSidebarOpen, setIsNoteSidebarOpen] = useState(false);

  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // AI Loading Screen states
  const [showAILoadingScreen, setShowAILoadingScreen] = useState(false);
  const [aiProgressSteps, setAiProgressSteps] = useState<string[]>([]);
  const [currentAIStepIndex, setCurrentAIStepIndex] = useState(0);

  const isNewSubmissionRequest = location.pathname.endsWith('/new-submission');

  // --- Start of reordered functions ---

  const handleSave = useCallback(async (isAutoSave: boolean = false) => {
    if (!user) {
      if (!isAutoSave) toast.error('You must be logged in to save your writing.');
      return;
    }
    if (!writingTest || !task1 || !task2) {
      if (!isAutoSave) toast.error('Test data not loaded.');
      return;
    }

    setIsSaving(true);
    try {
      // Generate a single timestamp for both saves
      const submissionTimestamp = new Date().toISOString();

      // Save Task 1 submission
      const submissionData1: TablesInsert<'writing_submissions'> = {
        user_id: user.id,
        task_id: task1.id,
        submission_text: submissionText1,
        word_count: wordCount1,
        submitted_at: submissionTimestamp, // Use the consistent timestamp
      };
      if (submissionId1) {
        await supabase.from('writing_submissions').update(submissionData1).eq('id', submissionId1);
      } else {
        const { data } = await supabase.from('writing_submissions').insert(submissionData1).select().single();
        if (data) setSubmissionId1(data.id);
      }

      // Save Task 2 submission
      const submissionData2: TablesInsert<'writing_submissions'> = {
        user_id: user.id,
        task_id: task2.id,
        submission_text: submissionText2,
        word_count: wordCount2,
        submitted_at: submissionTimestamp, // Use the consistent timestamp
      };
      if (submissionId2) {
        await supabase.from('writing_submissions').update(submissionData2).eq('id', submissionId2);
      } else {
        const { data } = await supabase.from('writing_submissions').insert(submissionData2).select().single();
        if (data) setSubmissionId2(data.id);
      }

      if (!isAutoSave) {
        toast.success('Drafts saved successfully!');
      }
    } catch (error: any) {
      console.error('Error saving submission:', error);
      if (!isAutoSave) toast.error(`Failed to save drafts: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [user, writingTest, task1, task2, submissionText1, wordCount1, submissionId1, submissionText2, wordCount2, submissionId2]);

  const handleSubmit = useCallback(async () => {
    if (!user) {
      // Save state and redirect to login
      localStorage.setItem('pendingTestSubmission', JSON.stringify({
        testId,
        testType: 'writing',
        submissionText1,
        submissionText2,
        returnPath: `/writing/test/${testId}`,
        savedAt: new Date().toISOString(),
        autoSubmitOnReturn: true,
      }));
      navigate(`/auth?returnTo=${encodeURIComponent(`/writing/test/${testId}`)}&pendingSubmission=true`);
      return;
    }
    if (!writingTest || !task1 || !task2) {
      toast.error('Test data not loaded.');
      return;
    }

    if (!confirm('Are you sure you want to submit your writing? You cannot edit it after submission.')) {
      return;
    }

    setIsSubmitting(true);
    // Show AI Loading Screen
    setShowAILoadingScreen(true);
    setAiProgressSteps([
      'Preparing your submissions for AI',
      'Analyzing your writing performance',
      'Generating detailed feedback report',
      'Calculating your overall band score',
    ]);
    setCurrentAIStepIndex(0);

    const simulateProgress = (step: number, delay: number = 2000) => {
      return new Promise(resolve => setTimeout(() => {
        setCurrentAIStepIndex(step);
        resolve(null);
      }, delay));
    };

    try {
      await simulateProgress(0, 500); // Step 0: Preparing submissions

      let currentSubmissionId1 = submissionId1;
      let currentSubmissionId2 = submissionId2;
      const submissionTimestamp = new Date().toISOString(); // Generate a single timestamp for submission

      console.log('Submitting with timestamp:', submissionTimestamp);

      // Submit Task 1
      const submissionData1: TablesInsert<'writing_submissions'> = {
        user_id: user.id,
        task_id: task1.id,
        submission_text: submissionText1,
        word_count: wordCount1,
        submitted_at: submissionTimestamp,
      };
      // Always insert a new submission for Task 1 if it's a new submission request or no ID exists
      if (isNewSubmissionRequest || !currentSubmissionId1) {
        const { data } = await supabase.from('writing_submissions').insert(submissionData1).select().single();
        if (data) currentSubmissionId1 = data.id;
        console.log('Task 1 new submission ID:', currentSubmissionId1, 'timestamp:', submissionTimestamp);
      } else {
        await supabase.from('writing_submissions').update(submissionData1).eq('id', currentSubmissionId1);
        console.log('Task 1 updated submission ID:', currentSubmissionId1, 'timestamp:', submissionTimestamp);
      }

      // Submit Task 2
      const submissionData2: TablesInsert<'writing_submissions'> = {
        user_id: user.id,
        task_id: task2.id,
        submission_text: submissionText2,
        word_count: wordCount2,
        submitted_at: submissionTimestamp,
      };
      // Always insert a new submission for Task 2 if it's a new submission request or no ID exists
      if (isNewSubmissionRequest || !currentSubmissionId2) {
        const { data } = await supabase.from('writing_submissions').insert(submissionData2).select().single();
        if (data) currentSubmissionId2 = data.id;
        console.log('Task 2 new submission ID:', currentSubmissionId2, 'timestamp:', submissionTimestamp);
      } else {
        await supabase.from('writing_submissions').update(submissionData2).eq('id', currentSubmissionId2);
        console.log('Task 2 updated submission ID:', currentSubmissionId2, 'timestamp:', submissionTimestamp);
      }

      await simulateProgress(1); // Step 1: Analyzing with AI

      // Trigger AI evaluation for both tasks
      const evaluatePromises = [];
      if (currentSubmissionId1) {
        evaluatePromises.push(
          supabase.functions.invoke('evaluate-writing-submission', {
            body: { submissionId: currentSubmissionId1 },
          })
        );
      }
      if (currentSubmissionId2) {
        evaluatePromises.push(
          supabase.functions.invoke('evaluate-writing-submission', {
            body: { submissionId: currentSubmissionId2 },
          })
        );
      }

      const evaluationResults = await Promise.allSettled(evaluatePromises);

      evaluationResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Evaluation for submission ${index + 1} failed:`, result.reason);
          const errDesc = describeApiError(result.reason);
          toast.error(`Task ${index + 1}: ${errDesc.description}`);
        }
      });

      await simulateProgress(2); // Step 2: Generating feedback
      await simulateProgress(3); // Step 3: Calculating band score

      toast.success('Writing submitted and AI evaluation triggered!', { id: 'ai-eval-toast' });
      navigate(`/writing/evaluation/${testId}/${currentSubmissionId1}`);
    } catch (error: any) {
      console.error('Error submitting writing:', error);
      toast.error(`Failed to submit writing: ${error.message}`, { id: 'ai-eval-toast' });
    } finally {
      setIsSubmitting(false);
      setShowAILoadingScreen(false); // Hide loading screen
    }
  }, [user, writingTest, task1, task2, submissionText1, wordCount1, submissionId1, submissionText2, wordCount2, submissionId2, navigate, isNewSubmissionRequest]);

  const handleTimeEnd = useCallback(() => {
    if (!isSubmitting) {
      toast.info('Time is up! Your writing is being automatically submitted.');
      handleSubmit();
    }
  }, [handleSubmit, isSubmitting]);

  // --- End of reordered functions ---

  // Restore pending submission state after login  
  useEffect(() => {
    if (testId) {
      const savedState = localStorage.getItem('pendingTestSubmission');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          if (state.testId === testId && state.testType === 'writing') {
            // Restore writing content
            if (state.submissionText1) setSubmissionText1(state.submissionText1);
            if (state.submissionText2) setSubmissionText2(state.submissionText2);
            
            // Check if auto-submit is needed (time was over)
            if (state.autoSubmitOnReturn) {
              // Clear the saved state first to prevent loop
              localStorage.removeItem('pendingTestSubmission');
              // Auto-submit after a brief delay to allow state to settle
              setTimeout(() => {
                handleSubmit();
              }, 500);
            } else {
              localStorage.removeItem('pendingTestSubmission');
              toast.info('Your previous writing has been restored.');
            }
          }
        } catch (e) {
          localStorage.removeItem('pendingTestSubmission');
        }
      }
    }
  }, [testId]);

  useEffect(() => {
    if (testId) {
      fetchTestData();
    }
  }, [testId, isNewSubmissionRequest]);

  // Handle fullscreen - auto-enter on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      enterFullscreen();
    }, 500);
    return () => clearTimeout(timer);
  }, [enterFullscreen]);

  // Update word count for active task
  useEffect(() => {
    if (activeTask === 'task1') {
      setWordCount1(submissionText1.split(/\s+/).filter(Boolean).length);
    } else {
      setWordCount2(submissionText2.split(/\s+/).filter(Boolean).length);
    }
  }, [submissionText1, submissionText2, activeTask]);

  // Auto-save logic
  useEffect(() => {
    if (user && writingTest && !isPaused) {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
      autoSaveIntervalRef.current = setInterval(() => {
        handleSave(true); // Pass true to indicate auto-save
      }, 60000); // Auto-save every 1 minute
    } else {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    }
    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [user, writingTest, submissionText1, submissionText2, isPaused, handleSave]);

  const fetchTestData = async () => {
    setLoading(true);
    let fetchedTask1: WritingTask | null = null;
    let fetchedTask2: WritingTask | null = null;

    try {
      // Fetch WritingTest
      const { data: testData, error: testError } = await supabase
        .from('writing_tests')
        .select('*')
        .eq('id', testId!)
        .single();

      if (testError) throw testError;
      setWritingTest(testData);
      setTimeLeft(testData.time_limit * 60);
      setCustomTime(testData.time_limit);

      // Fetch associated WritingTasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('writing_tasks')
        .select('*')
        .eq('writing_test_id', testId!)
        .order('task_type');

      if (tasksError) throw tasksError;

      if (tasksData && tasksData.length > 0) {
        fetchedTask1 = tasksData.find(t => t.task_type === 'task1') || null;
        fetchedTask2 = tasksData.find(t => t.task_type === 'task2') || null;
        if (fetchedTask1) setTask1(fetchedTask1);
        if (fetchedTask2) setTask2(fetchedTask2);
      } else {
        toast.error('No tasks found for this writing test.');
        navigate('/writing/cambridge-ielts-a');
        return;
      }

      // Fetch existing submissions for the current user and tasks, UNLESS it's a new submission request
      if (user && fetchedTask1 && fetchedTask2 && !isNewSubmissionRequest) {
        const { data: submissions, error: submissionsError } = await supabase
          .from('writing_submissions')
          .select('*')
          .eq('user_id', user.id)
          .in('task_id', [fetchedTask1.id, fetchedTask2.id])
          .order('submitted_at', { ascending: false }); // Get latest submission

        if (submissionsError) {
          console.error('Error fetching submissions:', submissionsError);
        } else if (submissions) {
          const existingSub1 = submissions.find(s => s.task_id === fetchedTask1?.id);
          const existingSub2 = submissions.find(s => s.task_id === fetchedTask2?.id);
          
          if (existingSub1) {
            setSubmissionText1(existingSub1.submission_text);
            setSubmissionId1(existingSub1.id);
          } else {
            setSubmissionText1('');
            setSubmissionId1(null);
          }
          if (existingSub2) {
            setSubmissionText2(existingSub2.submission_text);
            setSubmissionId2(existingSub2.id);
          } else {
            setSubmissionText2('');
            setSubmissionId2(null);
          }
          if (existingSub1 || existingSub2) {
            toast.info('Loaded your previous drafts.');
          }
        }
      } else if (isNewSubmissionRequest) {
        // For new submission requests, clear any existing text and IDs
        setSubmissionText1('');
        setSubmissionId1(null);
        setSubmissionText2('');
        setSubmissionId2(null);
        toast.info('Starting a new submission.');
      }

    } catch (error) {
      console.error('Error fetching test data:', error);
      toast.error('Failed to load writing test');
      navigate('/writing/cambridge-ielts-a');
    } finally {
      setLoading(false);
    }
  };

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  const handleTimeChange = useCallback((minutes: number) => {
    setTimeLeft(minutes * 60);
  }, []);

  const currentTaskData = activeTask === 'task1' ? task1 : task2;
  const currentSubmissionText = activeTask === 'task1' ? submissionText1 : submissionText2;
  const currentWordCount = activeTask === 'task1' ? wordCount1 : wordCount2;
  const onCurrentSubmissionTextChange = activeTask === 'task1' ? setSubmissionText1 : setSubmissionText2;

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading test...</div>
      </div>
    );
  }

  if (!writingTest || !task1 || !task2) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <div className="text-destructive">Writing test or tasks not found</div>
    </div>
  );
}

  return (
    <HighlightNoteProvider testId={testId!}>
      <div className="h-screen bg-background flex flex-col overflow-hidden ielts-test-content">
        {/* Top Header - IELTS Official Style */}
        <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between ielts-section-header" style={{ fontFamily: 'var(--font-ielts)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center border border-border">
              <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-ielts)' }}>WR</span>
            </div>
            <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-ielts)' }}>Writing Test: {writingTest.title}</span>
          </div>
          
          <WritingTimer timeLeft={timeLeft} setTimeLeft={setTimeLeft} isPaused={isPaused} onTimeEnd={handleTimeEnd} />
          
          <div className="flex items-center gap-2">
            <WritingTestControls
              fontSize={fontSize}
              setFontSize={setFontSize}
              isFullscreen={isFullscreen}
              toggleFullscreen={toggleFullscreen}
              isPaused={isPaused}
              togglePause={togglePause}
              customTime={customTime}
              setCustomTime={setCustomTime}
              onTimeChange={handleTimeChange}
            />
            <Button variant="ghost" size="icon" onClick={() => setIsNoteSidebarOpen(true)} className="relative">
              <StickyNote size={18} />
            </Button>
          </div>
        </header>

        {/* Main Content with Resizable Panels */}
        <div className="flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Left Panel - Task Display */}
            <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
              <div className="h-full flex flex-col">
                <div 
                  className={cn(
                    "flex-1 overflow-y-auto overflow-x-hidden bg-card ielts-card",
                    "scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent hover:scrollbar-thumb-primary/40"
                  )}
                  style={{ fontFamily: 'var(--font-ielts)' }}
                >
                  {currentTaskData && (
                    <WritingTaskDisplay
                      testId={testId!}
                      writingTest={writingTest}
                      writingTask={currentTaskData}
                      fontSize={fontSize}
                      renderRichText={renderRichText}
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>
            
            {/* Resizable Handle */}
            <ResizableHandle withHandle className="w-2 bg-border hover:bg-primary/20 transition-colors">
              <div className="flex items-center justify-center h-full">
                <GripVertical size={16} className="text-muted-foreground" />
              </div>
            </ResizableHandle>
            
            {/* Right Panel - Writing Input */}
            <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
              <div className="h-full flex flex-col">
                <div 
                  className={cn(
                    "flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 ielts-muted",
                    "scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent hover:scrollbar-thumb-primary/40"
                  )}
                  style={{ fontFamily: 'var(--font-ielts)' }}
                >
                  {currentTaskData && (
                    <WritingInputPanel
                      submissionText={currentSubmissionText}
                      onSubmissionTextChange={onCurrentSubmissionTextChange}
                      wordCount={currentWordCount}
                      onSave={() => handleSave(false)}
                      onSubmit={handleSubmit}
                      isSaving={isSaving}
                      isSubmitting={isSubmitting}
                      fontSize={fontSize}
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Compact Bottom Navigation for Tasks - IELTS Official Style */}
        <footer className="bg-card border-t border-border px-4 py-2 flex items-center justify-center gap-2 flex-shrink-0" style={{ fontFamily: 'var(--font-ielts)' }}>
          <button
            onClick={() => setActiveTask('task1')}
            disabled={isSubmitting}
            className={cn(
              "px-6 py-1.5 text-sm font-semibold transition-all border",
              activeTask === 'task1' 
                ? "bg-foreground text-background border-foreground" 
                : "bg-transparent text-foreground border-border hover:bg-muted"
            )}
            style={{ fontFamily: 'var(--font-ielts)', borderRadius: 0 }}
          >
            Task 1
          </button>
          <button
            onClick={() => setActiveTask('task2')}
            disabled={isSubmitting}
            className={cn(
              "px-6 py-1.5 text-sm font-semibold transition-all border",
              activeTask === 'task2' 
                ? "bg-foreground text-background border-foreground" 
                : "bg-transparent text-foreground border-border hover:bg-muted"
            )}
            style={{ fontFamily: 'var(--font-ielts)', borderRadius: 0 }}
          >
            Task 2
          </button>
        </footer>
      </div>
      {testId && (
        <NoteSidebar 
          testId={testId} 
          isOpen={isNoteSidebarOpen} 
          onOpenChange={setIsNoteSidebarOpen} 
          renderRichText={renderRichText}
        />
      )}
      {showAILoadingScreen && (
        <AILoadingScreen
          title="Evaluating Your Writing Performance"
          description="Our AI is analyzing your essays and crafting your personalized feedback report."
          progressSteps={aiProgressSteps}
          currentStepIndex={currentAIStepIndex}
          estimatedTime="30-60 seconds"
        />
      )}
    </HighlightNoteProvider>
  );
}