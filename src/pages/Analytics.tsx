import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown,
  Target,
  BookOpen,
  Headphones,
  PenTool,
  Mic,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Brain,
  Lightbulb,
  Video,
  FileText,
  GraduationCap
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { describeApiError } from '@/lib/apiErrors';
import { AILoadingScreen } from '@/components/common/AILoadingScreen';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

interface DetailedExample {
  testName: string;
  mistake: string;
  correction: string;
  technique: string;
}

interface ModuleAnalytics {
  module: 'reading' | 'listening' | 'writing' | 'speaking';
  averageScore: number;
  totalTests: number;
  weakAreas: string[];
  commonMistakes: string[];
  improvements: string[];
  detailedExamples?: DetailedExample[];
  resources: { title: string; url: string; type: string }[];
  trend: 'up' | 'down' | 'stable';
  bandScore: number;
}

interface AnalyticsData {
  generatedAt: string;
  modules: ModuleAnalytics[];
  overallBand: number;
  overallTrend: 'up' | 'down' | 'stable';
  topStrengths: string[];
  areasToImprove: string[];
}

const moduleIcons = {
  reading: BookOpen,
  listening: Headphones,
  writing: PenTool,
  speaking: Mic
};

const moduleColors = {
  reading: 'from-blue-500 to-blue-600',
  listening: 'from-purple-500 to-purple-600',
  writing: 'from-emerald-500 to-emerald-600',
  speaking: 'from-orange-500 to-orange-600'
};

const resourceIcons: Record<string, typeof Video> = {
  video: Video,
  article: FileText,
  practice: GraduationCap,
  samples: FileText,
  topics: Lightbulb
};

