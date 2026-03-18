export interface TriviaApiQuestion {
  type: 'multiple' | 'boolean';
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export interface TriviaApiResponse {
  response_code: number;
  results: TriviaApiQuestion[];
}

export interface TriviaCategory {
  id: number;
  name: string;
}

export interface TriviaCategoriesResponse {
  trivia_categories: TriviaCategory[];
}

export interface QuizSettings {
  amount: number;
  category?: number;
  excludedCategories?: number[];
  difficulty?: 'easy' | 'medium' | 'hard';
  type?: 'multiple' | 'boolean';
}
