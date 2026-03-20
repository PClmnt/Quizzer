'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TriviaApiService } from '@/services/trivia-api';
import { MultiplayerApiService } from '@/services/multiplayer-api';
import { savePlayerSession } from '@/lib/player-storage';
import { TriviaCategory } from '@/types/trivia-api';
import { QuizSettings } from '@/types/multiplayer';

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<TriviaCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Create game state
  const [playerName, setPlayerName] = useState('');
  const [gameMode, setGameMode] = useState<'individual' | 'teams'>('individual');
  const [settings, setSettings] = useState<QuizSettings>({
    amount: 10,
    difficulty: 'medium',
    excludedCategories: [],
    includeLogos: true,
    includeSounds: true,
    questionTimeLimit: 30,
    maxTeams: 4,
    maxPlayersPerTeam: 4
  });

  // Join game state
  const [gameId, setGameId] = useState('');
  const [joinPlayerName, setJoinPlayerName] = useState('');
  const [joinAccessCode, setJoinAccessCode] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  const excludedCategoryIds = settings.excludedCategories ?? [];
  const sportsCategory = categories.find(
    (category) => category.name.toLowerCase() === 'sports'
  );
  const excludedCategoryNames = categories
    .filter((category) => excludedCategoryIds.includes(category.id))
    .map((category) => category.name);

  const loadCategories = async () => {
    try {
      const response = await TriviaApiService.getCategories();
      setCategories(response.trivia_categories);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const toggleExcludedCategory = (categoryId: number) => {
    setSettings((currentSettings) => {
      const currentExcludedCategories = currentSettings.excludedCategories ?? [];
      const isExcluded = currentExcludedCategories.includes(categoryId);

      return {
        ...currentSettings,
        excludedCategories: isExcluded
          ? currentExcludedCategories.filter((id) => id !== categoryId)
          : [...currentExcludedCategories, categoryId],
      };
    });
  };

  const createGame = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await MultiplayerApiService.createGame(playerName, settings, gameMode);
      savePlayerSession(
        response.playerId,
        response.playerAccessCode,
        response.gameId,
        response.roomCode
      );
      router.push(`/game/${response.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  const joinGame = async () => {
    if (!gameId.trim() || (!joinPlayerName.trim() && !joinAccessCode.trim())) {
      setError('Enter a room code and either your name or your recovery code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await MultiplayerApiService.joinGame(
        gameId,
        joinPlayerName,
        joinAccessCode.trim() || undefined
      );
      savePlayerSession(
        response.playerId,
        response.playerAccessCode,
        gameId,
        response.gameRoom.id,
        response.roomCode
      );
      router.push(`/game/${response.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-gray-800">Quiz Game</CardTitle>
            <p className="text-gray-600">Play trivia with friends</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => setMode('create')} 
              className="w-full" 
              size="lg"
            >
              🎮 Create New Game
            </Button>
            
            <Button 
              onClick={() => setMode('join')} 
              variant="outline"
              className="w-full" 
              size="lg"
            >
              🔗 Join Existing Game
            </Button>

            <div className="text-center text-sm text-gray-500 pt-4">
              <p>✨ Dynamic questions from Open Trivia DB</p>
              <p>🏆 Multiplayer competition</p>
              <p>📱 Play on any device</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                onClick={() => {setMode('home'); setError(null);}}
                className="p-2"
              >
                ← Back
              </Button>
              <CardTitle className="text-2xl">Create New Quiz Game</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            
            {error && (
              <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Your Name</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Game Mode</label>
                <div className="flex gap-2">
                  <Button
                    variant={gameMode === 'individual' ? "default" : "outline"}
                    onClick={() => setGameMode('individual')}
                    className="flex-1"
                  >
                    👤 Individual
                  </Button>
                  <Button
                    variant={gameMode === 'teams' ? "default" : "outline"}
                    onClick={() => setGameMode('teams')}
                    className="flex-1"
                  >
                    👥 Teams
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Quiz Settings */}
              <div>
                <h3 className="text-xl font-semibold mb-4">Quiz Settings</h3>
                <div className="space-y-4">
                  
                  {/* Number of Questions */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Number of Questions</label>
                    <select 
                      value={settings.amount}
                      onChange={(e) => setSettings({...settings, amount: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={5}>5 Questions</option>
                      <option value={10}>10 Questions</option>
                      <option value={15}>15 Questions</option>
                      <option value={20}>20 Questions</option>
                    </select>
                  </div>

                  {/* Difficulty */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Difficulty</label>
                    <div className="flex gap-2">
                      {['easy', 'medium', 'hard'].map((diff) => (
                        <Button
                          key={diff}
                          variant={settings.difficulty === diff ? "default" : "outline"}
                          onClick={() => setSettings({...settings, difficulty: diff as 'easy' | 'medium' | 'hard'})}
                          className="flex-1"
                        >
                          {diff.charAt(0).toUpperCase() + diff.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Category (Optional)</label>
                    {categoriesLoading ? (
                      <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                        Loading categories...
                      </div>
                    ) : (
                      <select 
                        value={settings.category || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          category: e.target.value ? Number(e.target.value) : undefined
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Any Category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Question Filters</label>
                    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      {sportsCategory && (
                        <label className="flex items-center text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={excludedCategoryIds.includes(sportsCategory.id)}
                            onChange={() => toggleExcludedCategory(sportsCategory.id)}
                            disabled={Boolean(settings.category)}
                            className="mr-2"
                          />
                          Avoid Sports questions
                        </label>
                      )}

                      <p className="text-sm text-gray-600">
                        {settings.category
                          ? 'Category exclusions only apply when Category is set to Any.'
                          : 'Block any categories you do not want in the trivia round.'}
                      </p>

                      {!categoriesLoading && (
                        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-3">
                          {categories
                            .filter((category) => category.id !== sportsCategory?.id)
                            .map((category) => (
                              <label
                                key={category.id}
                                className={`flex items-center text-sm ${
                                  settings.category ? 'text-gray-400' : 'text-gray-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={excludedCategoryIds.includes(category.id)}
                                  onChange={() => toggleExcludedCategory(category.id)}
                                  disabled={Boolean(settings.category)}
                                  className="mr-2"
                                />
                                {category.name}
                              </label>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Extra Rounds */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Extra Rounds</label>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.includeLogos}
                          onChange={(e) => setSettings({...settings, includeLogos: e.target.checked})}
                          className="mr-2"
                        />
                        Include Logo Round (4 questions)
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.includeSounds}
                          onChange={(e) => setSettings({...settings, includeSounds: e.target.checked})}
                          className="mr-2"
                        />
                        Include Sound Round (3 questions)
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <h3 className="text-xl font-semibold mb-4">Game Preview</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                    <span className="font-medium">Trivia Questions</span>
                    <Badge variant="outline">
                      {settings.amount} questions
                    </Badge>
                  </div>
                  
                  {settings.includeLogos && (
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="font-medium">Logo Round</span>
                      <Badge variant="outline">4 questions</Badge>
                    </div>
                  )}
                  
                  {settings.includeSounds && (
                    <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                      <span className="font-medium">Sound Round</span>
                      <Badge variant="outline">3 questions</Badge>
                    </div>
                  )}

                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600">
                      <p><strong>Total Questions:</strong> {
                        settings.amount + 
                        (settings.includeLogos ? 4 : 0) + 
                        (settings.includeSounds ? 3 : 0)
                      }</p>
                      <p><strong>Difficulty:</strong> {settings.difficulty}</p>
                      <p><strong>Category:</strong> {
                        settings.category ? 
                        categories.find(c => c.id === settings.category)?.name || 'Unknown' :
                        'Any'
                      }</p>
                      <p><strong>Excluded Categories:</strong> {
                        excludedCategoryNames.length > 0
                          ? excludedCategoryNames.join(', ')
                          : 'None'
                      }</p>
                      <p><strong>Game Mode:</strong> {gameMode === 'teams' ? '👥 Teams' : '👤 Individual'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Team Settings */}
            {gameMode === 'teams' && (
              <div className="border-t pt-6">
                <h3 className="text-xl font-semibold mb-4">Team Settings</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Maximum Teams</label>
                    <select 
                      value={settings.maxTeams}
                      onChange={(e) => setSettings({...settings, maxTeams: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={2}>2 Teams</option>
                      <option value={3}>3 Teams</option>
                      <option value={4}>4 Teams</option>
                      <option value={5}>5 Teams</option>
                      <option value={6}>6 Teams</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Max Players per Team</label>
                    <select 
                      value={settings.maxPlayersPerTeam}
                      onChange={(e) => setSettings({...settings, maxPlayersPerTeam: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={2}>2 Players</option>
                      <option value={3}>3 Players</option>
                      <option value={4}>4 Players</option>
                      <option value={5}>5 Players</option>
                      <option value={6}>6 Players</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <Button 
              onClick={createGame} 
              className="w-full" 
              size="lg"
              disabled={!playerName.trim() || loading}
            >
              {loading ? 'Creating Game...' : 'Create & Start Game'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                onClick={() => {setMode('home'); setError(null);}}
                className="p-2"
              >
                ← Back
              </Button>
              <CardTitle className="text-2xl">Join Game</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {error && (
              <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Game ID or Room Code</label>
              <input
                type="text"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                placeholder="Enter game ID or room code"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={joinPlayerName}
                onChange={(e) => setJoinPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Recovery Code (Optional)</label>
              <input
                type="text"
                value={joinAccessCode}
                onChange={(e) => setJoinAccessCode(e.target.value.toUpperCase())}
                placeholder="Use this to reclaim your seat on a new device"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <Button 
              onClick={joinGame} 
              className="w-full" 
              size="lg"
              disabled={!gameId.trim() || (!joinPlayerName.trim() && !joinAccessCode.trim()) || loading}
            >
              {loading ? 'Joining Game...' : joinAccessCode.trim() ? 'Join or Rejoin Game' : 'Join Game'}
            </Button>

            <div className="text-center text-sm text-gray-500">
              <p>Get the room code or link from the host to join their quiz</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
