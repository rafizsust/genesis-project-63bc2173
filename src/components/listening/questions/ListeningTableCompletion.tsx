import React from 'react';
import { cn } from '@/lib/utils';
import { QuestionTextWithTools } from '@/components/common/QuestionTextWithTools';
import { TableCell as TableCellData, TableData } from '@/components/admin/ListeningQuestionGroupEditor';

interface ListeningTableCompletionProps {
  testId: string;
  questionId: string;
  tableData: TableData;
  answers: Record<number, string>;
  onAnswerChange: (questionNumber: number, answer: string) => void;
  fontSize: number;
  renderRichText: (text: string) => string;
  tableHeading?: string;
  tableHeadingAlignment?: 'left' | 'center' | 'right';
}

export function ListeningTableCompletion({
  testId,
  questionId,
  tableData,
  answers,
  onAnswerChange,
  fontSize,
  renderRichText,
  tableHeading,
  tableHeadingAlignment = 'left',
}: ListeningTableCompletionProps) {
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
          className="border-collapse"
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

                  // For question cells, split by underscore marker (2+ underscores)
                  const parts = isQuestionCell ? cell.content.split(/_{2,}/) : [cell.content];
                  
                  // Handle answers for cells with blanks
                  const currentAnswerString = answers[cell.question_number!] || '';
                  const currentAnswers = (parts.length - 1 > 1) 
                    ? currentAnswerString.split(',')
                    : [currentAnswerString];

                  return (
                    <td 
                      key={colIndex}
                      className={cn(
                        "bg-white px-3 py-2 text-black align-top",
                        getAlignmentClass(cell.alignment)
                      )}
                      style={{
                        borderRight: '1px solid #000',
                        borderBottom: '1px solid #000',
                        fontSize: `${fontSize}px`,
                        minWidth: '120px',
                      }}
                    >
                      {isQuestionCell ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {parts.map((part, partIndex) => (
                            <React.Fragment key={partIndex}>
                              {/* Text before/after blank */}
                              {part && (
                                <QuestionTextWithTools
                                  testId={testId}
                                  contentId={`${questionId}-row-${rowIndex}-col-${colIndex}-part-${partIndex}`}
                                  text={part}
                                  fontSize={fontSize}
                                  renderRichText={renderRichText}
                                  isActive={false}
                                />
                              )}
                              
                              {/* Input field for blank - Official IELTS style with centered placeholder */}
                              {partIndex < parts.length - 1 && (
                                <input
                                  type="text"
                                  value={currentAnswers[partIndex] || ''}
                                  placeholder={String(cell.question_number)}
                                  onChange={(e) => {
                                    const newAnswers = [...currentAnswers];
                                    newAnswers[partIndex] = e.target.value;
                                    
                                    const updatedAnswer = (parts.length - 1 > 1) 
                                      ? newAnswers.join(',') 
                                      : newAnswers[0];

                                    onAnswerChange(cell.question_number!, updatedAnswer);
                                  }}
                                  className="ielts-input h-7 text-sm font-normal px-2 text-center min-w-[174px] max-w-full rounded-[3px] bg-[hsl(var(--ielts-input-bg,0_0%_100%))] text-foreground transition-colors border border-[hsl(var(--ielts-input-border))] focus:border-[hsl(var(--ielts-input-focus))] focus:border-2 focus:outline-none placeholder:text-center placeholder:font-bold placeholder:text-foreground/70"
                                  style={{
                                    fontFamily: 'var(--font-ielts)',
                                  }}
                                />
                              )}
                            </React.Fragment>
                          ))}
                          
                          {/* If no blanks in content, render just the input with centered placeholder */}
                          {parts.length === 1 && isQuestionCell && (
                            <input
                              type="text"
                              value={currentAnswers[0] || ''}
                              placeholder={String(cell.question_number)}
                              onChange={(e) => onAnswerChange(cell.question_number!, e.target.value)}
                              className="ielts-input h-7 text-sm font-normal px-2 text-center min-w-[174px] max-w-full rounded-[3px] bg-[hsl(var(--ielts-input-bg,0_0%_100%))] text-foreground transition-colors border border-[hsl(var(--ielts-input-border))] focus:border-[hsl(var(--ielts-input-focus))] focus:border-2 focus:outline-none placeholder:text-center placeholder:font-bold placeholder:text-foreground/70"
                              style={{
                                fontFamily: 'var(--font-ielts)',
                              }}
                            />
                          )}
                        </div>
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
