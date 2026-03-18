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
        { error: 'Only the host can start the game' },
        { status: 403 }
      );
    }

    if (gameRoom.phase !== 'setup') {
      return NextResponse.json(
        { error: 'Game has already started' },
        { status: 400 }
      );
    }

    if (gameRoom.rounds.length === 0) {
      return NextResponse.json(
        { error: 'Cannot start a game without questions' },
        { status: 400 }
      );
    }

    if (gameRoom.gameMode === 'teams') {
      const [players, teams] = await Promise.all([
        Promise.all(gameRoom.players.map((id) => kv.get<PlayerSession>(`player:${id}`))),
        Promise.all(gameRoom.teams.map((id) => kv.get<Team>(`team:${id}`))),
      ]);

      const validPlayers = players.filter(Boolean) as PlayerSession[];
      const validTeams = teams.filter(Boolean) as Team[];

      if (validTeams.length === 0) {
        return NextResponse.json(
          { error: 'Create at least one team before starting the game' },
          { status: 400 }
        );
      }

      const hasEmptyTeam = validTeams.some((team) => team.playerIds.length === 0);
      if (hasEmptyTeam) {
        return NextResponse.json(
          { error: 'Each team must have at least one player' },
          { status: 400 }
        );
      }

      const hasUnassignedPlayers = validPlayers.some((player) => !player.teamId);
      if (hasUnassignedPlayers) {
        return NextResponse.json(
          { error: 'Every player must join a team before the game starts' },
          { status: 400 }
        );
      }
    }

    // Start the game
    const updatedGameRoom: GameRoom = {
      ...gameRoom,
      phase: 'playing',
      currentQuestionStartedAt: new Date(),
      updatedAt: new Date()
    };

    await kv.set(`game:${gameId}`, updatedGameRoom);

    return NextResponse.json({
      success: true,
      gameRoom: updatedGameRoom
    });

  } catch (error) {
    console.error('Error starting game:', error);
    return NextResponse.json(
      { error: 'Failed to start game' },
      { status: 500 }
    );
  }
}
