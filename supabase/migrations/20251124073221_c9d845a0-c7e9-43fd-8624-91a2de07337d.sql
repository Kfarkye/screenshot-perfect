-- Create NFL games table
CREATE TABLE IF NOT EXISTS public.nfl_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL UNIQUE,
  away_team TEXT NOT NULL,
  home_team TEXT NOT NULL,
  game_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  away_score INTEGER,
  home_score INTEGER,
  venue TEXT,
  game_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nfl_games ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public can view NFL games"
  ON public.nfl_games
  FOR SELECT
  USING (true);

-- Service role write access
CREATE POLICY "Service role can insert NFL games"
  ON public.nfl_games
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update NFL games"
  ON public.nfl_games
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_nfl_games_game_id ON public.nfl_games(game_id);
CREATE INDEX idx_nfl_games_date ON public.nfl_games(game_date);
CREATE INDEX idx_nfl_games_season_week ON public.nfl_games(season, week);
CREATE INDEX idx_nfl_games_status ON public.nfl_games(status);

-- Trigger to update updated_at
CREATE TRIGGER update_nfl_games_updated_at
  BEFORE UPDATE ON public.nfl_games
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();