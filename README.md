# SharpEdge Pro Terminal

**Version 2.1.0** | Institutional-grade sports betting analytics platform

## Overview

SharpEdge Pro Terminal is a full-stack sports betting analytics platform that combines real-time odds data, advanced statistics, and AI-powered insights to provide institutional-grade betting analysis for NHL, NFL, and NBA games.

**Core Capabilities:**
- Real-time betting lines from major US sportsbooks (DraftKings, FanDuel, BetMGM, Caesars)
- AI-driven pick generation using Google Gemini with confidence scoring and Expected Value (EV) calculations
- Streaming AI chat interface with web search and RAG capabilities for deep game analysis
- Automated data pipeline fetching odds, scores, and team statistics from The Odds API and ESPN

---

## Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5.4
- **Styling**: Tailwind CSS v3.4 with custom "Essence" design system
- **UI Components**: shadcn/ui (Radix Primitives)
- **State**: React Context + Hooks
- **Routing**: React Router 6

### Backend
- **Platform**: Supabase (PostgreSQL 15+ with pgvector)
- **Compute**: Supabase Edge Functions (Deno runtime)
- **Auth**: Supabase Auth

### AI Engine
- **Provider**: Google Gemini
- **Chat Model**: `gemini-3-pro-preview`
- **Embeddings**: `text-embedding-004`

---

## Quick Start

