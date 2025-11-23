-- Update the reasoning_embedding column to accept 768 dimensions instead of 1536
-- This matches Google Gemini's text-embedding-004 model output

ALTER TABLE analysis_memory 
ALTER COLUMN reasoning_embedding TYPE vector(768);