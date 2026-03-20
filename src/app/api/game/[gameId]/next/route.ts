import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { GameRoom, PlayerSession, QuestionResult, Team } from '@/types/multiplayer';
import { getGameRoomByIdentifier } from '@/lib/game-room';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const body = await request.json();
    const { playerId }: { playerId: string } = body;

    // Get game room
    const { gameId: resolvedGameId, gameRoom } = await getGameRoomByIdentifier(gameId);
    if (!resolvedGameId || !gameRoom) {
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

    if (gameRoom.phase !== 'playing' && gameRoom.phase !== 'results') {
      return NextResponse.json(
        { error: 'The game is not currently ready to advance' },
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

    if (gameRoom.phase === 'results') {
      let updatedGameRoom: GameRoom;

      if (gameRoom.currentQuestion < currentRound.questions.length - 1) {
        updatedGameRoom = {
          ...gameRoom,
          currentQuestion: gameRoom.currentQuestion + 1,
          phase: 'playing',
          currentQuestionStartedAt: new Date(),
          currentQuestionResult: undefined,
          resultsStartedAt: undefined,
          updatedAt: new Date()
        };
      } else if (gameRoom.currentRound < gameRoom.rounds.length - 1) {
        updatedGameRoom = {
          ...gameRoom,
          currentRound: gameRoom.currentRound + 1,
          currentQuestion: 0,
          phase: 'playing',
          currentQuestionStartedAt: new Date(),
          currentQuestionResult: undefined,
          resultsStartedAt: undefined,
          updatedAt: new Date()
        };
      } else {
        updatedGameRoom = {
          ...gameRoom,
          phase: 'finished',
          currentQuestionResult: undefined,
          resultsStartedAt: undefined,
          updatedAt: new Date()
        };
      }

      await kv.set(`game:${resolvedGameId}`, updatedGameRoom);

      return NextResponse.json({
        success: true,
        gameRoom: updatedGameRoom
      });
    }

    const players = await Promise.all(
      gameRoom.players.map(id => kv.get<PlayerSession>(`player:${id}`))
    );
    const validPlayers = players.filter(Boolean) as PlayerSession[];

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

    let teams: Team[] = [];
    if (gameRoom.gameMode === 'teams') {
      teams = await Promise.all(
        gameRoom.teams.map(async (teamId) => {
          const team = await kv.get<Team>(`team:${teamId}`);
          if (!team) return null;

          const teamPlayers = updatedPlayers.filter((player) => player.teamId === teamId);
          const teamScore = teamPlayers.reduce((sum, player) => sum + player.score, 0);

          const updatedTeam: Team = {
            ...team,
            score: teamScore
          };

          await kv.set(`team:${teamId}`, updatedTeam);
          return updatedTeam;
        })
      ).then((teamList) => teamList.filter(Boolean) as Team[]);
    }

    const questionResult: QuestionResult = {
      questionId: currentQuestion.id,
      correctAnswer: currentQuestion.correctAnswer,
      playerResults: validPlayers.map((player) => ({
        playerId: player.id,
        teamId: player.teamId,
        answerIndex: player.answers[currentQuestion.id],
        isCorrect: player.answers[currentQuestion.id] === currentQuestion.correctAnswer,
        points: player.answers[currentQuestion.id] === currentQuestion.correctAnswer ? 10 : 0
      })),
      teamResults: gameRoom.gameMode === 'teams'
        ? teams.map((team) => {
            const teamPlayers = validPlayers.filter((player) => player.teamId === team.id);
            const answeredPlayer = teamPlayers.find(
              (player) => player.answers[currentQuestion.id] !== undefined
            );
            const points =
              answeredPlayer &&
              answeredPlayer.answers[currentQuestion.id] === currentQuestion.correctAnswer
                ? 10
                : 0;

            return {
              teamId: team.id,
              points,
              answeredBy: answeredPlayer?.id
            };
          })
        : undefined
    };

    const updatedGameRoom: GameRoom = {
      ...gameRoom,
      phase: 'results',
      currentQuestionResult: questionResult,
      resultsStartedAt: new Date(),
      updatedAt: new Date()
    };

    await kv.set(`game:${resolvedGameId}`, updatedGameRoom);

    return NextResponse.json({
      success: true,
      gameRoom: updatedGameRoom,
      players: updatedPlayers,
      teams,
      questionResult
    });

  } catch (error) {
    console.error('Error advancing game:', error);
    return NextResponse.json(
      { error: 'Failed to advance game' },
      { status: 500 }
    );
  }
}