### Prerequisites
- Node.js 18+ & npm ([install with nvm](https://github.com/nvm-sh/nvm))
- Supabase account
- API keys (see Environment Variables section)

### Local Development

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Set up environment variables (see .env.example)
cp .env.example .env
# Edit .env with your keys

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

---

## Environment Variables

### Frontend (`.env`)
```env
VITE_SUPABASE_URL=https://luohiaujigqcjpzicxiz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key_here
```

### Backend (Supabase Edge Function Secrets)
Configure these in Supabase Dashboard → Edge Functions → Secrets:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ODDS_API_KEY=your_odds_api_key_from_the-odds-api.com
GEMINI_API_KEY=your_google_ai_studio_key
GOOGLE_API_KEY=your_google_ai_studio_key  # Alias for GEMINI_API_KEY
```

**Get API Keys:**
- **Odds API**: Sign up at [the-odds-api.com](https://the-odds-api.com/)
- **Google Gemini**: Get key from [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## Architecture

### Data Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  The Odds API   │────▶│  fetch-odds      │────▶│   nfl_games     │
│  (live lines)   │     │  Edge Function   │     │   (database)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐            │
│   ESPN API      │────▶│ fetch-nfl-stats  │────────────┤
│  (scores/stats) │     │  Edge Function   │            │
└─────────────────┘     └──────────────────┘            ▼
                                                  ┌──────────────────┐
┌─────────────────┐     ┌──────────────────┐    │  generate-pick   │
│  Google Gemini  │◀────│ AI Pick Gen      │◀───│  Edge Function   │
│  (AI analysis)  │────▶│ (structured)     │    │  (cron trigger)  │
└─────────────────┘     └──────────────────┘    └──────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │ analysis_memory  │
                        │   (with vector   │
                        │   embeddings)    │
                        └──────────────────┘
```

### AI Workflow

1. **Pick Generation** (automated):
   - Cron job triggers `generate-nfl-picks-cron`
   - Fetches game context (odds, stats, records)
   - Calls Gemini with structured prompt
   - Returns JSON with pick, confidence, reasoning
   - Generates embedding of reasoning text
   - Upserts to `analysis_memory` table

2. **Streaming Chat** (user-initiated):
   - User asks question about specific game
   - `ai-chat-router` receives request
   - Performs RAG lookup against `analysis_memory`
   - Optionally triggers Google Search tool
   - Streams response via Server-Sent Events (SSE)

---

## Database Schema

### Core Tables

**Game Data:**
- `nfl_games` - Game schedule, scores, status
- `nfl_team_stats` - Team performance metrics by week
- `nba_games` - NBA schedule and scores
- `betting_lines_history` - Historical line movements

**AI & Analysis:**
- `analysis_memory` - AI-generated picks with vector embeddings
- `ai_conversations` - User chat sessions
- `ai_messages` - Individual chat messages
- `memories` - Long-term user memory with embeddings

**User & System:**
- `profiles` - User profiles
- `organization_usage` - Credit tracking and quotas

### Key Enums
```sql
betting_market_type: 'moneyline' | 'puckline' | 'total' | 'prop'
nfl_season_type: 'preseason' | 'regular' | 'postseason'
```

See full schema dump in project_meta JSON or run:
```bash
supabase db dump --schema public
```

---

## Edge Functions

All functions are in `supabase/functions/`

### Data Fetching
- **`fetch-odds`**: Pulls latest betting lines from The Odds API
- **`fetch-nfl-stats`**: Syncs team statistics from ESPN
- **`fetch-standings`**: Updates team records and standings
- **`seed-nfl-schedule`**: Populates initial schedule data

### AI Processing
- **`generate-pick`**: Single pick generation for a game
- **`generate-nfl-picks-cron`**: Batch pick generation (cron trigger)
- **`ai-chat-router`**: Streaming chat with RAG and tool usage
- **`test-chat`**: Basic Gemini connection test

### Team Stats
- **`update-nfl-team-stats`**: Weekly stats sync (cron trigger)

### Deployment
Edge functions auto-deploy with code changes. No manual deployment needed.

---

## Operational Commands

### Seed Schedule
```bash
curl -X POST 'https://luohiaujigqcjpzicxiz.supabase.co/functions/v1/seed-nfl-schedule' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### Fetch Odds
```bash
curl -X POST 'https://luohiaujigqcjpzicxiz.supabase.co/functions/v1/fetch-odds' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"sport": "americanfootball_nfl", "daysFrom": 3}'
```

### Generate Picks (requires service role key)
```bash
curl -X POST 'https://luohiaujigqcjpzicxiz.supabase.co/functions/v1/generate-nfl-picks-cron' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY'
```

### Update Stats (requires service role key)
```bash
curl -X POST 'https://luohiaujigqcjpzicxiz.supabase.co/functions/v1/update-nfl-team-stats' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY'
```

---

## File Structure

```
src/
├── components/           # React components
│   ├── GameCard.tsx     # Individual game display
│   ├── ScheduleView.tsx # Game schedule grid
│   ├── PickDisplay.tsx  # AI pick visualization
│   ├── PickDetailModal.tsx # Detailed pick analysis with chat
│   ├── ChatMessage.tsx  # Chat bubble rendering
│   ├── Header.tsx       # Top navigation
│   └── ui/              # shadcn/ui components
├── hooks/
│   ├── useStreamingAIChat.ts # SSE chat hook
│   └── useAuth.tsx      # Supabase auth hook
├── services/
│   ├── pickGenerator.ts # Pick generation client
│   └── nhlAi.ts         # Legacy NHL service
├── utils/
│   └── bettingMath.ts   # EV & fair line calculations
├── context/
│   └── ChatContext.tsx  # Global chat state
├── pages/
│   ├── Auth.tsx         # Login/signup
│   └── NotFound.tsx     # 404 page
├── integrations/
│   └── supabase/
│       ├── client.ts    # Supabase client
│       └── types.ts     # Auto-generated DB types
├── types.ts             # Shared TypeScript types
└── index.css            # Tailwind + design tokens

supabase/
├── functions/           # Edge functions (Deno)
│   ├── _shared/cors.ts # CORS helper
│   ├── ai-chat-router/ # Main chat endpoint
│   ├── fetch-odds/     # Odds fetcher
│   ├── generate-pick/  # Single pick gen
│   └── [others]/       # Additional functions
├── migrations/          # SQL migrations
└── config.toml         # Supabase config
```

---

## Key Features

### 1. AI Pick Generation
- Automated analysis using Gemini with game context
- Confidence scoring (0-100%)
- Expected Value (EV) calculations
- Fair line estimation (no-vig odds)
- Staking recommendations

### 2. Streaming Chat Interface
- Real-time SSE streaming
- RAG using vector similarity on past picks
- Google Search tool integration
- Game-specific context injection

### 3. Betting Metrics
- **EV% Formula**: `((Confidence × Decimal Payout) - 1) × 100`
- **Fair Line**: No-vig odds based on confidence
- **Staking Bands**: Risk-based position sizing

---

## Development Workflow

1. **Make changes** in your IDE or via Lovable
2. **Test locally** with `npm run dev`
3. **Edge functions** auto-deploy on git push
4. **Frontend changes** require clicking "Update" in Lovable publish dialog
5. **Database migrations** use Lovable's migration tool

---

## Deployment

### Frontend
1. Open project in [Lovable](https://lovable.dev/projects/875a4243-439d-493d-b934-5c4e62a683a8)
2. Click **Share → Publish**
3. Click **Update** to deploy frontend changes

### Backend (Automatic)
- Edge functions deploy automatically on git push
- Database migrations deploy via Lovable's migration tool

### Custom Domain
1. Go to **Project → Settings → Domains**
2. Click **Connect Domain**
3. Follow DNS configuration instructions

Read more: [Custom domain setup](https://docs.lovable.dev/features/custom-domain)

---

## Troubleshooting

### "Can't connect to Supabase"
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`
- Check Supabase project is not paused (free tier auto-pauses after inactivity)

### "ODDS_API_KEY not found"
- Edge function secrets are configured in Supabase Dashboard, not `.env`
- Go to Edge Functions → Secrets in Supabase Dashboard

### "No picks generated"
- Run `fetch-odds` first to populate games with betting lines
- Check Edge Function logs in Supabase Dashboard
- Ensure games have valid `odds.draftkings` or `odds.generic` data

### "AI chat not streaming"
- Check browser console for CORS errors
- Verify `GEMINI_API_KEY` is set in Edge Function secrets
- Test with `test-chat` function first

---

## Contributing

1. Clone the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and test locally
4. Push and create a PR
5. Edge functions will auto-deploy on merge to main

---

## Resources

- **Lovable Project**: [Edit in Lovable](https://lovable.dev/projects/875a4243-439d-493d-b934-5c4e62a683a8)
- **Lovable Docs**: [docs.lovable.dev](https://docs.lovable.dev/)
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **The Odds API**: [the-odds-api.com/liveapi/guides/v4](https://the-odds-api.com/liveapi/guides/v4/)
- **Google Gemini**: [ai.google.dev/gemini-api/docs](https://ai.google.dev/gemini-api/docs)

---

## License

Proprietary - All rights reserved

## Support

For issues or questions, open an issue in this repository or contact the development team.
