import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { kv } from '@/lib/kv';
import { GameRoom, PlayerSession, Team } from '@/types/multiplayer';

const TEAM_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#F06292', // Pink
  '#AED581', // Light Green
  '#FFD93D', // Yellow
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const body = await request.json();
    const { teamName, playerId } = body;

    if (!teamName?.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
    }

    if (!playerId) {
      return NextResponse.json({ error: 'Player ID is required' }, { status: 400 });
    }

    const [gameRoom, player] = await Promise.all([
      kv.get<GameRoom>(`game:${gameId}`),
      kv.get<PlayerSession>(`player:${playerId}`),
    ]);

    if (!gameRoom) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (!player || player.gameId !== gameId) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    if (gameRoom.gameMode !== 'teams') {
      return NextResponse.json({ error: 'Game is not in team mode' }, { status: 400 });
    }

    if (gameRoom.phase !== 'setup') {
      return NextResponse.json({ error: 'Teams can only be created during setup' }, { status: 400 });
    }

    if (player.teamId) {
      return NextResponse.json({ error: 'Player is already in a team' }, { status: 400 });
    }

    // Check if max teams reached
    if (gameRoom.settings.maxTeams && gameRoom.teams.length >= gameRoom.settings.maxTeams) {
      return NextResponse.json({ error: 'Maximum teams reached' }, { status: 400 });
    }

    const existingTeams = await Promise.all(
      gameRoom.teams.map((existingTeamId) => kv.get<Team>(`team:${existingTeamId}`))
    );

    const normalizedTeamName = teamName.trim().toLowerCase();
    const teamNameExists = existingTeams.some(
      (existingTeam) => existingTeam?.name.trim().toLowerCase() === normalizedTeamName
    );

    if (teamNameExists) {
      return NextResponse.json({ error: 'Team name already taken' }, { status: 400 });
    }

    // Create team
    const teamId = uuidv4();
    const team: Team = {
      id: teamId,
      name: teamName.trim(),
      gameId,
      playerIds: [playerId],
      captainId: playerId,
      score: 0,
      color: TEAM_COLORS[gameRoom.teams.length % TEAM_COLORS.length],
      createdAt: new Date()
    };

    const updatedGameRoom: GameRoom = {
      ...gameRoom,
      teams: [...gameRoom.teams, teamId],
      updatedAt: new Date(),
    };

    const updatedPlayer: PlayerSession = {
      ...player,
      teamId,
    };

    // Store team and update game
    await Promise.all([
      kv.set(`team:${teamId}`, team),
      kv.set(`game:${gameId}`, updatedGameRoom),
      kv.set(`player:${playerId}`, updatedPlayer),
      kv.expire(`team:${teamId}`, 3600), // 1 hour expiry
    ]);

    return NextResponse.json({ team, gameRoom: updatedGameRoom, player: updatedPlayer });
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json(
      { error: 'Failed to create team' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    // Get game room
    const gameRoom = await kv.get<GameRoom>(`game:${gameId}`);
    if (!gameRoom) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Get all teams
    const teams = await Promise.all(
      gameRoom.teams.map(teamId => kv.get<Team>(`team:${teamId}`))
    );

    return NextResponse.json({ teams: teams.filter(Boolean) });
  } catch (error) {
    console.error('Error getting teams:', error);
    return NextResponse.json(
      { error: 'Failed to get teams' },
      { status: 500 }
    );
  }
}
