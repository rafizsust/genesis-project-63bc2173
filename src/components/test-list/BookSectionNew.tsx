import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Play, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { getQuestionTypeInfo } from './QuestionTypeBadge';

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
  // Filter tests based on selected question types
  const filteredTests = selectedQuestionTypes.length === 0 
    ? tests 
    : tests.filter((test) => 
        test.question_groups?.some((group) => 
          selectedQuestionTypes.includes(group.question_type)
        )
      );

  if (filteredTests.length === 0) return null;

  // Extract book number from name (e.g., "Cambridge 20" -> "20")
  const bookNumber = bookName.match(/\d+/)?.[0] || '';
  const moduleLabel = testType === 'reading' ? 'READING' : 'LISTENING';

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      {/* Book Label - Left Side */}
      <div className="lg:w-32 shrink-0">
        <div className="lg:sticky lg:top-24 bg-foreground text-background rounded-xl p-4 lg:py-6">
          <div className="text-xs font-semibold tracking-wide opacity-80">{moduleLabel}</div>
          <div className="text-sm font-medium mt-0.5 opacity-70">ACADEMIC</div>
          <div className="text-4xl lg:text-5xl font-bold mt-1">{bookNumber}</div>
        </div>
      </div>

      {/* Test Cards Grid */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {filteredTests.map((test) => (
          <TestCard
            key={test.id}
            test={test}
            testType={testType}
            score={userScores[test.id]}
          />
        ))}
      </div>
    </div>
  );
}

// Individual Test Card
interface TestCardProps {
  test: TestData;
  testType: 'reading' | 'listening';
  score?: { overall: TestScore | null; parts: Record<number, { score: number; totalQuestions: number }> };
}

function TestCard({ test, testType, score }: TestCardProps) {
  const hasScore = score?.overall !== null && score?.overall !== undefined;
  const isFinished = hasScore && score!.overall!.score === score!.overall!.totalQuestions;

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
        };
      });
    } else {
      // Listening: 4 parts based on question ranges
      const parts: { partNumber: number; questionCount: number; types: string[]; title?: string }[] = [];
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

  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-border bg-card">
      {/* Card Header */}
      <div className="bg-primary px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-primary-foreground">Test{test.test_number}</span>
        {hasScore && (
          <span className="text-xs font-medium text-primary-foreground/90">
            {isFinished ? 'Finish' : 'Score'} {score!.overall!.score}/{score!.overall!.totalQuestions}
          </span>
        )}
      </div>

      {/* Parts List */}
      <div className="flex-1 p-3 space-y-2">
        {partsData.map((part) => {
          const partScore = score?.parts?.[part.partNumber];
          const partStarted = partScore !== undefined;
          const partFinished = partScore && partScore.score === partScore.totalQuestions;
          
          // Get question type abbreviations
          const typeAbbrs = part.types.map(t => getQuestionTypeInfo(t).short).join(' ');

          return (
            <Link
              key={part.partNumber}
              to={`/${testType}/test/${test.id}?part=${part.partNumber}`}
              className={cn(
                "block p-2.5 rounded-lg transition-colors hover:bg-secondary/50",
                partStarted && !partFinished && "bg-primary/5"
              )}
            >
              <div className={cn(
                "text-sm font-medium truncate",
                partStarted && !partFinished ? "text-primary" : "text-foreground"
              )}>
                Part{part.partNumber} {typeAbbrs}
              </div>
              <div className={cn(
                "flex items-center gap-1.5 text-xs mt-1",
                partStarted && !partFinished ? "text-primary" : "text-muted-foreground"
              )}>
                {partFinished ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    <span className="text-success">Completed</span>
                  </>
                ) : partStarted ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5" />
                    <span>Completed:{partScore.score}/{partScore.totalQuestions}</span>
                  </>
                ) : (
                  <>
                    <Circle className="w-3.5 h-3.5" />
                    <span>Not started</span>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Start Full Test Button */}
      <div className="p-3 pt-0">
        <Link
          to={`/${testType}/test/${test.id}`}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm font-medium transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          Full Test
        </Link>
      </div>
    </div>
  );
}
