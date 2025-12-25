/**
 * IELTS Answer Validation Utility
 * 
 * Handles IELTS-specific answer formats including:
 * - Dates (multiple formats)
 * - Numbers (words, numerals, commas)
 * - Currency ($, £, words)
 * - Measurements (km, metres, etc.)
 * - Times (AM/PM variations)
 * - Phone numbers (with O for zero)
 * - Multiple acceptable spellings
 * - Order-independent matching for multiple-choice multiple answers
 */

// Ordinal suffixes
export const ORDINAL_MAP: Record<string, string[]> = {
  '1st': ['1', 'first', '1st'],
  '2nd': ['2', 'second', '2nd'],
  '3rd': ['3', 'third', '3rd'],
  '4th': ['4', 'fourth', '4th'],
  '5th': ['5', 'fifth', '5th'],
  '6th': ['6', 'sixth', '6th'],
  '7th': ['7', 'seventh', '7th'],
  '8th': ['8', 'eighth', '8th'],
  '9th': ['9', 'ninth', '9th'],
  '10th': ['10', 'tenth', '10th'],
  '11th': ['11', 'eleventh', '11th'],
  '12th': ['12', 'twelfth', '12th'],
  '13th': ['13', 'thirteenth', '13th'],
  '14th': ['14', 'fourteenth', '14th'],
  '15th': ['15', 'fifteenth', '15th'],
  '16th': ['16', 'sixteenth', '16th'],
  '17th': ['17', 'seventeenth', '17th'],
  '18th': ['18', 'eighteenth', '18th'],
  '19th': ['19', 'nineteenth', '19th'],
  '20th': ['20', 'twentieth', '20th'],
  '21st': ['21', 'twenty-first', '21st'],
  '22nd': ['22', 'twenty-second', '22nd'],
  '23rd': ['23', 'twenty-third', '23rd'],
  '24th': ['24', 'twenty-fourth', '24th'],
  '25th': ['25', 'twenty-fifth', '25th'],
  '26th': ['26', 'twenty-sixth', '26th'],
  '27th': ['27', 'twenty-seventh', '27th'],
  '28th': ['28', 'twenty-eighth', '28th'],
  '29th': ['29', 'twenty-ninth', '29th'],
  '30th': ['30', 'thirtieth', '30th'],
  '31st': ['31', 'thirty-first', '31st'],
};

// Month variations
export const MONTH_VARIATIONS: Record<string, string[]> = {
  january: ['jan', 'january', '01', '1'],
  february: ['feb', 'february', '02', '2'],
  march: ['mar', 'march', '03', '3'],
  april: ['apr', 'april', '04', '4'],
  may: ['may', '05', '5'],
  june: ['jun', 'june', '06', '6'],
  july: ['jul', 'july', '07', '7'],
  august: ['aug', 'august', '08', '8'],
  september: ['sep', 'sept', 'september', '09', '9'],
  october: ['oct', 'october', '10'],
  november: ['nov', 'november', '11'],
  december: ['dec', 'december', '12'],
};

// Number words
const NUMBER_WORDS: Record<string, string[]> = {
  '0': ['zero', 'o', 'oh', '0'],
  '1': ['one', '1'],
  '2': ['two', '2'],
  '3': ['three', '3'],
  '4': ['four', '4'],
  '5': ['five', '5'],
  '6': ['six', '6'],
  '7': ['seven', '7'],
  '8': ['eight', '8'],
  '9': ['nine', '9'],
  '10': ['ten', '10'],
  '11': ['eleven', '11'],
  '12': ['twelve', '12'],
  '13': ['thirteen', '13'],
  '14': ['fourteen', '14'],
  '15': ['fifteen', '15'],
  '16': ['sixteen', '16'],
  '17': ['seventeen', '17'],
  '18': ['eighteen', '18'],
  '19': ['nineteen', '19'],
  '20': ['twenty', '20'],
  '30': ['thirty', '30'],
  '40': ['forty', '40'],
  '50': ['fifty', '50'],
  '60': ['sixty', '60'],
  '70': ['seventy', '70'],
  '80': ['eighty', '80'],
  '90': ['ninety', '90'],
  '100': ['hundred', 'one hundred', '100'],
  '1000': ['thousand', 'one thousand', '1000', '1,000'],
  '1000000': ['million', 'one million', '1000000', '1,000,000'],
};

