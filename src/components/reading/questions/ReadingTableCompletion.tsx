import { cn } from '@/lib/utils';
import { QuestionTextWithTools } from '@/components/common/QuestionTextWithTools';

interface TableCellData {
  has_question: boolean;
  content: string;
  correct_answer?: string;
  question_number?: number;
  alignment?: 'left' | 'center' | 'right';
}

type TableRowData = TableCellData[];
type TableData = TableRowData[];

interface ReadingTableCompletionProps {
  testId: string;
  questionId: string;
  tableData: TableData;
  answers: Record<number, string>;
  onAnswerChange: (questionNumber: number, answer: string) => void;
  currentQuestion: number;
  setCurrentQuestion: (num: number) => void;
  fontSize: number;
  renderRichText: (text: string) => string;
  tableHeading?: string;
  tableHeadingAlignment?: 'left' | 'center' | 'right';
}

export function ReadingTableCompletion({
  testId,
  questionId,
  tableData,
  answers,
  onAnswerChange,
  currentQuestion: _currentQuestion,
  setCurrentQuestion,
  fontSize,
  renderRichText,
  tableHeading,
  tableHeadingAlignment = 'left',
}: ReadingTableCompletionProps) {
  // First row is treated as headers
  const headerRow = tableData.length > 0 ? tableData[0] : [];
  const bodyRows = tableData.length > 1 ? tableData.slice(1) : [];

  // Get alignment class
  const getAlignmentClass = (alignment?: string) => {
    switch (alignment) {
      case 'center': return 'text-center';
      case 'right': return 'text-right';
      default: return 'text-left';
    }
  };

  return (
    <div className="mt-4">
      {/* Optional Table Heading */}
      {tableHeading && (
        <div 
          className={cn(
            "mb-2 font-bold text-foreground",
            getAlignmentClass(tableHeadingAlignment)
          )}
          style={{ fontSize: `${fontSize}px` }}
        >
          <QuestionTextWithTools
            testId={testId}
            contentId={`${questionId}-table-heading`}
            text={tableHeading}
            fontSize={fontSize}
            renderRichText={renderRichText}
            isActive={false}
          />
        </div>
      )}

      {/* Table - Official IELTS Style */}
      <div className="overflow-x-auto">
        <table 
          className="border-collapse w-full table-fixed"
          style={{ 
            borderTop: '1px solid #000',
            borderLeft: '1px solid #000',
          }}
        >
          {/* Header Row - White background, bold text, black borders */}
          {headerRow.length > 0 && (
            <thead>
              <tr>
                {headerRow.map((cell: TableCellData, colIndex) => (
                  <th 
                    key={colIndex}
                    className={cn(
                      "bg-white px-3 py-2 font-bold text-black",
                      getAlignmentClass(cell.alignment)
                    )}
                    style={{
                      borderRight: '1px solid #000',
                      borderBottom: '1px solid #000',
                      fontSize: `${fontSize}px`,
                      minWidth: '120px',
                    }}
                  >
                    <QuestionTextWithTools
                      testId={testId}
                      contentId={`${questionId}-header-${colIndex}`}
                      text={cell.content}
                      fontSize={fontSize}
                      renderRichText={renderRichText}
                      isActive={false}
                    />
                  </th>
                ))}
              </tr>
            </thead>
          )}

          {/* Body Rows */}
          <tbody>
            {bodyRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell: TableCellData, colIndex) => {
                  const isQuestionCell = cell.has_question;
                  
                  // Check if content has inline blanks (2+ underscores)
                  const hasInlineBlank = /_{2,}/.test(cell.content);
                  
                  // For question cells with inline blanks, split by underscore pattern
                  const parts = hasInlineBlank ? cell.content.split(/_{2,}/) : [cell.content];
                  
                  // Handle answers for cells with blanks
                  const currentAnswerString = answers[cell.question_number!] || '';
                  const currentAnswers = (parts.length - 1 > 1) 
                    ? currentAnswerString.split(',')
                    : [currentAnswerString];

                  return (
                    <td 
                      key={colIndex}
                      className={cn(
                        "bg-white px-3 py-2 text-black align-top break-words",
                        getAlignmentClass(cell.alignment)
                      )}
                      style={{
                        borderRight: '1px solid #000',
                        borderBottom: '1px solid #000',
                        fontSize: `${fontSize}px`,
                        minWidth: '120px',
                        maxWidth: '300px',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                      }}
                      onClick={() => {
                        if (cell.question_number) {
                          setCurrentQuestion(cell.question_number);
                        }
                      }}
                    >
                      {isQuestionCell ? (
                        <span className="text-black" style={{ lineHeight: '2.2' }}>
                          {hasInlineBlank ? (
                            // Render content with inline input boxes - all inline
                            parts.map((part, partIndex) => (
                              <span key={partIndex}>
                                {/* Text before/after blank */}
                                {part && (
                                  <QuestionTextWithTools
                                    testId={testId}
                                    contentId={`${questionId}-row-${rowIndex}-col-${colIndex}-part-${partIndex}`}
                                    text={part}
                                    fontSize={fontSize}
                                    renderRichText={renderRichText}
                                    isActive={false}
                                    as="span"
                                  />
                                )}
                                
                                {/* Input field for blank - inline with text */}
                                {partIndex < parts.length - 1 && (
                                  <input
                                    type="text"
                                    value={currentAnswers[partIndex] || ''}
                                    onChange={(e) => {
                                      const newAnswers = [...currentAnswers];
                                      newAnswers[partIndex] = e.target.value;
                                      
                                      const updatedAnswer = (parts.length - 1 > 1) 
                                        ? newAnswers.join(',') 
                                        : newAnswers[0];

                                      onAnswerChange(cell.question_number!, updatedAnswer);
                                    }}
                                    onFocus={() => setCurrentQuestion(cell.question_number!)}
                                    placeholder={String(cell.question_number)}
                                    className={cn(
                                      "ielts-input h-7 text-sm font-normal px-2 w-28 rounded-[3px] text-center placeholder:text-center placeholder:font-bold placeholder:text-foreground/70",
                                      "bg-background border border-[hsl(var(--ielts-input-border))] text-foreground",
                                      "focus:outline-none focus:border-[hsl(var(--ielts-input-focus))] focus:ring-0",
                                      "transition-colors inline align-middle mx-1"
                                    )}
                                  />
                                )}
                              </span>
                            ))
                          ) : (
                            // Question cell without inline blanks - show standalone input inline
                            <>
                              <QuestionTextWithTools
                                testId={testId}
                                contentId={`${questionId}-row-${rowIndex}-col-${colIndex}-text`}
                                text={cell.content}
                                fontSize={fontSize}
                                renderRichText={renderRichText}
                                isActive={false}
                                as="span"
                              />
                              {' '}
                              <input
                                type="text"
                                value={currentAnswers[0] || ''}
                                onChange={(e) => onAnswerChange(cell.question_number!, e.target.value)}
                                onFocus={() => setCurrentQuestion(cell.question_number!)}
                                placeholder={String(cell.question_number)}
                                className={cn(
                                  "ielts-input h-7 text-sm font-normal px-2 w-28 rounded-[3px] text-center placeholder:text-center placeholder:font-bold placeholder:text-foreground/70",
                                  "bg-background border border-[hsl(var(--ielts-input-border))] text-foreground",
                                  "focus:outline-none focus:border-[hsl(var(--ielts-input-focus))] focus:ring-0",
                                  "transition-colors inline align-middle"
                                )}
                              />
                            </>
                          )}
                        </span>
                      ) : (
                        <QuestionTextWithTools
                          testId={testId}
                          contentId={`${questionId}-row-${rowIndex}-col-${colIndex}`}
                          text={cell.content}
                          fontSize={fontSize}
                          renderRichText={renderRichText}
                          isActive={false}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
