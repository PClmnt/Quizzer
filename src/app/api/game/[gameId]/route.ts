import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { PlayerSession, Team } from "@/types/multiplayer";
import { getGameRoomByIdentifier } from "@/lib/game-room";

function toPublicPlayerSession(playerSession: PlayerSession): PlayerSession {
  const publicPlayerSession = { ...playerSession };
  delete publicPlayerSession.accessCode;
  return publicPlayerSession;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    // Get player ID from query params to determine if this is the host
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get("playerId");

    const { gameId: resolvedGameId, gameRoom } = await getGameRoomByIdentifier(gameId);
    if (!resolvedGameId || !gameRoom) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Get all player sessions
    const players = await Promise.all(
      gameRoom.players.map(async (playerId) => {
        const player = await kv.get<PlayerSession>(`player:${playerId}`);
        return player;
      })
    );

    const validPlayers = players.filter(Boolean) as PlayerSession[];
    const publicPlayers = validPlayers.map(toPublicPlayerSession);
    const currentPlayer = playerId
      ? validPlayers.find((player) => player.id === playerId) ?? null
      : null;

    // Get teams if in team mode
    let teams: Team[] = [];
    if (gameRoom.gameMode === "teams") {
      const teamData = await Promise.all(
        gameRoom.teams.map(async (teamId) => {
          const team = await kv.get<Team>(`team:${teamId}`);
          return team;
        })
      );
      teams = teamData.filter(Boolean) as Team[];
    }

    // Create a copy of gameRoom for the response
    let responseGameRoom: unknown = { ...gameRoom };

    const revealedQuestionId =
      gameRoom.phase === "results" ? gameRoom.currentQuestionResult?.questionId : null;

    // If the requester is NOT the host, remove correct answer indexes from questions
    const isHost = playerId && gameRoom.hostId === playerId;
    if (!isHost) {
      responseGameRoom = {
        ...gameRoom,
        rounds: gameRoom.rounds.map((round) => ({
          ...round,
          questions: round.questions.map((question) => {
            if (question.id === revealedQuestionId) {
              return question;
            }

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { correctAnswer, ...questionWithoutAnswer } = question;
            return questionWithoutAnswer;
          }),
        })),
      };
    }

    return NextResponse.json({
      gameRoom: responseGameRoom,
      players: publicPlayers,
      teams,
      playerAccessCode: currentPlayer?.accessCode ?? null,
    });
  } catch (error) {
    console.error("Error fetching game:", error);
    return NextResponse.json(
      { error: "Failed to fetch game" },
      { status: 500 }
    );
  }
}
