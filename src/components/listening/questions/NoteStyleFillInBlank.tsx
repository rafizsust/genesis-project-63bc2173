import { cn } from '@/lib/utils';
import { renderRichText } from '@/components/admin/RichTextEditor';

export interface NoteItem {
  text: string;
  hasBlank: boolean;
  suffixText?: string;
  questionNumber?: number;
}

export interface NoteCategory {
  label: string;
  items: NoteItem[];
}

interface Question {
  id: string;
  question_number: number;
  question_text: string;
  instruction?: string | null;
  is_given: boolean;
  heading?: string | null;
  correct_answer: string;
}

interface NoteStyleFillInBlankProps {
  questions: Question[];
  answers: Record<number, string>;
  onAnswerChange: (questionNumber: number, answer: string) => void;
  fontSize?: number;
  noteCategories?: NoteCategory[];
}

/**
 * Parses question data to extract note structure.
 * Uses the heading field to group questions into categories.
 */
function parseNoteStructureFromQuestions(questions: Question[]): NoteCategory[] {
  const categoryMap = new Map<string, { label: string; items: NoteItem[] }>();
  
  for (const q of questions) {
    const categoryLabel = q.heading || 'Notes';
    
    if (!categoryMap.has(categoryLabel)) {
      categoryMap.set(categoryLabel, { label: categoryLabel, items: [] });
    }
    
    const category = categoryMap.get(categoryLabel)!;
    
    // Parse the question text for blanks (format: "prefix___suffix")
    const text = q.question_text;
    const hasBlank = /_{2,10}/.test(text);
    
    if (hasBlank) {
      const parts = text.split(/_{2,10}/);
      const prefix = parts[0]?.trim() || '';
      const suffix = parts[1]?.trim() || '';
      
      category.items.push({
        text: prefix,
        hasBlank: true,
        suffixText: suffix,
        questionNumber: q.question_number,
      });
    } else if (!q.is_given) {
      // Non-blank item (static text)
      category.items.push({
        text: text.replace(/^-\s*/, '').trim(),
        hasBlank: false,
      });
    }
  }
  
  return Array.from(categoryMap.values());
}

/**
 * Assigns question numbers to note categories based on start question number.
 */
function assignQuestionNumbers(categories: NoteCategory[], startQuestionNumber: number): NoteCategory[] {
  let questionNum = startQuestionNumber;
  
  return categories.map(category => ({
    ...category,
    items: category.items.map(item => {
      if (item.hasBlank) {
        return { ...item, questionNumber: questionNum++ };
      }
      return item;
    })
  }));
}

export function NoteStyleFillInBlank({
  questions,
  answers,
  onAnswerChange,
  fontSize = 14,
  noteCategories,
}: NoteStyleFillInBlankProps) {
  // Use provided noteCategories or parse from questions
  let categories: NoteCategory[];
  
  if (noteCategories && noteCategories.length > 0) {
    // Use provided categories and assign question numbers
    const startNum = questions.length > 0 ? Math.min(...questions.map(q => q.question_number)) : 1;
    categories = assignQuestionNumbers(noteCategories, startNum);
  } else {
    // Fall back to parsing from questions
    categories = parseNoteStructureFromQuestions(questions);
  }

  if (categories.length === 0) {
    return (
      <div className="text-muted-foreground text-sm italic">
        No note structure available. Please configure categories in the admin panel.
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4" style={{ fontSize: `${fontSize}px` }}>
      {categories.map((category, catIdx) => (
        <div key={catIdx} className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          {/* Category Label (left column) - Bold, aligned with first item */}
          <div 
            className="font-semibold text-foreground whitespace-nowrap pt-0.5"
            dangerouslySetInnerHTML={{ __html: renderRichText(category.label) }}
          />
          
          {/* Items (right column) */}
          <div className="space-y-1">
            {category.items.map((item, itemIdx) => (
              <div 
                key={itemIdx} 
                className="flex items-center gap-1 flex-wrap leading-[2]"
              >
                {/* Bullet/dash */}
                <span className="text-foreground flex-shrink-0">-</span>
                
                {/* Prefix text (before blank) */}
                {item.text && (
                  <span 
                    className="text-foreground"
                    dangerouslySetInnerHTML={{ __html: renderRichText(item.text) }}
                  />
                )}
                
                {/* Input field if this item has a blank */}
                {item.hasBlank && item.questionNumber !== undefined && (
                  <span className="inline-flex items-center">
                    <input
                      type="text"
                      value={answers[item.questionNumber] || ''}
                      onChange={(e) => onAnswerChange(item.questionNumber!, e.target.value)}
                      placeholder={String(item.questionNumber)}
                      className={cn(
                        "ielts-input h-7 text-sm font-normal px-2 min-w-[174px] max-w-full rounded-[3px] text-center",
                        "placeholder:text-center placeholder:font-bold placeholder:text-foreground/70",
                        "bg-background border border-[hsl(var(--ielts-input-border))] text-foreground",
                        "focus:outline-none focus:border-[hsl(var(--ielts-input-focus))] focus:ring-0",
                        "transition-colors"
                      )}
                    />
                  </span>
                )}
                
                {/* Suffix text (after blank) */}
                {item.suffixText && (
                  <span 
                    className="text-foreground"
                    dangerouslySetInnerHTML={{ __html: renderRichText(item.suffixText) }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
