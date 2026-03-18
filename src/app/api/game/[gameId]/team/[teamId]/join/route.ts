import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { GameRoom, Team, PlayerSession } from '@/types/multiplayer';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; teamId: string }> }
) {
  try {
    const { gameId, teamId } = await params;
    const body = await request.json();
    const { playerId } = body;

    if (!playerId) {
      return NextResponse.json({ error: 'Player ID is required' }, { status: 400 });
    }

    // Get game room, team, and player
    const [gameRoom, team, player] = await Promise.all([
      kv.get<GameRoom>(`game:${gameId}`),
      kv.get<Team>(`team:${teamId}`),
      kv.get<PlayerSession>(`player:${playerId}`)
    ]);

    if (!gameRoom) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    if (gameRoom.gameMode !== 'teams') {
      return NextResponse.json({ error: 'Game is not in team mode' }, { status: 400 });
    }

    if (gameRoom.phase !== 'setup') {
      return NextResponse.json({ error: 'Teams can only be changed during setup' }, { status: 400 });
    }

    if (player.gameId !== gameId) {
      return NextResponse.json({ error: 'Player is not in this game' }, { status: 400 });
    }

    if (team.gameId !== gameId || !gameRoom.teams.includes(teamId)) {
      return NextResponse.json({ error: 'Team does not belong to this game' }, { status: 400 });
    }

    // Check if player is already in a team
    if (player.teamId || team.playerIds.includes(playerId)) {
      return NextResponse.json({ error: 'Player is already in a team' }, { status: 400 });
    }

    // Check if team is full
    if (gameRoom.settings.maxPlayersPerTeam && 
        team.playerIds.length >= gameRoom.settings.maxPlayersPerTeam) {
      return NextResponse.json({ error: 'Team is full' }, { status: 400 });
    }

    const updatedTeam: Team = {
      ...team,
      playerIds: [...team.playerIds, playerId],
    };

    const updatedPlayer: PlayerSession = {
      ...player,
      teamId,
    };

    // If team had no captain, make this player the captain
    if (!updatedTeam.captainId) {
      updatedTeam.captainId = playerId;
    }

    const updatedGameRoom: GameRoom = {
      ...gameRoom,
      updatedAt: new Date(),
    };

    // Update storage
    await Promise.all([
      kv.set(`team:${teamId}`, updatedTeam),
      kv.set(`player:${playerId}`, updatedPlayer),
      kv.set(`game:${gameId}`, updatedGameRoom),
    ]);

    return NextResponse.json({ team: updatedTeam, player: updatedPlayer });
  } catch (error) {
    console.error('Error joining team:', error);
    return NextResponse.json(
      { error: 'Failed to join team' },
      { status: 500 }
    );
  }
}
