import { TriviaApiResponse, TriviaCategoriesResponse, QuizSettings, TriviaApiQuestion, TriviaCategory } from '@/types/trivia-api';
import { Question } from '@/types/quiz';

const BASE_URL = 'https://opentdb.com';
const MAX_QUESTIONS_PER_REQUEST = 50;
const MAX_EXCLUSION_FETCH_ATTEMPTS = 6;

export class TriviaApiService {
  private static sessionToken: string | null = null;
  private static categoriesCache: TriviaCategory[] | null = null;

  static async getSessionToken(): Promise<string> {
    if (this.sessionToken) {
      return this.sessionToken;
    }

    try {
      const response = await fetch(`${BASE_URL}/api_token.php?command=request`);
      const data = await response.json();
      
      if (data.response_code === 0) {
        this.sessionToken = data.token;
        return data.token;
      }
      throw new Error('Failed to get session token');
    } catch {
      console.warn('Could not get session token, proceeding without it');
      return '';
    }
  }

  static async getCategories(): Promise<TriviaCategoriesResponse> {
    if (this.categoriesCache) {
      return { trivia_categories: this.categoriesCache };
    }

    const response = await fetch(`${BASE_URL}/api_category.php`);
    const data: TriviaCategoriesResponse = await response.json();
    this.categoriesCache = data.trivia_categories;
    return data;
  }

  static async getQuestions(settings: QuizSettings): Promise<TriviaApiQuestion[]> {
    const excludedCategories = settings.excludedCategories ?? [];
    const shouldFilterCategories = !settings.category && excludedCategories.length > 0;

    if (!shouldFilterCategories) {
      return this.fetchQuestionsBatch(settings);
    }

    const excludedCategoryNames = await this.getExcludedCategoryNames(excludedCategories);
    if (excludedCategoryNames.size === 0) {
      return this.fetchQuestionsBatch(settings);
    }

    const collectedQuestions: TriviaApiQuestion[] = [];
    const seenQuestions = new Set<string>();
    let attempts = 0;

    while (
      collectedQuestions.length < settings.amount &&
      attempts < MAX_EXCLUSION_FETCH_ATTEMPTS
    ) {
      attempts += 1;

      const remainingQuestions = settings.amount - collectedQuestions.length;
      const batchSize = Math.min(
        MAX_QUESTIONS_PER_REQUEST,
        Math.max(remainingQuestions * 2, remainingQuestions)
      );

      const batchQuestions = await this.fetchQuestionsBatch({
        ...settings,
        amount: batchSize,
      });

      for (const question of batchQuestions) {
        const categoryName = decodeURIComponent(question.category);
        const questionKey = `${question.question}:${question.correct_answer}`;

        if (excludedCategoryNames.has(categoryName) || seenQuestions.has(questionKey)) {
          continue;
        }

        collectedQuestions.push(question);
        seenQuestions.add(questionKey);

        if (collectedQuestions.length === settings.amount) {
          break;
        }
      }
    }

    if (collectedQuestions.length < settings.amount) {
      throw new Error('Not enough questions available after applying your category filters');
    }

    return collectedQuestions;
  }

  private static async fetchQuestionsBatch(settings: QuizSettings): Promise<TriviaApiQuestion[]> {
    const token = await this.getSessionToken();

    const params = new URLSearchParams({
      amount: settings.amount.toString(),
      encode: 'url3986', // URL encoding to handle special characters
    });

    if (settings.category) params.append('category', settings.category.toString());
    if (settings.difficulty) params.append('difficulty', settings.difficulty);
    if (settings.type) params.append('type', settings.type);
    if (token) params.append('token', token);

    const response = await fetch(`${BASE_URL}/api.php?${params}`);
    const data: TriviaApiResponse = await response.json();

    if (data.response_code !== 0) {
      if (data.response_code === 4) {
        // Token expired, reset and try again
        await this.resetSessionToken();
        return this.fetchQuestionsBatch(settings);
      }
      throw new Error(`API Error: ${this.getErrorMessage(data.response_code)}`);
    }

    return data.results;
  }

  private static async getExcludedCategoryNames(excludedCategoryIds: number[]): Promise<Set<string>> {
    const { trivia_categories } = await this.getCategories();
    const excludedCategoryIdSet = new Set(excludedCategoryIds);

    return new Set(
      trivia_categories
        .filter((category) => excludedCategoryIdSet.has(category.id))
        .map((category) => category.name)
    );
  }

  static async resetSessionToken(): Promise<void> {
    if (this.sessionToken) {
      try {
        await fetch(`${BASE_URL}/api_token.php?command=reset&token=${this.sessionToken}`);
      } catch {
        console.warn('Could not reset session token');
      }
    }
    this.sessionToken = null;
  }

  static convertToQuizFormat(apiQuestions: TriviaApiQuestion[]): Question[] {
    return apiQuestions.map((apiQ, index) => {
      // Decode URL-encoded strings
      const question = decodeURIComponent(apiQ.question);
      const correctAnswer = decodeURIComponent(apiQ.correct_answer);
      const incorrectAnswers = apiQ.incorrect_answers.map(ans => decodeURIComponent(ans));
      
      // Shuffle answers and find correct answer index
      const allAnswers = [correctAnswer, ...incorrectAnswers];
      const shuffledAnswers = this.shuffleArray([...allAnswers]);
      const correctIndex = shuffledAnswers.indexOf(correctAnswer);

      return {
        id: `api_${Date.now()}_${index}`,
        question,
        options: shuffledAnswers,
        correctAnswer: correctIndex,
        type: 'general',
        difficulty: apiQ.difficulty,
        category: decodeURIComponent(apiQ.category)
      };
    });
  }

  private static shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private static getErrorMessage(code: number): string {
    switch (code) {
      case 1: return 'Not enough questions available for your criteria';
      case 2: return 'Invalid parameter in request';
      case 3: return 'Token not found';
      case 4: return 'Token has returned all possible questions';
      case 5: return 'Rate limit exceeded';
      default: return `Unknown error (code: ${code})`;
    }
  }
}
