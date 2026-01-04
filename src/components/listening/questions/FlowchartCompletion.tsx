import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ArrowDown, ArrowRight } from 'lucide-react';

interface FlowchartStep {
  id: string;
  label: string;
  questionNumber?: number;
  isBlank?: boolean;
}

interface FlowchartCompletionProps {
  title?: string;
  instruction?: string;
  steps: FlowchartStep[];
  direction?: 'vertical' | 'horizontal';
  answers: Record<number, string>;
  onAnswerChange: (questionNumber: number, answer: string) => void;
  currentQuestion: number;
  fontSize?: number;
}

export function FlowchartCompletion({
  title,
  instruction,
  steps,
  direction = 'vertical',
  answers,
  onAnswerChange,
  currentQuestion,
  fontSize = 14,
}: FlowchartCompletionProps) {
  const isVertical = direction === 'vertical';
  const ArrowIcon = isVertical ? ArrowDown : ArrowRight;

  // FIX 1: Prevent Title/Instruction Duplication
  // If title looks like an instruction (contains "words"), don't render it as a header
  const isTitleInstruction = title && /words|no more than/i.test(title);
  const displayTitle = isTitleInstruction ? null : title;

  return (
    <div className="space-y-3" style={{ fontSize: `${fontSize}px` }}>
      {/* Header Section */}
      <div className="mb-4">
        {displayTitle && (
          <h4 className="font-semibold text-base text-foreground mb-2">{displayTitle}</h4>
        )}
        {instruction && (
          <div className="p-3 bg-muted/50 rounded-lg border border-border">
            <p className="text-sm text-foreground italic">
              {instruction}
            </p>
          </div>
        )}
      </div>
      
      <div className={cn(
        "flex items-center justify-center gap-2",
        isVertical ? "flex-col" : "flex-row flex-wrap"
      )}>
        {steps.map((step, index) => {
          const isActive = step.questionNumber === currentQuestion;
          const answer = step.questionNumber ? answers[step.questionNumber] : undefined;
          const isLast = index === steps.length - 1;

          // FIX 2: Strip Question Number from Text
          // Remove "31.", "(31)", "Q31" from the start of the label to avoid duplication
          let displayLabel = step.label;
          if (step.questionNumber) {
             displayLabel = displayLabel.replace(new RegExp(`^\\(?${step.questionNumber}[\\).\\s]*`, 'i'), '').trim();
          }

          return (
            <div key={step.id} className={cn(
              "flex items-center",
              isVertical ? "flex-col" : "flex-row"
            )}>
              <div
                className={cn(
                  "relative border-2 rounded-lg p-4 min-w-[180px] max-w-[280px] text-center transition-all",
                  isActive
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border bg-card hover:border-muted-foreground/50"
                )}
              >
                {step.isBlank && step.questionNumber ? (
                  <div className="inline items-baseline flex-wrap">
                    {(() => {
                      // Inline Input Logic
                      // Match placeholders: (31), [31], ____, etc.
                      const blankPattern = new RegExp(`\\(${step.questionNumber}\\)|\\[${step.questionNumber}\\]|_{2,}|\\.\\.\\.|______`);
                      const match = displayLabel.match(blankPattern);
                      
                      if (match && match.index !== undefined) {
                        const before = displayLabel.substring(0, match.index);
                        const after = displayLabel.substring(match.index + match[0].length);
                        
                        return (
                          <span className="text-muted-foreground text-sm">
                            {before}
                            <Input
                              type="text"
                              value={answer || ''}
                              onChange={(e) => onAnswerChange(step.questionNumber!, e.target.value)}
                              placeholder={`(${step.questionNumber})`}
                              className={cn(
                                "inline-block h-7 w-[100px] text-sm rounded-[3px] text-center font-bold text-primary mx-1 align-middle",
                                isActive ? "border-primary ring-1 ring-primary/20" : "border-slate-300"
                              )}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {after}
                          </span>
                        );
                      }
                      
                      // Fallback Layout (Label + Input)
                      return (
                        <>
                          {/* Only render label if it still has content after stripping number */}
                          {displayLabel && <p className="text-muted-foreground text-sm mb-2">{displayLabel}</p>}
                          <Input
                            type="text"
                            value={answer || ''}
                            onChange={(e) => onAnswerChange(step.questionNumber!, e.target.value)}
                            placeholder={`(${step.questionNumber})`}
                            className={cn(
                              "h-8 w-full text-sm font-bold text-center text-primary",
                              isActive ? "border-primary" : "border-slate-300"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">{displayLabel}</span>
                )}
              </div>

              {!isLast && (
                <div className={cn(
                  "flex items-center justify-center text-muted-foreground",
                  isVertical ? "py-2" : "px-2"
                )}>
                  <ArrowIcon className="w-5 h-5" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
