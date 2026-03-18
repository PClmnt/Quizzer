import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { GameRoom, PlayerSession, Team } from '@/types/multiplayer';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const body = await request.json();
    const { playerId }: { playerId: string } = body;

    // Get game room
    const gameRoom = await kv.get<GameRoom>(`game:${gameId}`);
    if (!gameRoom) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Check if player is host
    if (gameRoom.hostId !== playerId) {
      return NextResponse.json(
        { error: 'Only the host can advance the game' },
        { status: 403 }
      );
    }

    if (gameRoom.phase !== 'playing') {
      return NextResponse.json(
        { error: 'The game is not currently in progress' },
        { status: 400 }
      );
    }

    const currentRound = gameRoom.rounds[gameRoom.currentRound];
    const currentQuestion = currentRound?.questions[gameRoom.currentQuestion];

    if (!currentQuestion) {
      return NextResponse.json(
        { error: 'No current question found' },
        { status: 400 }
      );
    }

    // Calculate scores for this question
    const players = await Promise.all(
      gameRoom.players.map(id => kv.get<PlayerSession>(`player:${id}`))
    );

    const validPlayers = players.filter(Boolean) as PlayerSession[];
    // Update player scores
    const updatedPlayers = await Promise.all(
      validPlayers.map(async (player) => {
        const playerAnswer = player.answers[currentQuestion.id];
        const isCorrect = playerAnswer === currentQuestion.correctAnswer;
        const points = isCorrect ? 10 : 0;
        
        const updatedPlayer: PlayerSession = {
          ...player,
          score: player.score + points
        };

        await kv.set(`player:${player.id}`, updatedPlayer);
        return updatedPlayer;
      })
    );

    // Update team scores in team mode
    let teams: Team[] = [];
    if (gameRoom.gameMode === 'teams') {
      teams = await Promise.all(
        gameRoom.teams.map(async (teamId) => {
          const team = await kv.get<Team>(`team:${teamId}`);
          if (!team) return null;

          // Calculate team score by summing player scores
          const teamPlayers = updatedPlayers.filter(p => p.teamId === teamId);
          const teamScore = teamPlayers.reduce((sum, player) => sum + player.score, 0);

          const updatedTeam: Team = {
            ...team,
            score: teamScore
          };

          await kv.set(`team:${teamId}`, updatedTeam);
          return updatedTeam;
        })
      ).then(teams => teams.filter(Boolean) as Team[]);
    }

    // Determine next state
    let updatedGameRoom: GameRoom;

    if (gameRoom.currentQuestion < currentRound.questions.length - 1) {
      // Next question in same round
      updatedGameRoom = {
        ...gameRoom,
        currentQuestion: gameRoom.currentQuestion + 1,
        phase: 'playing',
        currentQuestionStartedAt: new Date(),
        updatedAt: new Date()
      };
    } else if (gameRoom.currentRound < gameRoom.rounds.length - 1) {
      // Next round
      updatedGameRoom = {
        ...gameRoom,
        currentRound: gameRoom.currentRound + 1,
        currentQuestion: 0,
        phase: 'playing',
        currentQuestionStartedAt: new Date(),
        updatedAt: new Date()
      };
    } else {
      // Game finished
      updatedGameRoom = {
        ...gameRoom,
        phase: 'finished',
        updatedAt: new Date()
      };
    }

    await kv.set(`game:${gameId}`, updatedGameRoom);

    return NextResponse.json({
      success: true,
      gameRoom: updatedGameRoom,
      players: updatedPlayers,
      teams,
      questionResult: {
        questionId: currentQuestion.id,
        correctAnswer: currentQuestion.correctAnswer,
        playerResults: validPlayers.map(player => ({
          playerId: player.id,
          teamId: player.teamId,
          answerIndex: player.answers[currentQuestion.id],
          isCorrect: player.answers[currentQuestion.id] === currentQuestion.correctAnswer,
          points: player.answers[currentQuestion.id] === currentQuestion.correctAnswer ? 10 : 0
        })),
        teamResults: gameRoom.gameMode === 'teams' ? teams.map(team => {
          const teamPlayers = validPlayers.filter(p => p.teamId === team.id);
          const answeredPlayer = teamPlayers.find(p => p.answers[currentQuestion.id] !== undefined);
          const points = answeredPlayer && answeredPlayer.answers[currentQuestion.id] === currentQuestion.correctAnswer ? 10 : 0;
          
          return {
            teamId: team.id,
            points,
            answeredBy: answeredPlayer?.id
          };
        }) : undefined
      }
    });

  } catch (error) {
    console.error('Error advancing game:', error);
    return NextResponse.json(
      { error: 'Failed to advance game' },
      { status: 500 }
    );
  }
}