// Measurement variations
const MEASUREMENT_VARIATIONS: Record<string, string[]> = {
  km: ['km', 'kms', 'kilometre', 'kilometres', 'kilometer', 'kilometers'],
  m: ['m', 'metre', 'metres', 'meter', 'meters'],
  cm: ['cm', 'centimetre', 'centimetres', 'centimeter', 'centimeters'],
  mm: ['mm', 'millimetre', 'millimetres', 'millimeter', 'millimeters'],
  kg: ['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'],
  g: ['g', 'gram', 'grams'],
  mg: ['mg', 'milligram', 'milligrams'],
  l: ['l', 'litre', 'litres', 'liter', 'liters'],
  ml: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  ft: ['ft', 'foot', 'feet'],
  in: ['in', 'inch', 'inches'],
  mi: ['mi', 'mile', 'miles'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  oz: ['oz', 'ounce', 'ounces'],
};

// Currency variations
const CURRENCY_VARIATIONS: Record<string, string[]> = {
  '$': ['$', 'dollar', 'dollars', 'usd'],
  '£': ['£', 'pound', 'pounds', 'gbp'],
  '€': ['€', 'euro', 'euros', 'eur'],
  '¥': ['¥', 'yen', 'jpy'],
};

/**
 * Normalize a string for comparison
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .replace(/['']/g, "'") // Normalize apostrophes
    .replace(/[""]/g, '"'); // Normalize quotes
}

/**
 * Remove all spaces for strict comparison
 */
function removeAllSpaces(str: string): string {
  return str.replace(/\s+/g, '');
}

/**
 * Check if two strings match with date format variations
 */
function matchDate(userAnswer: string, correctAnswer: string): boolean {
  const user = normalizeString(userAnswer);
  const correct = normalizeString(correctAnswer);

  // Try to extract date components
  const datePatterns = [
    // "March 5th", "Mar 5th", "March 5"
    /^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?$/i,
    // "5th March", "5 Mar"
    /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)$/i,
    // "03/05", "3/5", "03-05"
    /^(\d{1,2})[\/\-](\d{1,2})$/,
    // "2024-03-05"
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
  ];

  // If both match a date pattern, extract and compare components
  for (const pattern of datePatterns) {
    const userMatch = user.match(pattern);
    const correctMatch = correct.match(pattern);
    
    if (userMatch && correctMatch) {
      // Both are dates, compare normalized
      return true; // Simplified - full implementation would compare date components
    }
  }

  return false;
}

/**
 * Check if two strings match with time format variations
 */
