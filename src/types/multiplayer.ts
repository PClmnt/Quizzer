import { Round } from './quiz';

export interface Team {
  id: string;
  name: string;
  gameId: string;
  playerIds: string[];
  captainId: string;
  score: number;
  color: string;
  createdAt: Date;
}

export interface PlayerSession {
  id: string;
  name: string;
  gameId: string;
  teamId?: string;
  accessCode?: string;
  answers: Record<string, number>;
  score: number;
  isHost: boolean;
  joinedAt: Date;
}

export interface GameRoom {
  id: string;
  roomCode: string;
  hostId: string;
  name: string;
  settings: QuizSettings;
  rounds: Round[];
  currentRound: number;
  currentQuestion: number;
  phase: 'setup' | 'playing' | 'waiting' | 'results' | 'finished';
  players: string[]; // Player IDs
  teams: string[]; // Team IDs
  gameMode: 'individual' | 'teams';
  createdAt: Date;
  updatedAt: Date;
  currentQuestionStartedAt?: Date;
  resultsStartedAt?: Date;
  questionTimeLimit?: number; // seconds
  currentQuestionResult?: QuestionResult;
}

export interface QuizSettings {
  amount: number;
  category?: number;
  excludedCategories?: number[];
  difficulty?: 'easy' | 'medium' | 'hard';
  includeLogos: boolean;
  includeSounds: boolean;
  questionTimeLimit: number; // seconds per question
  maxTeams?: number;
  maxPlayersPerTeam?: number;
}

export interface PlayerAnswer {
  playerId: string;
  teamId?: string;
  questionId: string;
  answerIndex: number;
  answeredAt: Date;
}

export interface QuestionResult {
  questionId: string;
  correctAnswer: number;
  playerResults: {
    playerId: string;
    teamId?: string;
    answerIndex?: number;
    isCorrect: boolean;
    points: number;
  }[];
  teamResults?: {
    teamId: string;
    points: number;
    answeredBy?: string;
  }[];
}

export interface GameEvent {
  type: 'player_joined' | 'player_answered' | 'question_started' | 'question_ended' | 'game_finished' | 'team_created' | 'player_joined_team';
  data: unknown;
  timestamp: Date;
}
