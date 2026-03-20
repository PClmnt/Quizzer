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
import { GameSharePanel } from '@/components/GameSharePanel';
import { getStoredAccessCode, getStoredPlayerId, savePlayerSession } from '@/lib/player-storage';

const RESULTS_PHASE_DURATION_MS = 4000;

interface GameState {
  gameRoom: GameRoom | null;
  players: PlayerSession[];
  teams: Team[];
  currentPlayer: PlayerSession | null;
  playerAccessCode: string | null;
  loading: boolean;
  error: string | null;
}

function RecoveryCodePanel({ accessCode }: { accessCode: string | null }) {
  if (!accessCode) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recovery Code</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-gray-50 p-4 text-center">
          <div className="font-mono text-2xl font-bold tracking-[0.25em] text-gray-900">
            {accessCode}
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Use this code to reclaim your seat on another device.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MultiplayerGame() {
  const params = useParams();
  const router = useRouter();
  const gameIdentifier = params.gameId as string;
  
  const [gameState, setGameState] = useState<GameState>({
    gameRoom: null,
    players: [],
    teams: [],
    currentPlayer: null,
    playerAccessCode: null,
    loading: true,
    error: null
  });

  const [playerName, setPlayerName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [advancingGame, setAdvancingGame] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadGameState = useCallback(async () => {
    try {
      const storedPlayerId = getStoredPlayerId(gameIdentifier);
      let response = await MultiplayerApiService.getGameState(gameIdentifier, storedPlayerId || undefined);
      let currentPlayer = response.players.find((p: PlayerSession) => p.id === storedPlayerId);

      const resolvedGameId = response.gameRoom?.id;
      const roomCode = response.gameRoom?.roomCode;
      const fallbackPlayerId = currentPlayer
        ? null
        : getStoredPlayerId(gameIdentifier, resolvedGameId, roomCode);

      if (fallbackPlayerId && fallbackPlayerId !== storedPlayerId) {
        response = await MultiplayerApiService.getGameState(gameIdentifier, fallbackPlayerId);
        currentPlayer = response.players.find((p: PlayerSession) => p.id === fallbackPlayerId);
      }

      if (currentPlayer && response.gameRoom) {
        savePlayerSession(
          currentPlayer.id,
          response.playerAccessCode,
          gameIdentifier,
          response.gameRoom.id,
          response.gameRoom.roomCode
        );
      }

      setGameState({
        gameRoom: response.gameRoom,
        players: response.players,
        teams: response.teams || [],
        currentPlayer: currentPlayer || null,
        playerAccessCode:
          response.playerAccessCode ??
          getStoredAccessCode(gameIdentifier, response.gameRoom?.id, response.gameRoom?.roomCode),
        loading: false,
        error: null
      });
      setJoinError(null);
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load game'
      }));
    }
  }, [gameIdentifier]);

  useEffect(() => {
    loadGameState();
  }, [gameIdentifier, loadGameState]);

  // Poll for game state updates
  useEffect(() => {
    if (!gameState.gameRoom) return;

    const interval = setInterval(() => {
      loadGameState();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.gameRoom?.id, loadGameState]);

  const joinGame = async () => {
    if (!playerName.trim() && !accessCode.trim()) return;

    setJoining(true);
    setJoinError(null);
    try {
      const response = await MultiplayerApiService.joinGame(
        gameIdentifier,
        playerName,
        accessCode.trim() || undefined
      );
      savePlayerSession(
        response.playerId,
        response.playerAccessCode,
        gameIdentifier,
        response.gameRoom.id,
        response.roomCode
      );
      await loadGameState();
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Failed to join game');
    } finally {
      setJoining(false);
    }
  };

  const startGame = async () => {
    if (!gameState.currentPlayer || !gameState.gameRoom) return;

    try {
      await MultiplayerApiService.startGame(gameIdentifier, gameState.currentPlayer.id);
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
        gameIdentifier,
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

  const nextQuestion = useCallback(async () => {
    if (!gameState.currentPlayer || !gameState.gameRoom || advancingGame) return;

    setAdvancingGame(true);
    try {
      await MultiplayerApiService.nextQuestion(gameIdentifier, gameState.currentPlayer.id);
      await loadGameState();
    } catch (error) {
      setGameState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to advance game'
      }));
    } finally {
      setAdvancingGame(false);
    }
  }, [advancingGame, gameIdentifier, gameState.currentPlayer, gameState.gameRoom, loadGameState]);

  useEffect(() => {
    if (!gameState.currentPlayer?.isHost) return;
    if (gameState.gameRoom?.phase !== 'results') return;
    if (!gameState.gameRoom.resultsStartedAt) return;

    const resultsStartedAt = new Date(gameState.gameRoom.resultsStartedAt).getTime();
    const remainingMs = RESULTS_PHASE_DURATION_MS - (Date.now() - resultsStartedAt);

    if (remainingMs <= 0) {
      void nextQuestion();
      return;
    }

    const timeout = window.setTimeout(() => {
      void nextQuestion();
    }, remainingMs);

    return () => window.clearTimeout(timeout);
  }, [
    gameState.currentPlayer?.isHost,
    gameState.gameRoom?.phase,
    gameState.gameRoom?.resultsStartedAt,
    nextQuestion
  ]);

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
              <div className="space-y-1 text-gray-600">
                <p>{gameState.gameRoom.name}</p>
                <p className="text-sm font-medium">Room Code: {gameState.gameRoom.roomCode}</p>
                {gameState.gameRoom.phase !== 'setup' && (
                  <p className="text-sm text-amber-700">
                    New joins are closed. Enter your recovery code to reclaim your seat.
                  </p>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {joinError && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {joinError}
              </div>
            )}

            <div>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name (optional with recovery code)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && joinGame()}
                disabled={joining}
              />
            </div>

            <div>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="Recovery code (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && joinGame()}
                disabled={joining}
              />
            </div>
            
            <Button 
              onClick={joinGame} 
              className="w-full" 
              disabled={(!playerName.trim() && !accessCode.trim()) || joining}
            >
              {joining ? 'Joining...' : accessCode.trim() ? 'Join or Rejoin Game' : 'Join Game'}
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
              <div className="mx-auto max-w-md">
                <GameSharePanel
                  roomCode={gameRoom.roomCode}
                  shareUrl={MultiplayerApiService.generateShareableLink(gameRoom.roomCode)}
                />
              </div>
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

            <RecoveryCodePanel accessCode={gameState.playerAccessCode} />
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

    const effectiveAnsweringPlayer = answeredByTeammate ?? (hasAnswered ? currentPlayer : null);
    const effectiveSelectedAnswer = effectiveAnsweringPlayer?.answers[currentQuestion.id];
    const canRevealCorrectAnswer =
      currentPlayer.isHost &&
      (hasAnswered || teamAnswered) &&
      currentQuestion.correctAnswer !== undefined;

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
              
              {canRevealCorrectAnswer && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-700 font-medium">
                    🎯 Host View: Correct answers are green and incorrect submitted answers are red
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
                  const isSelectedAnswer = effectiveSelectedAnswer === index;
                  const isCorrectAnswer = canRevealCorrectAnswer && currentQuestion.correctAnswer === index;
                  const isWrongSelectedAnswer =
                    canRevealCorrectAnswer &&
                    isSelectedAnswer &&
                    currentQuestion.correctAnswer !== index;

                  return (
                    <Button
                      key={index}
                      variant={isSelectedAnswer ? "default" : "outline"}
                      className={`p-6 text-lg h-auto text-left justify-start ${
                        isCorrectAnswer
                          ? 'border-green-500 bg-green-50 text-green-900 ring-2 ring-green-500 ring-offset-2 hover:bg-green-100'
                          : ''
                      } ${
                        isWrongSelectedAnswer
                          ? 'border-red-500 bg-red-50 text-red-900 ring-2 ring-red-500 ring-offset-2 hover:bg-red-100'
                          : ''
                      }`}
                      onClick={() => submitAnswer(index)}
                      disabled={hasAnswered || teamAnswered}
                    >
                      <span className="font-bold mr-3">{String.fromCharCode(65 + index)}.</span>
                      <span className="flex-1">{option}</span>
                      {isCorrectAnswer && (
                        <Badge className="ml-2 bg-green-500">Correct</Badge>
                      )}
                      {isWrongSelectedAnswer && (
                        <Badge className="ml-2 bg-red-500">Submitted</Badge>
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
                  <Button onClick={nextQuestion} size="lg" disabled={advancingGame}>
                    {advancingGame ? 'Advancing...' : 'Show Results'}
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

          <RecoveryCodePanel accessCode={gameState.playerAccessCode} />
        </div>
      </div>
    );
  }

  if (gameRoom.phase === 'results') {
    const currentRound = gameRoom.rounds[gameRoom.currentRound];
    const currentQuestion = currentRound?.questions[gameRoom.currentQuestion];
    const questionResult = gameRoom.currentQuestionResult;
    const totalQuestions = gameRoom.rounds.reduce((sum, round) => sum + round.questions.length, 0);
    const currentQuestionNumber = gameRoom.rounds
      .slice(0, gameRoom.currentRound)
      .reduce((sum, round) => sum + round.questions.length, 0) + gameRoom.currentQuestion + 1;
    const progress = (currentQuestionNumber / totalQuestions) * 100;
    const chosenAnswers = new Set(
      (questionResult?.playerResults ?? [])
        .map((result) => result.answerIndex)
        .filter((answerIndex): answerIndex is number => answerIndex !== undefined)
    );

    if (!currentRound || !currentQuestion || !questionResult) {
      return <div>Loading results...</div>;
    }

    const hasMoreQuestions =
      gameRoom.currentQuestion < currentRound.questions.length - 1 ||
      gameRoom.currentRound < gameRoom.rounds.length - 1;

    const secondsRemaining = gameRoom.resultsStartedAt
      ? Math.max(
          0,
          Math.ceil(
            (RESULTS_PHASE_DURATION_MS - (Date.now() - new Date(gameRoom.resultsStartedAt).getTime())) / 1000
          )
        )
      : Math.ceil(RESULTS_PHASE_DURATION_MS / 1000);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-2xl">Question Results</CardTitle>
                <Badge variant="outline">
                  Question {gameRoom.currentQuestion + 1} of {currentRound.questions.length}
                </Badge>
              </div>
              <Progress value={progress} className="w-full" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
                <span>Overall progress: {currentQuestionNumber} of {totalQuestions} questions</span>
                <span>
                  {hasMoreQuestions ? `Next question in about ${secondsRemaining}s` : `Final screen in about ${secondsRemaining}s`}
                </span>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="space-y-2">
                <Badge className="bg-green-600">Correct Answer</Badge>
                <h2 className="text-2xl font-semibold">{currentQuestion.question}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option, index) => {
                  const isCorrectAnswer = index === currentQuestion.correctAnswer;
                  const isWrongChosen = chosenAnswers.has(index) && !isCorrectAnswer;

                  return (
                    <Button
                      key={index}
                      variant="outline"
                      disabled
                      className={`p-6 text-lg h-auto text-left justify-start opacity-100 ${
                        isCorrectAnswer
                          ? 'border-green-500 bg-green-50 text-green-900 ring-2 ring-green-500 ring-offset-2'
                          : ''
                      } ${
                        isWrongChosen
                          ? 'border-red-500 bg-red-50 text-red-900 ring-2 ring-red-500 ring-offset-2'
                          : ''
                      }`}
                    >
                      <span className="font-bold mr-3">{String.fromCharCode(65 + index)}.</span>
                      <span className="flex-1">{option}</span>
                      {isCorrectAnswer && (
                        <Badge className="ml-2 bg-green-600">Correct</Badge>
                      )}
                      {isWrongChosen && (
                        <Badge className="ml-2 bg-red-500">Chosen</Badge>
                      )}
                    </Button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                {gameRoom.gameMode === 'teams'
                  ? 'Each team row shows who locked in the answer and how many points they earned.'
                  : 'Each player row shows their submitted answer and how many points they earned.'}
              </div>

              {gameRoom.gameMode === 'teams' ? (
                <div className="space-y-3">
                  {questionResult.teamResults?.map((teamResult) => {
                    const team = teams.find((entry) => entry.id === teamResult.teamId);
                    const answeredBy = players.find((player) => player.id === teamResult.answeredBy);
                    const answeredPlayerResult = questionResult.playerResults.find(
                      (result) => result.playerId === teamResult.answeredBy
                    );
                    const answerText =
                      answeredPlayerResult?.answerIndex !== undefined
                        ? currentQuestion.options[answeredPlayerResult.answerIndex]
                        : 'No answer submitted';

                    return (
                      <div key={teamResult.teamId} className="rounded-lg border bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {team && (
                                <div
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: team.color }}
                                />
                              )}
                              <span className="font-semibold">{team?.name ?? 'Unknown team'}</span>
                            </div>
                            <p className="text-sm text-gray-600">
                              Answered by: {answeredBy?.name ?? 'No one'}
                            </p>
                            <p className="text-sm text-gray-600">
                              Submitted: {answerText}
                            </p>
                          </div>
                          <Badge variant={teamResult.points > 0 ? 'default' : 'secondary'}>
                            +{teamResult.points} pts
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {questionResult.playerResults.map((result) => {
                    const player = players.find((entry) => entry.id === result.playerId);
                    const answerText =
                      result.answerIndex !== undefined
                        ? currentQuestion.options[result.answerIndex]
                        : 'No answer submitted';

                    return (
                      <div key={result.playerId} className="rounded-lg border bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold">{player?.name ?? 'Unknown player'}</p>
                            <p className="text-sm text-gray-600">Submitted: {answerText}</p>
                          </div>
                          <Badge variant={result.points > 0 ? 'default' : 'secondary'}>
                            +{result.points} pts
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {currentPlayer.isHost && (
                <div className="flex justify-center">
                  <Button onClick={nextQuestion} size="lg" disabled={advancingGame}>
                    {advancingGame
                      ? 'Advancing...'
                      : hasMoreQuestions
                        ? 'Next Question Now'
                        : 'Finish Game Now'}
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

          <RecoveryCodePanel accessCode={gameState.playerAccessCode} />
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

            <RecoveryCodePanel accessCode={gameState.playerAccessCode} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
