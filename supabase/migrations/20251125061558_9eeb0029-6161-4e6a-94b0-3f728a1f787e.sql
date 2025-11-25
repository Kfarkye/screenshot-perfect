-- Create sports knowledge cache table
CREATE TABLE IF NOT EXISTS public.sports_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'roster', 'trade', 'injury', 'news', 'suspension'
  league TEXT NOT NULL,   -- 'NBA', 'NFL', 'NHL', 'MLB'
  entity TEXT NOT NULL,   -- 'Luka Doncic', 'Lakers', etc.
  data JSONB NOT NULL,    -- Flexible storage for entity data
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE, -- null = current/active
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_knowledge_entity_search ON public.sports_knowledge USING gin(to_tsvector('english', entity));
CREATE INDEX idx_knowledge_entity_lower ON public.sports_knowledge(lower(entity));
CREATE INDEX idx_knowledge_category_league ON public.sports_knowledge(category, league);
CREATE INDEX idx_knowledge_valid ON public.sports_knowledge(valid_until) WHERE valid_until IS NULL;

-- RLS policies
ALTER TABLE public.sports_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to sports knowledge"
  ON public.sports_knowledge FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role can manage sports knowledge"
  ON public.sports_knowledge FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_sports_knowledge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_sports_knowledge_updated_at
  BEFORE UPDATE ON public.sports_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION update_sports_knowledge_updated_at();