import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { ScheduleView } from '@/components/ScheduleView';
import type { AppTheme, League, GameData } from '@/types';

const Index = () => {
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [league, setLeague] = useState<League>('NHL');

  const handleThemeToggle = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const handleLeagueChange = (newLeague: League) => {
    setLeague(newLeague);
  };

  const handleAnalyzeGame = (game: GameData) => {
    console.log('Analyze game:', game);
    // TODO: Integrate with AI chat functionality
  };

  // Set dark mode by default
  React.useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        theme={theme}
        onThemeToggle={handleThemeToggle}
        league={league}
        onLeagueChange={handleLeagueChange}
        marketStatus="Closed"
      />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">
            {league === 'NHL' ? 'NHL' : 'NFL'} Schedule & Odds
          </h2>
          <p className="text-textSecondary">
            Professional sports betting analytics powered by AI
          </p>
        </div>

        <ScheduleView
          league={league}
          onAnalyze={handleAnalyzeGame}
        />
      </main>
    </div>
  );
};

export default Index;
