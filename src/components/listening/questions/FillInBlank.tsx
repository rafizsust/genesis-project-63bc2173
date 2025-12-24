import { cn } from '@/lib/utils';
import { QuestionTextWithTools } from '@/components/common/QuestionTextWithTools';

interface Question {
  id: string;
  question_number: number;
  question_text: string;
  instruction?: string | null;
  is_given: boolean;
  heading?: string | null;
  correct_answer: string;
}

interface FillInBlankProps {
  testId: string;
  question: Question;
  answer: string | undefined;
  onAnswerChange: (answer: string) => void;
  renderRichText: (text: string) => string;
  stripLeadingQuestionNumber: (text: string, questionNumber: number) => string;
  isActive?: boolean;
}

export function FillInBlank({ 
  testId, 
  question, 
  answer, 
  onAnswerChange, 
  renderRichText, 
  stripLeadingQuestionNumber,
  isActive: _isActive = false,
}: FillInBlankProps) {
  const hasInlineBlank = /_{2,10}/.test(question.question_text);

  // If it's a given answer and there are no inline blanks,
  // this component should not render an input. The parent will render the question text.
  if (question.is_given && !hasInlineBlank) {
    return null;
  }

  // Handle 'is_given' questions with inline blanks
  if (question.is_given && hasInlineBlank) {
    const givenAnswer = question.correct_answer.split(' / ')[0];
    const parts = question.question_text.split(/_{2,10}/);
    
    let modifiedText = '';
    if (parts.length > 0) {
      modifiedText += stripLeadingQuestionNumber(parts[0], question.question_number); 
      if (parts.length > 1) {
        modifiedText += `<strong>${givenAnswer}</strong>`;
        for (let i = 1; i < parts.length; i++) {
          modifiedText += parts[i]; 
        }
      }
    }

    return (
      <div 
        onClick={(e) => e.stopPropagation()}
        className="leading-relaxed"
      >
        <div className={cn(
          "flex flex-wrap items-center gap-1",
          "text-foreground"
        )}>
          <QuestionTextWithTools
            testId={testId}
            contentId={`${question.id}-given-text`}
            text={modifiedText}
            fontSize={14}
            renderRichText={renderRichText}
            isActive={false}
          />
        </div>
      </div>
    );
  }

  // Handle regular fill-in-the-blank questions with inline blanks
  if (hasInlineBlank) {
    const parts = question.question_text.split(/_{2,10}/);
    
    const currentAnswerString = answer || '';
    const currentAnswers = (parts.length - 1 > 1) 
      ? currentAnswerString.split(',')
      : [currentAnswerString];

    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="leading-[2.2]"
      >
        <span className="text-foreground whitespace-pre-wrap">
          {parts.map((part, idx) => (
            <span key={idx} className="align-middle">
              <QuestionTextWithTools
                testId={testId}
                contentId={`${question.id}-part-${idx}`}
                text={stripLeadingQuestionNumber(part, question.question_number)}
                fontSize={14}
                renderRichText={renderRichText}
                isActive={false}
                as="span"
              />
              {idx < parts.length - 1 && (
                <input
                  type="text"
                  value={currentAnswers[idx] || ''}
                  onChange={(e) => {
                    const newAnswers = [...currentAnswers];
                    newAnswers[idx] = e.target.value;
                    
                    const updatedAnswer = (parts.length - 1 > 1) 
                      ? newAnswers.join(',') 
                      : newAnswers[0];

                    onAnswerChange(updatedAnswer);
                  }}
                  placeholder={String(question.question_number)}
                  className={cn(
                    "ielts-input h-7 text-sm font-normal px-2 min-w-[174px] max-w-full rounded-[3px] text-center placeholder:text-center placeholder:font-bold placeholder:text-foreground/70",
                    "bg-background border border-[hsl(var(--ielts-input-border))] text-foreground",
                    "focus:outline-none focus:border-[hsl(var(--ielts-input-focus))] focus:ring-0",
                    "transition-colors align-middle mx-1"
                  )}
                />
              )}
            </span>
          ))}
        </span>
      </div>
    );
  }

  // Default: Show standalone input with question number as centered placeholder
  return (
    <div onClick={(e) => e.stopPropagation()} className="leading-relaxed">
      <input
        type="text"
        value={answer || ''}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder={String(question.question_number)}
        className={cn(
          "ielts-input h-7 text-sm font-normal px-2 min-w-[174px] max-w-full rounded-[3px] text-center placeholder:text-center placeholder:font-bold placeholder:text-foreground/70",
          "bg-background border border-[hsl(var(--ielts-input-border))] text-foreground",
          "focus:outline-none focus:border-[hsl(var(--ielts-input-focus))] focus:ring-0",
          "transition-colors"
        )}
      />
    </div>
  );
}
