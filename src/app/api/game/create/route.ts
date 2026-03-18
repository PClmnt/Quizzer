import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { kv } from '@/lib/kv';
import { GameRoom, PlayerSession, QuizSettings } from '@/types/multiplayer';
import { TriviaApiService } from '@/services/trivia-api';
import { logoQuestions, soundQuestions } from '@/data/questions';

function normalizeSettings(settings: QuizSettings | undefined): QuizSettings | null {
  if (!settings) {
    return null;
  }

  const amount = Number(settings.amount);
  const questionTimeLimit = Number(settings.questionTimeLimit);
  const excludedCategories = settings.excludedCategories ?? [];

  if (!Number.isInteger(amount) || amount < 1 || amount > 50) {
    return null;
  }

  if (!Number.isInteger(questionTimeLimit) || questionTimeLimit < 5 || questionTimeLimit > 300) {
    return null;
  }

  if (settings.category !== undefined && (!Number.isInteger(settings.category) || settings.category < 1)) {
    return null;
  }

  if (
    !Array.isArray(excludedCategories) ||
    excludedCategories.some((categoryId) => !Number.isInteger(categoryId) || categoryId < 1)
  ) {
    return null;
  }

  if (settings.difficulty && !['easy', 'medium', 'hard'].includes(settings.difficulty)) {
    return null;
  }

  if (typeof settings.includeLogos !== 'boolean' || typeof settings.includeSounds !== 'boolean') {
    return null;
  }

  if (
    settings.maxTeams !== undefined &&
    (!Number.isInteger(settings.maxTeams) || settings.maxTeams < 2 || settings.maxTeams > 8)
  ) {
    return null;
  }

  if (
    settings.maxPlayersPerTeam !== undefined &&
    (!Number.isInteger(settings.maxPlayersPerTeam) || settings.maxPlayersPerTeam < 1 || settings.maxPlayersPerTeam > 12)
  ) {
    return null;
  }

  return {
    amount,
    category: settings.category,
    excludedCategories: [...new Set(excludedCategories)],
    difficulty: settings.difficulty,
    includeLogos: settings.includeLogos,
    includeSounds: settings.includeSounds,
    questionTimeLimit,
    maxTeams: settings.maxTeams,
    maxPlayersPerTeam: settings.maxPlayersPerTeam,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerName, settings, gameMode = 'individual' }: { playerName: string; settings: QuizSettings; gameMode?: 'individual' | 'teams' } = body;

    if (!playerName?.trim()) {
      return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
    }

    if (gameMode !== 'individual' && gameMode !== 'teams') {
      return NextResponse.json({ error: 'Invalid game mode' }, { status: 400 });
    }

    const normalizedSettings = normalizeSettings(settings);
    if (!normalizedSettings) {
      return NextResponse.json({ error: 'Invalid quiz settings' }, { status: 400 });
    }

    // Generate IDs
    const gameId = uuidv4();
    const playerId = uuidv4();

    // Fetch trivia questions
    const apiQuestions = await TriviaApiService.getQuestions({
      amount: normalizedSettings.amount,
      category: normalizedSettings.category,
      excludedCategories: normalizedSettings.excludedCategories,
      difficulty: normalizedSettings.difficulty,
      type: 'multiple'
    });

    const triviaQuestions = TriviaApiService.convertToQuizFormat(apiQuestions);
    
    // Create rounds
    const rounds = [];
    
    if (triviaQuestions.length > 0) {
      rounds.push({
        id: 'trivia',
        name: `Trivia Questions (${normalizedSettings.difficulty || 'mixed'})`,
        type: 'general' as const,
        questions: triviaQuestions
      });
    }
    
    if (normalizedSettings.includeLogos) {
      rounds.push(logoQuestions);
    }
    
    if (normalizedSettings.includeSounds) {
      rounds.push(soundQuestions);
    }

    if (rounds.length === 0) {
      return NextResponse.json(
        { error: 'The selected settings did not produce any questions' },
        { status: 400 }
      );
    }

    // Create game room
    const gameRoom: GameRoom = {
      id: gameId,
      hostId: playerId,
      name: `${playerName}'s Quiz`,
      settings: normalizedSettings,
      rounds,
      currentRound: 0,
      currentQuestion: 0,
      phase: 'setup',
      players: [playerId],
      teams: [],
      gameMode,
      questionTimeLimit: normalizedSettings.questionTimeLimit,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create player session
    const playerSession: PlayerSession = {
      id: playerId,
      name: playerName.trim(),
      gameId,
      answers: {},
      score: 0,
      isHost: true,
      joinedAt: new Date()
    };

    // Store in KV
    await Promise.all([
      kv.set(`game:${gameId}`, gameRoom),
      kv.set(`player:${playerId}`, playerSession),
      kv.expire(`game:${gameId}`, 3600), // 1 hour expiry
      kv.expire(`player:${playerId}`, 3600)
    ]);

    return NextResponse.json({
      gameId,
      playerId,
      gameRoom,
      playerSession
    });

  } catch (error) {
    console.error('Error creating game:', error);
    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    );
  }
}
