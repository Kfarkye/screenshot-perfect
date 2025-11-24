import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Configuration
const MAX_AGE_HOURS = 4;
const ODDS_DRIFT_THRESHOLD = 20;

// Environment Validation
const EnvSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const envParse = EnvSchema.safeParse(Deno.env.toObject());
if (!envParse.success) {
  console.error("[FATAL] Invalid environment variables:", envParse.error.format());
  Deno.exit(1);
}
const env = envParse.data;

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const LLM_MODEL = "gemini-3-pro-preview";
const EMBEDDING_MODEL = "text-embedding-004";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GameWithOdds {
  game_id: string;
  away_team: string;
  home_team: string;
  game_date: string;
  start_time: string;
  odds: any;
}

// Retry with exponential backoff
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> => {
  let lastError: Error | unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (error.status === 503 && attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed with 503. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
};

// Check if pick needs regeneration
const needsRegeneration = async (gameId: string, currentOdds: number): Promise<boolean> => {
  const { data: existingPick } = await supabase
    .from("analysis_memory")
    .select("odds_at_generation, created_at")
    .eq("game_id", gameId)
    .eq("market_type", "moneyline")
    .maybeSingle();

  if (!existingPick) return true;

  // Check time staleness
  const hoursSinceGen = (Date.now() - new Date(existingPick.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursSinceGen > MAX_AGE_HOURS) {
    console.log(`[STALE_TIME] ${gameId}: ${hoursSinceGen.toFixed(1)}h old`);
    return true;
  }

  // Check odds drift
  const oddsDrift = Math.abs(existingPick.odds_at_generation - currentOdds);
  if (oddsDrift > ODDS_DRIFT_THRESHOLD) {
    console.log(`[ODDS_DRIFT] ${gameId}: drift ${oddsDrift}`);
    return true;
  }

  return false;
};

// Generate a single pick
const generatePickForGame = async (game: GameWithOdds): Promise<void> => {
  const { game_id, away_team, home_team, odds } = game;
  
  // Extract current odds
  const homeML = parseInt(odds?.draftkings?.homeML || odds?.generic?.homeML || "-110", 10);
  if (isNaN(homeML)) {
    console.log(`[SKIP] ${game_id}: No valid odds`);
    return;
  }

  // Check if regeneration needed
  if (!(await needsRegeneration(game_id, homeML))) {
    console.log(`[CACHE_VALID] ${game_id}: Using existing pick`);
    return;
  }

  const gameContext = {
    away_team,
    home_team,
    league: "NFL",
    moneyline_home: odds?.draftkings?.homeML || odds?.generic?.homeML,
    moneyline_away: odds?.draftkings?.awayML || odds?.generic?.awayML,
    spread_home: odds?.draftkings?.homePL || odds?.generic?.homePL,
    spread_away: odds?.draftkings?.awayPL || odds?.generic?.awayPL,
    total: odds?.draftkings?.total || odds?.generic?.total,
  };

  const systemPrompt = `
    You are a data-driven sports betting analyst. Analyze the provided matchup context for the 'moneyline' market.
    CRITICAL CONTEXT: The current odds are ${homeML}. Use this to determine Expected Value (EV).
    Be decisive. Pick a side.
    Response MUST be a JSON object: { "pick_side": string, "confidence": number (1-100), "reasoning": string }
  `;

  try {
    console.log(`[GENERATING] ${game_id}: ${away_team} @ ${home_team}`);

    // Call Gemini API with retry logic
    const chatResponse = await retryWithBackoff(async () => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${LLM_MODEL}:generateContent?key=${env.GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `${systemPrompt}\n\nAnalyze: ${JSON.stringify(gameContext)}`
              }]
            }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GEMINI_ERROR] ${response.status}:`, errorText);
        throw { status: response.status, error: errorText };
      }

      return response;
    });

    const chatData = await chatResponse.json();
    const rawResult = chatData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawResult) {
      console.error(`[EMPTY_RESPONSE] ${game_id}`);
      return;
    }

    const analysis = JSON.parse(rawResult);

    // Generate embedding
    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${env.GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: analysis.reasoning }] }
        }),
      }
    );

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.embedding?.values;

    if (!embedding) {
      console.error(`[EMBEDDING_FAILED] ${game_id}`);
      return;
    }

    // Upsert to database
    const { error: upsertError } = await supabase
      .from("analysis_memory")
      .upsert({
        game_id,
        market_type: "moneyline",
        pick_side: analysis.pick_side,
        confidence_score: analysis.confidence,
        reasoning_text: analysis.reasoning,
        reasoning_embedding: embedding,
        odds_at_generation: homeML,
        created_at: new Date().toISOString(),
      }, {
        onConflict: "game_id, market_type"
      });

    if (upsertError) {
      console.error(`[DB_ERROR] ${game_id}:`, upsertError);
    } else {
      console.log(`[SUCCESS] ${game_id}: ${analysis.pick_side} (${analysis.confidence}%)`);
    }

  } catch (error) {
    console.error(`[FAILED] ${game_id}:`, error);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    console.log("[CRON_START] Generating NFL picks...");

    // Fetch upcoming NFL games from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: games, error: gamesError } = await supabase
      .from("nfl_games")
      .select("*")
      .gte("game_date", sevenDaysAgo.toISOString().split('T')[0])
      .eq("status", "scheduled");

    if (gamesError) {
      console.error("[DB_ERROR] Failed to fetch games:", gamesError);
      return new Response(JSON.stringify({ error: "Failed to fetch games" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GAMES_FOUND] ${games?.length || 0} upcoming NFL games`);

    if (!games || games.length === 0) {
      return new Response(JSON.stringify({ message: "No upcoming games found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter games with odds
    const gamesWithOdds = games.filter(game => 
      game.game_data?.odds_id && game.game_data?.has_betting_lines
    );

    console.log(`[GAMES_WITH_ODDS] ${gamesWithOdds.length} games have betting lines`);

    // Fetch current odds for these games
    const oddsPromises = gamesWithOdds.map(async (game) => {
      // Call fetch-odds to get current odds for this game
      const { data: oddsData } = await supabase.functions.invoke('fetch-odds', {
        body: {
          sport: 'americanfootball_nfl',
          regions: 'us',
          markets: 'h2h,spreads,totals',
          bookmakers: 'draftkings,fanduel,betmgm',
          dateFormat: 'iso',
          daysFrom: 7,
        }
      });

      // Find odds for this specific game
      const gameOdds = oddsData?.find((g: any) => g.id === game.game_id);
      
      return {
        ...game,
        odds: gameOdds ? extractOddsFromGame(gameOdds) : null,
      };
    });

    const gamesWithCurrentOdds = await Promise.all(oddsPromises);
    const validGames = gamesWithCurrentOdds.filter(g => g.odds);

    console.log(`[VALID_GAMES] ${validGames.length} games with current odds`);

    // Process in batches of 3 with delays
    const BATCH_SIZE = 3;
    const BATCH_DELAY = 2000;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < validGames.length; i += BATCH_SIZE) {
      const batch = validGames.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(game => generatePickForGame(game))
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          failureCount++;
        }
      });

      // Delay between batches
      if (i + BATCH_SIZE < validGames.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    console.log(`[CRON_COMPLETE] Success: ${successCount}, Failed: ${failureCount}`);

    return new Response(
      JSON.stringify({
        message: "Pick generation complete",
        total: validGames.length,
        success: successCount,
        failed: failureCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[CRON_ERROR]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Helper to extract odds from game data
function extractOddsFromGame(game: any) {
  const bookmakers = game.bookmakers || [];
  const findBook = (keys: string[]) => bookmakers.find((b: any) => keys.includes(b.key));
  
  const dk = findBook(['draftkings']);
  const fallback = bookmakers[0];
  const book = dk || fallback;
  
  if (!book) return null;

  const h2h = book.markets.find((m: any) => m.key === 'h2h');
  const spreads = book.markets.find((m: any) => m.key === 'spreads');
  const totals = book.markets.find((m: any) => m.key === 'totals');

  const awayH2H = h2h?.outcomes.find((o: any) => o.name === game.away_team);
  const homeH2H = h2h?.outcomes.find((o: any) => o.name === game.home_team);
  const awaySpread = spreads?.outcomes.find((o: any) => o.name === game.away_team);
  const homeSpread = spreads?.outcomes.find((o: any) => o.name === game.home_team);
  const over = totals?.outcomes.find((o: any) => o.name === 'Over');
  const under = totals?.outcomes.find((o: any) => o.name === 'Under');

  const fmtOdds = (price: number) => price > 0 ? `+${price}` : `${price}`;

  return {
    draftkings: {
      awayML: awayH2H ? fmtOdds(awayH2H.price) : '-',
      homeML: homeH2H ? fmtOdds(homeH2H.price) : '-',
      awayPL: awaySpread ? `${awaySpread.point > 0 ? '+' : ''}${awaySpread.point} (${fmtOdds(awaySpread.price)})` : '-',
      homePL: homeSpread ? `${homeSpread.point > 0 ? '+' : ''}${homeSpread.point} (${fmtOdds(homeSpread.price)})` : '-',
      total: over ? `${over.point}` : '-',
    },
    generic: {
      awayML: awayH2H ? fmtOdds(awayH2H.price) : '-',
      homeML: homeH2H ? fmtOdds(homeH2H.price) : '-',
      awayPL: awaySpread ? `${awaySpread.point > 0 ? '+' : ''}${awaySpread.point} (${fmtOdds(awaySpread.price)})` : '-',
      homePL: homeSpread ? `${homeSpread.point > 0 ? '+' : ''}${homeSpread.point} (${fmtOdds(homeSpread.price)})` : '-',
      total: over ? `${over.point}` : '-',
    }
  };
}
