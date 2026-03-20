import { PlayerSession, Team } from '@/types/multiplayer';

interface SyncTeamAssignmentsResult {
  players: PlayerSession[];
  teams: Team[];
  changed: boolean;
}

export function syncTeamAssignments(
  players: PlayerSession[],
  teams: Team[]
): SyncTeamAssignmentsResult {
  const updatedTeams = teams.map((team) => ({
    ...team,
    playerIds: [...team.playerIds],
  }));
  const teamById = new Map(updatedTeams.map((team) => [team.id, team]));

  let changed = false;

  const updatedPlayers = players.map((player) => {
    let assignedTeam = player.teamId ? teamById.get(player.teamId) : undefined;

    if (!assignedTeam) {
      assignedTeam = updatedTeams.find((team) => team.playerIds.includes(player.id));
    }

    if (!assignedTeam) {
      return player;
    }

    if (!assignedTeam.playerIds.includes(player.id)) {
      assignedTeam.playerIds.push(player.id);
      changed = true;
    }

    if (player.teamId === assignedTeam.id) {
      return player;
    }

    changed = true;

    return {
      ...player,
      teamId: assignedTeam.id,
    };
  });

  return {
    players: updatedPlayers,
    teams: updatedTeams,
    changed,
  };
}