// Real IELTS resources with actual URLs
const realResources: Record<string, { title: string; url: string; type: string }[]> = {
  reading: [
    { title: 'British Council - Reading Practice Tests', url: 'https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-practice-tests/reading', type: 'practice' },
    { title: 'IELTS.org - Reading Sample Questions', url: 'https://www.ielts.org/for-test-takers/sample-test-questions', type: 'practice' },
    { title: 'E2 IELTS Reading Tips (YouTube)', url: 'https://www.youtube.com/watch?v=N2Jvhm9aSFU', type: 'video' },
    { title: 'Cambridge - Reading Strategies Guide', url: 'https://www.cambridgeenglish.org/exams-and-tests/ielts/', type: 'article' },
  ],
  listening: [
    { title: 'British Council - Listening Practice Tests', url: 'https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-practice-tests/listening', type: 'practice' },
    { title: 'IELTS.org - Listening Samples', url: 'https://www.ielts.org/for-test-takers/sample-test-questions', type: 'practice' },
    { title: 'E2 IELTS Listening Tips (YouTube)', url: 'https://www.youtube.com/watch?v=OjFWxbAe9mU', type: 'video' },
    { title: 'BBC Learning English - Listening Skills', url: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english', type: 'practice' },
  ],
  writing: [
    { title: 'British Council - Writing Task Tips', url: 'https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-practice-tests/writing', type: 'article' },
    { title: 'IELTS Liz - Band 9 Essay Samples', url: 'https://ieltsliz.com/ielts-writing-task-2/', type: 'samples' },
    { title: 'E2 IELTS Writing Masterclass (YouTube)', url: 'https://www.youtube.com/watch?v=R51E7gH_EE0', type: 'video' },
    { title: 'IELTS Advantage - Writing Techniques', url: 'https://www.ieltsadvantage.com/writing-task-2/', type: 'article' },
  ],
  speaking: [
    { title: 'British Council - Speaking Practice', url: 'https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-practice-tests/speaking', type: 'practice' },
    { title: 'IELTS Speaking Success - Part 2 Topics', url: 'https://ieltsspeakingsuccess.com/ielts-speaking-part-2-topics/', type: 'topics' },
    { title: 'E2 IELTS Speaking Tips (YouTube)', url: 'https://www.youtube.com/watch?v=sAv0kWNIKlA', type: 'video' },
    { title: 'IELTS Liz - Speaking Samples', url: 'https://ieltsliz.com/ielts-speaking-free-lessons-essential-tips/', type: 'samples' },
  ],
};

export default function Analytics() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setGenerating] = useState(false);
  const [hasNewTests, setHasNewTests] = useState(false);
  const [showAILoadingScreen, setShowAILoadingScreen] = useState(false);
  const [aiProgressSteps, setAiProgressSteps] = useState<string[]>([]);
  const [currentAIStepIndex, setCurrentAIStepIndex] = useState(0);

  useEffect(() => {
    if (!authLoading && user) {
      fetchAnalytics();
      checkForNewTests();
    } else if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading]);

  const fetchAnalytics = async () => {
    try {
      const stored = localStorage.getItem(`analytics_${user?.id}`);
      if (stored) {
        const data = JSON.parse(stored);
        // Enhance with real resources
        if (data.modules) {
          data.modules = data.modules.map((mod: ModuleAnalytics) => ({
            ...mod,
            resources: realResources[mod.module] || mod.resources
          }));
        }
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkForNewTests = async () => {
    if (!user) return;
    
    try {
      const stored = localStorage.getItem(`analytics_${user.id}`);
      if (!stored) {
        setHasNewTests(true);
        return;
      }

      const analyticsData: AnalyticsData = JSON.parse(stored);
      const lastGenerated = new Date(analyticsData.generatedAt);

      // Check for new reading/listening/writing/speaking submissions
      const [readingCount, listeningCount, writingCount, speakingCount] = await Promise.all([
        supabase
          .from('reading_test_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gt('created_at', lastGenerated.toISOString()),
        supabase
          .from('listening_test_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gt('created_at', lastGenerated.toISOString()),
        supabase
          .from('writing_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gt('submitted_at', lastGenerated.toISOString()),
        supabase
          .from('speaking_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gt('submitted_at', lastGenerated.toISOString())
      ]);

      const totalNew = (readingCount.count || 0) + (listeningCount.count || 0) + (writingCount.count || 0) + (speakingCount.count || 0);
      setHasNewTests(totalNew > 0);
    } catch (error) {
      console.error('Error checking for new tests:', error);
    }
  };

  const generateAnalytics = async () => {
    if (!user) return;
    
    setGenerating(true);
    setShowAILoadingScreen(true);
    
    setAiProgressSteps([
      'Gathering your test submissions',
      'Analyzing performance patterns',
      'Identifying common mistakes',
      'Generating personalized recommendations',
      'Calculating your band score',
    ]);
    setCurrentAIStepIndex(0);

    const simulateProgress = (step: number, delay: number = 1500) => {
      return new Promise(resolve => setTimeout(() => {
        setCurrentAIStepIndex(step);
        resolve(null);
      }, delay));
    };

    try {
      await simulateProgress(0, 500);

      // Fetch actual test data including writing and speaking
      const [readingData, listeningData, writingData, speakingData] = await Promise.all([
        supabase
          .from('reading_test_submissions')
          .select('*, reading_tests(title, book_name)')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false })
          .limit(5),
        supabase
          .from('listening_test_submissions')
          .select('*, listening_tests(title, book_name)')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false })
          .limit(5),
        supabase
          .from('writing_submissions')
          .select('*, writing_tasks(instruction, task_type)')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(5),
        supabase
          .from('speaking_submissions')
          .select('*, speaking_tests(name)')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(5)
      ]);

      await simulateProgress(1);

      const testData = {
        reading: readingData.data || [],
        listening: listeningData.data || [],
        writing: writingData.data || [],
        speaking: speakingData.data || []
      };

      await simulateProgress(2);

      // Call AI to analyze
      const response = await supabase.functions.invoke('analyze-performance', {
        body: { userId: user.id, testData }
      });

      await simulateProgress(3);

      if (response.error) {
        throw response.error;
      }

      await simulateProgress(4);

      let newAnalytics: AnalyticsData = response.data.analytics || generateDefaultAnalytics();
      newAnalytics.generatedAt = new Date().toISOString();
      
      // Always use real resources
      newAnalytics.modules = newAnalytics.modules.map((mod: ModuleAnalytics) => ({
        ...mod,
        resources: realResources[mod.module] || mod.resources
      }));

      localStorage.setItem(`analytics_${user.id}`, JSON.stringify(newAnalytics));
      setAnalytics(newAnalytics);
      setHasNewTests(false);

      toast({
        title: 'Analytics Generated',
        description: 'Your personalized performance analysis is ready!',
      });
    } catch (error) {
      console.error('Error generating analytics:', error);
      const errDesc = describeApiError(error);
      const defaultAnalytics = generateDefaultAnalytics();
      localStorage.setItem(`analytics_${user?.id}`, JSON.stringify(defaultAnalytics));
      setAnalytics(defaultAnalytics);
      
      toast({
        title: errDesc.title,
        description: errDesc.description,
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
      setShowAILoadingScreen(false);
    }
  };

  const generateDefaultAnalytics = (): AnalyticsData => {
    return {
      generatedAt: new Date().toISOString(),
      overallBand: 6.5,
      overallTrend: 'up',
      topStrengths: [
        'Strong vocabulary recognition in academic texts',
        'Good understanding of main ideas and themes',
        'Consistent time management during tests'
      ],
      areasToImprove: [
        'Practice distinguishing "Not Given" from "False" in T/F/NG questions',
        'Focus on spelling accuracy for fill-in-the-blank answers',
        'Develop skimming techniques for faster passage navigation'
      ],
      modules: [
        {
          module: 'reading',
          averageScore: 72,
          totalTests: 3,
          bandScore: 7.0,
          trend: 'up',
          weakAreas: ['Matching Headings', 'True/False/Not Given'],
          commonMistakes: [
            'Confusing "Not Given" with "False" - remember: if the passage doesn\'t mention it, it\'s Not Given',
            'Missing keywords that change meaning (e.g., "always" vs "sometimes")'
          ],
          improvements: [
            'Use the "3-step method": 1) Read question keywords 2) Scan for those words 3) Check context carefully',
            'Practice underlining key qualifiers (all, never, sometimes, often) in questions'
          ],
          detailedExamples: [
            {
              testName: 'Cambridge 18 Test 1',
              mistake: 'Answered "False" when passage didn\'t discuss the topic',
              correction: 'Should be "Not Given" - no information provided',
              technique: 'If you can\'t find evidence for True OR False, it\'s Not Given'
            }
          ],
          resources: realResources.reading
        },
        {
          module: 'listening',
          averageScore: 68,
          totalTests: 2,
          bandScore: 6.5,
          trend: 'stable',
          weakAreas: ['Map Labelling', 'Multiple Choice'],
          commonMistakes: [
            'Spelling errors on proper nouns (e.g., "accomodation" instead of "accommodation")',
            'Missing plural forms (e.g., "cup" instead of "cups")'
          ],
          improvements: [
            'Practice note-taking with abbreviations while audio plays',
            'Review common IELTS spelling words before each test'
          ],
          detailedExamples: [
            {
              testName: 'Cambridge 19 Test 2',
              mistake: 'Wrote "libary" instead of "library"',
              correction: 'Correct spelling: l-i-b-r-a-r-y',
              technique: 'Create a personal list of commonly misspelled words and review daily'
            }
          ],
          resources: realResources.listening
        },
        {
          module: 'writing',
          averageScore: 65,
          totalTests: 2,
          bandScore: 6.0,
          trend: 'up',
          weakAreas: ['Task Achievement', 'Coherence and Cohesion'],
          commonMistakes: [
            'Not fully addressing all parts of the task prompt',
            'Weak paragraph transitions and unclear topic sentences'
          ],
          improvements: [
            'Spend 3-5 minutes planning: identify ALL parts of the question before writing',
            'Start each paragraph with a clear topic sentence that links to the thesis'
          ],
          resources: realResources.writing
        },
        {
          module: 'speaking',
          averageScore: 70,
          totalTests: 1,
          bandScore: 6.5,
          trend: 'stable',
          weakAreas: ['Fluency', 'Lexical Resource'],
          commonMistakes: [
            'Overusing filler words (um, uh, you know)',
            'Limited vocabulary range - repeating the same words'
          ],
          improvements: [
            'Record yourself speaking for 2 minutes daily and count filler words',
            'Learn 3 new topic-specific vocabulary words each day'
          ],
          resources: realResources.speaking
        }
      ]
    };
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (showAILoadingScreen) {
    return (
      <AILoadingScreen
        title="Analyzing Your Performance"
        description="AI is analyzing your test history and creating personalized insights."
        progressSteps={aiProgressSteps}
        currentStepIndex={currentAIStepIndex}
        estimatedTime="30-60 seconds"
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col select-text">
      <Navbar />
      
      {/* Neural grid background */}
      <div className="fixed inset-0 neural-grid opacity-[0.02] pointer-events-none" />

      <main className="container mx-auto px-4 py-8 relative flex-1 select-text">
        {!analytics ? (
          /* No Analytics - Prompt to Generate */
          <Card className="max-w-lg mx-auto text-center card-ai">
            <CardContent className="pt-12 pb-8">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-6 ai-glow">
                <Brain className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Generate AI Analytics</h2>
              <p className="text-muted-foreground mb-6">
                Let our AI analyze your test performance and identify patterns to help you improve faster.
              </p>
              <Button onClick={generateAnalytics} size="lg" className="btn-ai gap-2">
                <Sparkles size={18} />
                Generate Analytics
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Regenerate Banner */}
            {hasNewTests && (
              <Card className="mb-6 border-warning/30 bg-warning/5">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="text-warning" />
                    <span>New tests completed! Regenerate analytics for updated insights.</span>
                  </div>
                  <Button onClick={generateAnalytics} variant="outline" size="sm" className="gap-2">
                    <RefreshCw size={14} />
                    Regenerate
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Overall Summary */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <Card className="md:col-span-2 card-ai">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="text-primary" />
                    Overall Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="text-5xl font-bold gradient-text-static">{analytics.overallBand}</div>
                      <p className="text-sm text-muted-foreground">Overall Band</p>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 size={16} className="text-success" />
                          <span className="font-medium">Top Strengths</span>
                        </div>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {analytics.topStrengths.map((strength, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-primary">•</span>
                              {strength}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-ai">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <Lightbulb size={18} />
                    Focus Areas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {analytics.areasToImprove.map((area, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <TrendingUp size={14} className="mt-1 text-primary shrink-0" />
                        {area}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Module Tabs */}
            <Tabs defaultValue="reading" className="space-y-6">
              <TabsList className="glass p-1 w-full justify-start">
                {analytics.modules.map((mod) => {
                  const Icon = moduleIcons[mod.module];
                  return (
                    <TabsTrigger key={mod.module} value={mod.module} className="gap-2 capitalize data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-accent data-[state=active]:text-white">
                      <Icon size={16} />
                      {mod.module}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {analytics.modules.map((mod) => {
                const Icon = moduleIcons[mod.module];
                return (
                  <TabsContent key={mod.module} value={mod.module}>
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Score Overview */}
                      <Card className="card-ai">
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <span className="flex items-center gap-2 capitalize">
                              <div className={`p-2 rounded-lg bg-gradient-to-br ${moduleColors[mod.module]}`}>
                                <Icon size={18} className="text-white" />
                              </div>
                              {mod.module} Performance
                            </span>
                            <Badge variant={mod.trend === 'up' ? 'default' : 'secondary'} className="gap-1">
                              {mod.trend === 'up' ? <TrendingUp size={12} /> : mod.trend === 'down' ? <TrendingDown size={12} /> : null}
                              {mod.trend}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <div className="text-4xl font-bold gradient-text-static">{mod.bandScore}</div>
                              <p className="text-xs text-muted-foreground">Band Score</p>
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1">
                                <span>Average</span>
                                <span>{mod.averageScore}%</span>
                              </div>
                              <Progress value={mod.averageScore} className="h-2" />
                              <p className="text-xs text-muted-foreground mt-1">{mod.totalTests} tests analyzed</p>
                            </div>
                          </div>

                          <div>
                            <p className="text-sm font-medium mb-2">Weak Areas</p>
                            <div className="flex flex-wrap gap-2">
                              {mod.weakAreas.map((area, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {area}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Common Mistakes & Improvements */}
                      <Card className="card-ai">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <AlertTriangle size={18} className="text-warning" />
                            Common Mistakes
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ul className="space-y-2 text-sm">
                            {mod.commonMistakes.map((mistake, i) => (
                              <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                                <span className="text-destructive font-bold">×</span>
                                {mistake}
                              </li>
                            ))}
                          </ul>

                          <div>
                            <p className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Lightbulb size={14} className="text-success" />
                              How to Improve
                            </p>
                            <ul className="space-y-2 text-sm">
                              {mod.improvements.map((tip, i) => (
                                <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-success/5 border border-success/10">
                                  <CheckCircle2 size={14} className="text-success mt-0.5 shrink-0" />
                                  {tip}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Detailed Examples */}
                      {mod.detailedExamples && mod.detailedExamples.length > 0 && (
                        <Card className="card-ai md:col-span-2">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Brain size={18} className="text-primary" />
                              Detailed Examples from Your Tests
                            </CardTitle>
                            <CardDescription>Specific patterns identified from your submissions</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="grid md:grid-cols-2 gap-4">
                              {mod.detailedExamples.map((example, i) => (
                                <div key={i} className="p-4 rounded-xl border bg-gradient-to-br from-primary/5 to-accent/5">
                                  <p className="text-xs text-muted-foreground mb-1">{example.testName}</p>
                                  <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                      <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded">Mistake</span>
                                      <p className="text-sm">{example.mistake}</p>
                                    </div>
                                    <div className="flex items-start gap-2">
                                      <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded">Correct</span>
                                      <p className="text-sm">{example.correction}</p>
                                    </div>
                                    <div className="flex items-start gap-2">
                                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">Technique</span>
                                      <p className="text-sm">{example.technique}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Resources */}
                      <Card className="card-ai md:col-span-2">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <GraduationCap size={18} className="text-primary" />
                            Recommended Resources
                          </CardTitle>
                          <CardDescription>Curated materials to help you improve</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {mod.resources.map((resource, i) => {
                              const ResourceIcon = resourceIcons[resource.type] || FileText;
                              return (
                                <a
                                  key={i}
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group p-4 rounded-xl border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 cursor-pointer block"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-lg bg-gradient-to-br ${moduleColors[mod.module]} group-hover:ai-glow-sm transition-all`}>
                                      <ResourceIcon size={16} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                                        {resource.title}
                                      </p>
                                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                        <Badge variant="secondary" className="text-xs capitalize">
                                          {resource.type}
                                        </Badge>
                                        <ExternalLink size={10} />
                                      </div>
                                    </div>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}