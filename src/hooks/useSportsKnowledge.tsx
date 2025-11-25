import { supabase } from '@/integrations/supabase/client';

interface KnowledgeEntry {
  id: string;
  category: string;
  league: string;
  entity: string;
  data: any;
  valid_from: string;
  valid_until: string | null;
  source_url: string | null;
}

export async function getSportsKnowledge(query: string): Promise<KnowledgeEntry[]> {
  console.log('[Sports Knowledge] Querying local DB for:', query);

  try {
    // Query using text search and entity matching
    const { data, error } = await supabase
      .from('sports_knowledge')
      .select('*')
      .is('valid_until', null) // Only current/active entries
      .or(`entity.ilike.%${query}%,data->>team.ilike.%${query}%,data->>teamAbbr.ilike.%${query}%`)
      .limit(5);

    if (error) {
      console.error('[Sports Knowledge] Query error:', error);
      return [];
    }

    console.log(`[Sports Knowledge] Found ${data?.length || 0} matching entries`);
    return data || [];
  } catch (err) {
    console.error('[Sports Knowledge] Error:', err);
    return [];
  }
}

export function formatKnowledgeForPrompt(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return '';

  let formatted = '\n\n**Current Sports Knowledge:**\n';
  
  for (const entry of entries) {
    if (entry.category === 'roster') {
      formatted += `- ${entry.entity} plays for ${entry.data.team} (${entry.data.teamAbbr})`;
      if (entry.data.position) {
        formatted += ` as ${entry.data.position}`;
      }
      formatted += '\n';
    } else if (entry.category === 'trade') {
      formatted += `- ${entry.entity} was traded from ${entry.data.from_team} to ${entry.data.to_team} on ${entry.data.date}\n`;
    } else if (entry.category === 'injury') {
      formatted += `- ${entry.entity} is ${entry.data.status} (${entry.data.description})\n`;
    }
  }

  return formatted;
}
