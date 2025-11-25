-- Add indexes for faster staleness checks
CREATE INDEX IF NOT EXISTS idx_analysis_memory_created_at 
ON analysis_memory(created_at);

CREATE INDEX IF NOT EXISTS idx_analysis_memory_odds 
ON analysis_memory(odds_at_generation);