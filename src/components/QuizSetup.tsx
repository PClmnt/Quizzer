'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TriviaApiService } from '@/services/trivia-api';
import { TriviaCategory } from '@/types/trivia-api';
import { Player } from '@/types/quiz';

interface QuizSettings {
  amount: number;
  category?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  includeLogos: boolean;
  includeSounds: boolean;
}

interface QuizSetupProps {
  players: Player[];
  onPlayersChange: (players: Player[]) => void;
  onStartGame: (settings: QuizSettings) => void;
}

export default function QuizSetup({ players, onPlayersChange, onStartGame }: QuizSetupProps) {
  const [newPlayerName, setNewPlayerName] = useState('');
  const [categories, setCategories] = useState<TriviaCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<QuizSettings>({
    amount: 10,
    difficulty: 'medium',
    includeLogos: true,
    includeSounds: true
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await TriviaApiService.getCategories();
      setCategories(response.trivia_categories);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const addPlayer = () => {
    if (newPlayerName.trim()) {
      const newPlayer: Player = {
        id: Date.now().toString(),
        name: newPlayerName.trim(),
        score: 0
      };
      onPlayersChange([...players, newPlayer]);
      setNewPlayerName('');
    }
  };

  const removePlayer = (playerId: string) => {
    onPlayersChange(players.filter(p => p.id !== playerId));
  };

  const handleStart = () => {
    if (players.length > 0) {
      onStartGame(settings);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
      <Card className="w-full max-w-4xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-gray-800">Quiz Game</CardTitle>
          <p className="text-gray-600">Configure your quiz and add players to start</p>
        </CardHeader>
        <CardContent className="space-y-8">
          
          {/* Players Section */}
          <div>
            <h3 className="text-xl font-semibold mb-4">Players</h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Enter player name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && addPlayer()}
              />
              <Button onClick={addPlayer}>Add Player</Button>
            </div>
            
            {players.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {players.map((player) => (
                  <div key={player.id} className="flex items-center gap-1 bg-blue-100 px-3 py-1 rounded-full">
                    <span className="text-sm font-medium">{player.name}</span>
                    <button 
                      onClick={() => removePlayer(player.id)}
                      className="text-red-500 hover:text-red-700 ml-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                  {loading ? (
                    <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                      Loading categories...
                    </div>
                  ) : (
                    <select 
                      value={settings.category || ''}
                      onChange={(e) => setSettings({...settings, category: e.target.value ? Number(e.target.value) : undefined})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Any Category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  )}
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
              <h3 className="text-xl font-semibold mb-4">Quiz Preview</h3>
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
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Button 
            onClick={handleStart} 
            className="w-full" 
            size="lg"
            disabled={players.length === 0}
          >
            Start Quiz Game
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}