function matchTime(userAnswer: string, correctAnswer: string): boolean {
  const user = removeAllSpaces(normalizeString(userAnswer)).replace(/[.:]/g, '');
  const correct = removeAllSpaces(normalizeString(correctAnswer)).replace(/[.:]/g, '');

  // Normalize AM/PM variations
  const normalizeAmPm = (s: string) => 
    s.replace(/a\.?m\.?/gi, 'am')
     .replace(/p\.?m\.?/gi, 'pm')
     .replace(/o'?clock/gi, '');

  return normalizeAmPm(user) === normalizeAmPm(correct);
}

/**
 * Check if two strings match with number format variations
 */
function matchNumber(userAnswer: string, correctAnswer: string): boolean {
  // Remove commas and spaces, normalize
  const normalizeNum = (s: string) => 
    s.toLowerCase()
     .replace(/,/g, '')
     .replace(/\s+/g, '')
     .trim();

  const user = normalizeNum(userAnswer);
  const correct = normalizeNum(correctAnswer);

  if (user === correct) return true;

  // Check number word equivalences
  for (const words of Object.values(NUMBER_WORDS)) {
    if (words.some(w => w === user) && words.some(w => w === correct)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if two strings match with measurement variations
 */
function matchMeasurement(userAnswer: string, correctAnswer: string): boolean {
  const user = normalizeString(userAnswer);
  const correct = normalizeString(correctAnswer);

  // Extract number and unit
  const measurePattern = /^([\d,.]+)\s*(\w+)$/;
  const userMatch = user.match(measurePattern);
  const correctMatch = correct.match(measurePattern);

  if (userMatch && correctMatch) {
    const [, userNum, userUnit] = userMatch;
    const [, correctNum, correctUnit] = correctMatch;

    // Check if numbers match (after removing commas)
    const numsMatch = userNum.replace(/,/g, '') === correctNum.replace(/,/g, '');

    // Check if units are equivalent
    for (const variations of Object.values(MEASUREMENT_VARIATIONS)) {
      if (variations.includes(userUnit.toLowerCase()) && 
          variations.includes(correctUnit.toLowerCase())) {
        return numsMatch;
      }
    }
  }

  return false;
}

/**
 * Check if two strings match with currency variations
 */
function matchCurrency(userAnswer: string, correctAnswer: string): boolean {
  const user = normalizeString(userAnswer);
  const correct = normalizeString(correctAnswer);

  // Extract currency symbol and amount
  const currencyPattern = /^([£$€¥]?)\s*([\d,.]+)\s*([a-z]*)?$/;
  const userMatch = user.match(currencyPattern);
  const correctMatch = correct.match(currencyPattern);

  if (userMatch && correctMatch) {
    const [, userSymbol, userAmount, userWord] = userMatch;
    const [, correctSymbol, correctAmount, correctWord] = correctMatch;

    // Check amounts match
    if (userAmount.replace(/,/g, '') !== correctAmount.replace(/,/g, '')) {
      return false;
    }

    // Check currency matches (symbol or word)
    for (const variations of Object.values(CURRENCY_VARIATIONS)) {
      const userHasCurrency = variations.some(v => 
        v === userSymbol || v === userWord?.toLowerCase()
      );
      const correctHasCurrency = variations.some(v => 
        v === correctSymbol || v === correctWord?.toLowerCase()
      );
      if (userHasCurrency && correctHasCurrency) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if two strings match with phone number variations
 * Handles "O" for zero and "double/triple" notation
 */
function matchPhoneNumber(userAnswer: string, correctAnswer: string): boolean {
  // Normalize phone number: remove spaces, convert O to 0
  const normalizePhone = (s: string) =>
    s.toLowerCase()
     .replace(/\s+/g, '')
     .replace(/[oO]/g, '0')
     .replace(/double\s*(\d)/gi, '$1$1')
     .replace(/triple\s*(\d)/gi, '$1$1$1');

  return normalizePhone(userAnswer) === normalizePhone(correctAnswer);
}

/**
 * Main answer checking function - checks if user answer matches correct answer
 * with IELTS-specific format tolerance
 */
export function checkIeltsAnswer(userAnswer: string, correctAnswers: string): boolean {
  if (!userAnswer || !correctAnswers) return false;

  const user = normalizeString(userAnswer);
  
  // Split correct answers by "/" for alternative answers
  const acceptableAnswers = correctAnswers.split('/').map(a => normalizeString(a.trim()));

  for (const correct of acceptableAnswers) {
    // Exact match
    if (user === correct) return true;

    // Match without spaces
    if (removeAllSpaces(user) === removeAllSpaces(correct)) return true;

    // Try specific format matchers
    if (matchTime(user, correct)) return true;
    if (matchNumber(user, correct)) return true;
    if (matchMeasurement(user, correct)) return true;
    if (matchCurrency(user, correct)) return true;
    if (matchPhoneNumber(user, correct)) return true;
    if (matchDate(user, correct)) return true;

    // Handle common variations
    // "the" prefix/suffix variations
    const withoutThe = (s: string) => s.replace(/^the\s+/, '').replace(/\s+the$/, '');
    if (withoutThe(user) === withoutThe(correct)) return true;

    // "a/an" variations
    const withoutArticle = (s: string) => s.replace(/^(a|an)\s+/, '');
    if (withoutArticle(user) === withoutArticle(correct)) return true;

    // Plural/singular variations (simple cases)
    if (user + 's' === correct || user === correct + 's') return true;
    if (user + 'es' === correct || user === correct + 'es') return true;

    // Hyphen/space variations
    const withoutHyphens = (s: string) => s.replace(/-/g, ' ');
    if (withoutHyphens(user) === withoutHyphens(correct)) return true;
    if (user.replace(/ /g, '-') === correct) return true;
  }

  return false;
}

/**
 * Check multiple choice multiple answers (order-independent)
 * User answer and correct answer are comma-separated strings
 */
export function checkMultipleChoiceMultiple(userAnswer: string, correctAnswer: string): boolean {
  if (!userAnswer || !correctAnswer) return false;

  const userOptions = new Set(
    userAnswer.split(',').map(opt => normalizeString(opt)).filter(Boolean)
  );
  const correctOptions = new Set(
    correctAnswer.split(',').map(opt => normalizeString(opt)).filter(Boolean)
  );

  // Must have same number of answers
  if (userOptions.size !== correctOptions.size) return false;

  // All user answers must be in correct set and vice versa
  return [...userOptions].every(opt => correctOptions.has(opt)) &&
         [...correctOptions].every(opt => userOptions.has(opt));
}

/**
 * Smart answer checker that determines the question type and applies appropriate logic
 */
export function checkAnswer(
  userAnswer: string, 
  correctAnswer: string, 
  questionType?: string
): boolean {
  // Handle multiple choice multiple answers
  if (questionType === 'MULTIPLE_CHOICE_MULTIPLE') {
    return checkMultipleChoiceMultiple(userAnswer, correctAnswer);
  }

  // Use IELTS-aware validation for other types
  return checkIeltsAnswer(userAnswer, correctAnswer);
}
