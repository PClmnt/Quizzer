'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GameRoom, PlayerSession, Team } from '@/types/multiplayer';
import { MultiplayerApiService } from '@/services/multiplayer-api';
import { TeamSetup } from '@/components/TeamSetup';
import { TeamScoreboard } from '@/components/TeamScoreboard';

interface GameState {
  gameRoom: GameRoom | null;
  players: PlayerSession[];
  teams: Team[];
  currentPlayer: PlayerSession | null;
  loading: boolean;
  error: string | null;
}

export default function MultiplayerGame() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  
  const [gameState, setGameState] = useState<GameState>({
    gameRoom: null,
    players: [],
    teams: [],
    currentPlayer: null,
    loading: true,
    error: null
  });

  const [playerName, setPlayerName] = useState('');
  const [joining, setJoining] = useState(false);

  const loadGameState = useCallback(async () => {
    try {
      const storedPlayerId = localStorage.getItem(`player_${gameId}`);
      const response = await MultiplayerApiService.getGameState(gameId, storedPlayerId || undefined);
      const currentPlayer = response.players.find((p: PlayerSession) => p.id === storedPlayerId);

      setGameState({
        gameRoom: response.gameRoom,
        players: response.players,
        teams: response.teams || [],
        currentPlayer: currentPlayer || null,
        loading: false,
        error: null
      });
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load game'
      }));
    }
  }, [gameId]);

  useEffect(() => {
    loadGameState();
  }, [gameId, loadGameState]);

  // Poll for game state updates
  useEffect(() => {
    if (!gameState.currentPlayer) return;

    const interval = setInterval(() => {
      loadGameState();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.currentPlayer?.id, loadGameState]);

  const joinGame = async () => {
    if (!playerName.trim()) return;

    setJoining(true);
    try {
      const response = await MultiplayerApiService.joinGame(gameId, playerName);
      localStorage.setItem(`player_${gameId}`, response.playerId);
      
      setGameState({
        gameRoom: response.gameRoom,
        players: [response.playerSession],
        teams: response.teams || [],
        currentPlayer: response.playerSession,
        loading: false,
        error: null
      });
      
      // Load full game state
      loadGameState();
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to join game'
      }));
    } finally {
      setJoining(false);
    }
  };

  const startGame = async () => {
    if (!gameState.currentPlayer || !gameState.gameRoom) return;

    try {
      await MultiplayerApiService.startGame(gameId, gameState.currentPlayer.id);
      loadGameState();
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start game'
      }));
    }
  };

  const submitAnswer = async (answerIndex: number) => {
    if (!gameState.currentPlayer || !gameState.gameRoom) return;

    const currentRound = gameState.gameRoom.rounds[gameState.gameRoom.currentRound];
    const currentQuestion = currentRound?.questions[gameState.gameRoom.currentQuestion];
    if (!currentQuestion) return;

    try {
      await MultiplayerApiService.submitAnswer(
        gameId,
        gameState.currentPlayer.id,
        currentQuestion.id,
        answerIndex
      );
      loadGameState();
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to submit answer'
      }));
    }
  };

  const nextQuestion = async () => {
    if (!gameState.currentPlayer || !gameState.gameRoom) return;

    try {
      await MultiplayerApiService.nextQuestion(gameId, gameState.currentPlayer.id);
      loadGameState();
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to advance game'
      }));
    }
  };

  const copyGameLink = () => {
    const url = MultiplayerApiService.generateShareableLink(gameId);
    navigator.clipboard.writeText(url);
    // Could add a toast notification here
  };

  if (gameState.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-lg font-medium">Loading game...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (gameState.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold mb-2">Error</h3>
            <p className="text-gray-600 mb-4">{gameState.error}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Player needs to join
  if (!gameState.currentPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Join Quiz Game</CardTitle>
            {gameState.gameRoom && (
              <p className="text-gray-600">{gameState.gameRoom.name}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && joinGame()}
                disabled={joining}
              />
            </div>
            
            <Button 
              onClick={joinGame} 
              className="w-full" 
              disabled={!playerName.trim() || joining}
            >
              {joining ? 'Joining...' : 'Join Game'}
            </Button>

            {gameState.gameRoom && gameState.players.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Players in game:</h4>
                <div className="space-y-1">
                  {gameState.players.map((player) => (
                    <div key={player.id} className="flex justify-between text-sm">
                      <span>{player.name}</span>
                      {player.isHost && <Badge variant="secondary">Host</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { gameRoom, players, teams, currentPlayer } = gameState;
  if (!gameRoom) return null;

  const hasUnassignedPlayers =
    gameRoom.gameMode === 'teams' && players.some((player) => !player.teamId);
  const hasEmptyTeams =
    gameRoom.gameMode === 'teams' && teams.some((team) => team.playerIds.length === 0);
  const teamSetupIncomplete = hasUnassignedPlayers || hasEmptyTeams;

  // Setup phase - waiting for host to start
  if (gameRoom.phase === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{gameRoom.name}</CardTitle>
            <p className="text-gray-600">Waiting for all players to join</p>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="text-center">
              <Button onClick={copyGameLink} variant="outline">
                📋 Copy Game Link
              </Button>
              <p className="text-sm text-gray-500 mt-2">
                Share this link with other players
              </p>
            </div>

            {gameRoom.gameMode === 'teams' ? (
              <>
                <TeamSetup 
                  gameRoom={gameRoom}
                  currentPlayer={currentPlayer}
                  teams={teams}
                  onTeamUpdate={loadGameState}
                />
                
                <div>
                  <h3 className="text-lg font-semibold mb-3">All Players ({players.length}):</h3>
                  <div className="space-y-2">
                    {players.map((player) => {
                      const playerTeam = teams.find(team => team.playerIds.includes(player.id));
                      return (
                        <div key={player.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            {playerTeam && (
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: playerTeam.color }}
                              />
                            )}
                            <span className="font-medium">{player.name}</span>
                            {playerTeam && (
                              <span className="text-sm text-gray-500">({playerTeam.name})</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {player.isHost && <Badge variant="secondary">Host</Badge>}
                            {player.id === currentPlayer.id && <Badge>You</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div>
                <h3 className="text-lg font-semibold mb-3">Players ({players.length}):</h3>
                <div className="space-y-2">
                  {players.map((player) => (
                    <div key={player.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium">{player.name}</span>
                      <div className="flex gap-2">
                        {player.isHost && <Badge variant="secondary">Host</Badge>}
                        {player.id === currentPlayer.id && <Badge>You</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold mb-3">Game Settings:</h3>
              <div className="space-y-2 text-sm">
                <p><strong>Questions:</strong> {gameRoom.settings.amount}</p>
                <p><strong>Difficulty:</strong> {gameRoom.settings.difficulty || 'Mixed'}</p>
                <p><strong>Logo Round:</strong> {gameRoom.settings.includeLogos ? 'Yes' : 'No'}</p>
                <p><strong>Sound Round:</strong> {gameRoom.settings.includeSounds ? 'Yes' : 'No'}</p>
                <p><strong>Game Mode:</strong> {gameRoom.gameMode === 'teams' ? '👥 Teams' : '👤 Individual'}</p>
              </div>
            </div>

            {currentPlayer.isHost && (
              <Button 
                onClick={startGame} 
                className="w-full" 
                size="lg"
                disabled={teamSetupIncomplete}
              >
                {teamSetupIncomplete
                  ? hasUnassignedPlayers
                    ? 'All players need a team'
                    : 'All teams need at least one player'
                  : 'Start Game'}
              </Button>
            )}

            {!currentPlayer.isHost && (
              <div className="text-center text-gray-600">
                Waiting for {players.find(p => p.isHost)?.name} to start the game...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Playing phase
  if (gameRoom.phase === 'playing') {
    const currentRound = gameRoom.rounds[gameRoom.currentRound];
    const currentQuestion = currentRound?.questions[gameRoom.currentQuestion];
    const totalQuestions = gameRoom.rounds.reduce((sum, round) => sum + round.questions.length, 0);
    const currentQuestionNumber = gameRoom.rounds.slice(0, gameRoom.currentRound).reduce((sum, round) => sum + round.questions.length, 0) + gameRoom.currentQuestion + 1;
    const progress = (currentQuestionNumber / totalQuestions) * 100;

    if (!currentQuestion) {
      return <div>Loading question...</div>;
    }

    const hasAnswered = currentPlayer.answers[currentQuestion.id] !== undefined;
    const selectedAnswer = currentPlayer.answers[currentQuestion.id];
    
    // In team mode, check if team already answered
    let teamAnswered = false;
    let answeredByTeammate: PlayerSession | null = null;
    if (gameRoom.gameMode === 'teams' && currentPlayer.teamId) {
      const team = teams.find(t => t.id === currentPlayer.teamId);
      if (team) {
        const teamPlayers = players.filter(p => p.teamId === team.id);
        answeredByTeammate = teamPlayers.find(p => p.answers[currentQuestion.id] !== undefined) || null;
        teamAnswered = !!answeredByTeammate;
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-2xl">{currentRound.name}</CardTitle>
                <Badge variant="outline">
                  Question {gameRoom.currentQuestion + 1} of {currentRound.questions.length}
                </Badge>
              </div>
              <Progress value={progress} className="w-full" />
              <div className="text-sm text-gray-600">
                Overall progress: {currentQuestionNumber} of {totalQuestions} questions
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardContent className="p-8">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-semibold flex-1">
                  {currentQuestion.question}
                </h2>
                {currentQuestion.difficulty && (
                  <Badge 
                    variant={
                      currentQuestion.difficulty === 'easy' ? 'secondary' :
                      currentQuestion.difficulty === 'medium' ? 'default' : 'destructive'
                    }
                  >
                    {currentQuestion.difficulty}
                  </Badge>
                )}
              </div>

              {currentQuestion.category && (
                <div className="mb-4">
                  <Badge variant="outline">{currentQuestion.category}</Badge>
                </div>
              )}
              
              {currentPlayer.isHost && hasAnswered && currentQuestion.correctAnswer !== undefined && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-700 font-medium">
                    🎯 Host View: The correct answer is highlighted in green
                  </p>
                </div>
              )}
              
              {currentQuestion.type === 'logo' && currentQuestion.mediaUrl && (
                <div className="flex justify-center mb-6">
                  <div className="w-48 h-48 bg-gray-50 rounded-lg flex items-center justify-center text-8xl">
                    {currentQuestion.mediaUrl}
                  </div>
                </div>
              )}

              {currentQuestion.type === 'sound' && currentQuestion.mediaUrl && (
                <div className="flex justify-center mb-6">
                  <div className="w-48 h-48 bg-gray-50 rounded-lg flex items-center justify-center text-8xl">
                    {currentQuestion.mediaUrl}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option, index) => {
                  const isCorrectAnswer = currentPlayer.isHost && hasAnswered && currentQuestion.correctAnswer === index;
                  return (
                    <Button
                      key={index}
                      variant={selectedAnswer === index ? "default" : "outline"}
                      className={`p-6 text-lg h-auto text-left justify-start ${
                        isCorrectAnswer ? 'ring-2 ring-green-500 ring-offset-2' : ''
                      }`}
                      onClick={() => submitAnswer(index)}
                      disabled={hasAnswered || teamAnswered}
                    >
                      <span className="font-bold mr-3">{String.fromCharCode(65 + index)}.</span>
                      <span className="flex-1">{option}</span>
                      {isCorrectAnswer && (
                        <Badge className="ml-2 bg-green-500">Correct</Badge>
                      )}
                    </Button>
                  );
                })}
              </div>

              {(hasAnswered || teamAnswered) && (
                <div className="text-center mt-6">
                  <Badge variant="secondary">
                    {gameRoom.gameMode === 'teams' && teamAnswered && !hasAnswered
                      ? `${answeredByTeammate?.name} answered for your team!`
                      : 'Answer submitted! Waiting for other players...'}
                  </Badge>
                </div>
              )}

              {currentPlayer.isHost && (
                <div className="flex justify-center mt-8">
                  <Button onClick={nextQuestion} size="lg">
                    Next Question
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{gameRoom.gameMode === 'teams' ? 'Team Scores' : 'Player Scores'}</CardTitle>
            </CardHeader>
            <CardContent>
              {gameRoom.gameMode === 'teams' ? (
                <TeamScoreboard 
                  teams={teams}
                  players={players}
                  currentPlayerId={currentPlayer.id}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {players
                    .sort((a, b) => b.score - a.score)
                    .map((player, index) => (
                      <div key={player.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{index + 1}.</span>
                          <span className={player.id === currentPlayer.id ? 'font-bold' : ''}>
                            {player.name}
                          </span>
                          {player.id === currentPlayer.id && <Badge variant="outline">You</Badge>}
                        </div>
                        <Badge>{player.score} pts</Badge>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Finished phase
  if (gameRoom.phase === 'finished') {
    const winnerTeam = gameRoom.gameMode === 'teams' 
      ? teams.reduce((prev, current) => (prev.score > current.score) ? prev : current)
      : null;
    const winnerPlayer = players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold">🎉 Quiz Complete! 🎉</CardTitle>
            <p className="text-gray-600">
              {gameRoom.gameMode === 'teams' 
                ? `Congratulations Team ${winnerTeam?.name}!` 
                : `Congratulations ${winnerPlayer.name}!`}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">Final Scores:</h3>
              {gameRoom.gameMode === 'teams' ? (
                <TeamScoreboard 
                  teams={teams}
                  players={players}
                  currentPlayerId={currentPlayer.id}
                />
              ) : (
                <div className="space-y-2">
                  {players
                    .sort((a, b) => b.score - a.score)
                    .map((player, index) => (
                      <div key={player.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {index === 0 ? '🏆' : `${index + 1}.`}
                          </span>
                          <span className={player.id === currentPlayer.id ? 'font-bold' : ''}>
                            {player.name}
                          </span>
                          {player.id === currentPlayer.id && <Badge variant="outline">You</Badge>}
                        </div>
                        <Badge variant={index === 0 ? "default" : "secondary"}>
                          {player.score} pts
                        </Badge>
                      </div>
                    ))}
                </div>
              )}
            </div>
            
            <Button onClick={() => router.push('/')} className="w-full" size="lg">
              Play Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
