import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Headphones, BookOpen, Play, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QuestionTypeBadge } from './QuestionTypeBadge';

interface QuestionGroup {
  id: string;
  question_type: string;
  start_question: number;
  end_question: number;
  passage_id?: string;
}

interface Passage {
  id: string;
  passage_number: number;
  title: string;
}

interface TestData {
  id: string;
  title: string;
  test_number: number;
  time_limit: number;
  total_questions: number;
  passages?: Passage[];
  question_groups?: QuestionGroup[];
}

interface TestScore {
  score: number;
  totalQuestions: number;
  bandScore: number | null;
}

interface BookSectionNewProps {
  bookName: string;
  tests: TestData[];
  testType: 'reading' | 'listening';
  selectedQuestionTypes: string[];
  userScores?: Record<string, { overall: TestScore | null; parts: Record<number, { score: number; totalQuestions: number }> }>;
}

export function BookSectionNew({
  bookName,
  tests,
  testType,
  selectedQuestionTypes,
  userScores = {},
}: BookSectionNewProps) {
  const filteredTests = selectedQuestionTypes.length === 0 
    ? tests 
    : tests.filter((test) => 
        test.question_groups?.some((group) => 
          selectedQuestionTypes.includes(group.question_type)
        )
      );

  if (filteredTests.length === 0) return null;

  const sortedTests = [...filteredTests].sort((a, b) => a.test_number - b.test_number);
  
  // Extract book number from name (e.g., "Cambridge IELTS 19" -> "19")
  const bookNumber = bookName.match(/\d+/)?.[0] || '';

  return (
    <div className="mb-8">
      {/* Book Section with sidebar + grid layout */}
      <div className="flex gap-0 rounded-xl overflow-hidden shadow-sm border border-border/50">
        {/* Left Sidebar - Book Label */}
        <div 
          className="hidden md:flex flex-col items-center justify-center px-6 py-8 min-w-[140px]"
          style={{ 
            backgroundColor: 'hsl(var(--foreground))',
            color: 'hsl(var(--background))'
          }}
        >
          <span className="text-xs font-bold uppercase tracking-wider opacity-80">
            {testType === 'reading' ? 'Reading' : 'Listening'}
          </span>
          <span className="text-4xl font-bold mt-1">{bookNumber}</span>
          <span className="text-[10px] uppercase tracking-widest opacity-60 mt-1">
            Academic
          </span>
        </div>

        {/* Mobile Header */}
        <div 
          className="md:hidden flex items-center gap-3 px-4 py-3 w-full"
          style={{ 
            backgroundColor: 'hsl(var(--foreground))',
            color: 'hsl(var(--background))'
          }}
        >
          <div className="text-2xl font-bold">{bookNumber}</div>
          <div>
            <div className="text-sm font-semibold">{bookName}</div>
            <div className="text-xs opacity-70">{sortedTests.length} tests</div>
          </div>
        </div>

        {/* Tests Grid */}
        <div className="flex-1 bg-card p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedTests.map((test) => (
              <TestCard
                key={test.id}
                test={test}
                testType={testType}
                score={userScores[test.id]}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Test Card Component
interface TestCardProps {
  test: TestData;
  testType: 'reading' | 'listening';
  score?: { overall: TestScore | null; parts: Record<number, { score: number; totalQuestions: number }> };
}

function TestCard({ test, testType, score }: TestCardProps) {
  const navigate = useNavigate();
  const hasScore = score?.overall !== null && score?.overall !== undefined;
  const overallScore = score?.overall;

  // Get parts data
  const partsData = useMemo(() => {
    if (testType === 'reading' && test.passages) {
      return test.passages.map((passage) => {
        const passageGroups = test.question_groups?.filter(g => g.passage_id === passage.id) || [];
        const questionCount = passageGroups.reduce((sum, g) => sum + (g.end_question - g.start_question + 1), 0);
        const types = [...new Set(passageGroups.map(g => g.question_type))];
        return {
          partNumber: passage.passage_number,
          title: passage.title,
          questionCount,
          types,
          passageId: passage.id,
        };
      });
    } else {
      const parts: { partNumber: number; questionCount: number; types: string[]; title?: string; passageId?: string }[] = [];
      for (let i = 1; i <= 4; i++) {
        const partGroups = test.question_groups?.filter(g => {
          const midQ = (g.start_question + g.end_question) / 2;
          return Math.ceil(midQ / 10) === i;
        }) || [];
        if (partGroups.length > 0) {
          const questionCount = partGroups.reduce((sum, g) => sum + (g.end_question - g.start_question + 1), 0);
          const types = [...new Set(partGroups.map(g => g.question_type))];
          parts.push({ partNumber: i, questionCount, types });
        }
      }
      return parts;
    }
  }, [test, testType]);

  const handleStart = () => {
    navigate(`/${testType}/test/${test.id}`);
  };

  // Calculate score percentage for the ring
  const scorePercent = overallScore 
    ? Math.round((overallScore.score / overallScore.totalQuestions) * 100) 
    : 0;

  return (
    <div className="flex flex-col bg-background rounded-xl border border-border/50 overflow-hidden hover:shadow-md transition-shadow">
      {/* Score Circle Section */}
      <div className="flex flex-col items-center pt-5 pb-3 relative">
        {/* Progress Ring */}
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="hsl(var(--muted))"
              strokeWidth="4"
              fill="none"
            />
            {/* Progress circle */}
            {hasScore && (
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke={scorePercent >= 70 ? 'hsl(142, 76%, 36%)' : scorePercent >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                strokeWidth="4"
                fill="none"
                strokeDasharray={`${(scorePercent / 100) * 176} 176`}
                strokeLinecap="round"
              />
            )}
          </svg>
          {/* Score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-foreground">
              {hasScore ? overallScore?.score : '—'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              /{test.total_questions}
            </span>
          </div>
        </div>
        
        {/* Band score badge */}
        {hasScore && overallScore?.bandScore && (
          <div className={cn(
            "mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold",
            overallScore.bandScore >= 7 
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : overallScore.bandScore >= 5.5
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
          )}>
            Band {overallScore.bandScore}
          </div>
        )}
      </div>

      {/* Card Header - Test Info */}
      <div 
        className="px-3 py-2.5 flex items-center gap-2"
        style={{ backgroundColor: 'hsl(var(--primary))' }}
      >
        {testType === 'listening' ? (
          <Headphones className="w-4 h-4 text-primary-foreground/80" />
        ) : (
          <BookOpen className="w-4 h-4 text-primary-foreground/80" />
        )}
        <span className="text-sm font-semibold text-primary-foreground truncate flex-1">
          Test {test.test_number}
        </span>
        <span className="text-xs text-primary-foreground/70 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {test.time_limit}m
        </span>
      </div>

      {/* Parts List */}
      <div className="flex-1 divide-y divide-border/50">
        {partsData.map((part) => {
          const partScore = score?.parts?.[part.partNumber];
          const hasPartScore = partScore && partScore.totalQuestions > 0;
          const isComplete = hasPartScore && partScore.score === partScore.totalQuestions;
          const isInProgress = hasPartScore && partScore.score > 0 && partScore.score < partScore.totalQuestions;
          
          const uniqueTypes = part.types.filter((v, i, a) => a.indexOf(v) === i);

          return (
            <div 
              key={part.partNumber}
              className="px-3 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors cursor-pointer group"
              onClick={() => navigate(`/${testType}/test/${test.id}?part=${part.partNumber}`)}
            >
              {/* Status Icon */}
              {isComplete ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
              ) : isInProgress ? (
                <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              )}

              {/* Part Info */}
              <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-foreground">
                  Part {part.partNumber}
                </span>
                {uniqueTypes.slice(0, 2).map((type) => (
                  <QuestionTypeBadge
                    key={type}
                    type={type}
                    clickable
                    testId={test.id}
                    testType={testType}
                    partNumber={part.partNumber}
                    className="text-[9px] px-1.5 py-0"
                  />
                ))}
                {uniqueTypes.length > 2 && (
                  <span className="text-[9px] text-muted-foreground">+{uniqueTypes.length - 2}</span>
                )}
              </div>

              {/* Part Score */}
              {hasPartScore && (
                <span className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  isComplete 
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {partScore.score}/{partScore.totalQuestions}
                </span>
              )}

              {/* Play icon on hover */}
              <Play className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          );
        })}
      </div>

      {/* Footer - Start Button */}
      <div className="p-3 pt-2 border-t border-border/50">
        <Button 
          onClick={handleStart}
          size="sm"
          className="w-full h-8 text-xs font-semibold"
        >
          <Play className="w-3 h-3 mr-1.5" />
          {hasScore ? 'Retry Full Test' : 'Start Full Test'}
        </Button>
      </div>
    </div>
  );
}
