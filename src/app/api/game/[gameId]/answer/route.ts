import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { PlayerSession, GameRoom, Team } from '@/types/multiplayer';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const body = await request.json();
    const { playerId, questionId, answerIndex }: {
      playerId: string;
      questionId: string;
      answerIndex: number;
    } = body;

    if (!playerId || !questionId || answerIndex === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(answerIndex)) {
      return NextResponse.json(
        { error: 'Answer index must be an integer' },
        { status: 400 }
      );
    }

    // Get player session and game room
    const [playerSession, gameRoom] = await Promise.all([
      kv.get<PlayerSession>(`player:${playerId}`),
      kv.get<GameRoom>(`game:${gameId}`)
    ]);

    if (!playerSession || playerSession.gameId !== gameId) {
      return NextResponse.json(
        { error: 'Player not found or not in this game' },
        { status: 404 }
      );
    }

    if (!gameRoom) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    if (gameRoom.phase !== 'playing') {
      return NextResponse.json(
        { error: 'The game is not currently accepting answers' },
        { status: 400 }
      );
    }

    const currentRound = gameRoom.rounds[gameRoom.currentRound];
    const currentQuestion = currentRound?.questions[gameRoom.currentQuestion];

    if (!currentQuestion) {
      return NextResponse.json(
        { error: 'No active question found' },
        { status: 400 }
      );
    }

    if (currentQuestion.id !== questionId) {
      return NextResponse.json(
        { error: 'This is not the current question' },
        { status: 400 }
      );
    }

    if (answerIndex < 0 || answerIndex >= currentQuestion.options.length) {
      return NextResponse.json(
        { error: 'Answer index is out of range' },
        { status: 400 }
      );
    }

    if (playerSession.answers[questionId] !== undefined) {
      return NextResponse.json(
        { error: 'You have already answered this question' },
        { status: 400 }
      );
    }

    // In team mode, check if another team member already answered
    if (gameRoom.gameMode === 'teams') {
      if (!playerSession.teamId) {
        return NextResponse.json(
          { error: 'Join a team before answering in team mode' },
          { status: 400 }
        );
      }

      const team = await kv.get<Team>(`team:${playerSession.teamId}`);

      if (!team || team.gameId !== gameId) {
        return NextResponse.json(
          { error: 'Team not found for this game' },
          { status: 400 }
        );
      }

      // Check if any team member already answered this question
      const teamMembers = await Promise.all(
        team.playerIds.map(id => kv.get<PlayerSession>(`player:${id}`))
      );
      
      const alreadyAnswered = teamMembers.some(
        member => member && member.answers[questionId] !== undefined
      );
      
      if (alreadyAnswered) {
        return NextResponse.json(
          { error: 'A team member has already answered this question' },
          { status: 400 }
        );
      }
    }

    // Update player's answer
    const updatedPlayer: PlayerSession = {
      ...playerSession,
      answers: {
        ...playerSession.answers,
        [questionId]: answerIndex
      }
    };

    await kv.set(`player:${playerId}`, updatedPlayer);

    return NextResponse.json({
      success: true,
      playerSession: updatedPlayer
    });

  } catch (error) {
    console.error('Error submitting answer:', error);
    return NextResponse.json(
      { error: 'Failed to submit answer' },
      { status: 500 }
    );
  }
}
