import React, { useRef, useState } from 'react';
import { Clock, TrendingUp, PlayCircle, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import type { League } from '../types';

interface Article {
  id: string;
  title: string;
  author: string;
  timeAgo: string;
  imageUrl: string;
  type: 'Analysis' | 'Pick' | 'Video' | 'Props';
  league: League;
  tag: string;
}

interface FeaturedContentProps {
  league: League;
  onArticleClick: (query: string) => void;
}

const ARTICLES: Record<League, Article[]> = {
  NHL: [
    {
      id: 'nhl-1',
      title: "Rangers vs. Devils: Sharp Money Targeting the Over",
      author: "SharpEdge Staff",
      timeAgo: "1 hour ago",
      imageUrl: "https://images.unsplash.com/photo-1515703407324-5f753afd8be8?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NHL",
      tag: "Sharp Report"
    },
    {
      id: 'nhl-2',
      title: "Goalie Props: Hellebuyck's Save Count Over/Under",
      author: "Dom Lucz",
      timeAgo: "2 hours ago",
      imageUrl: "https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?q=80&w=600&auto=format&fit=crop",
      type: "Props",
      league: "NHL",
      tag: "Player Props"
    },
    {
      id: 'nhl-3',
      title: "Oilers Trends: Why the McDavid Line is Undervalued Tonight",
      author: "Analytics Team",
      timeAgo: "3 hours ago",
      imageUrl: "https://images.unsplash.com/photo-1599307222108-6878b6680a65?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NHL",
      tag: "System Play"
    },
    {
      id: 'nhl-4',
      title: "Tonight's Best Bets: 3 Picks for a loaded Slate",
      author: "Action Network",
      timeAgo: "4 hours ago",
      imageUrl: "https://images.unsplash.com/photo-1551103212-f4728f321d5a?q=80&w=600&auto=format&fit=crop",
      type: "Pick",
      league: "NHL",
      tag: "Best Bets"
    }
  ],
  NFL: [
    {
      id: 'nfl-1',
      title: "Panthers vs. 49ers: Stuckey's Spread Pick for MNF",
      author: "Stuckey",
      timeAgo: "1 hour ago",
      imageUrl: "https://images.unsplash.com/photo-1628717341663-0007b0ee2597?q=80&w=600&auto=format&fit=crop",
      type: "Pick",
      league: "NFL",
      tag: "Best Bets"
    },
    {
      id: 'nfl-2',
      title: "Anderson's Early NFL Week 13 Picks & Angles",
      author: "Brandon Anderson",
      timeAgo: "1 hour ago",
      imageUrl: "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NFL",
      tag: "Early Look"
    },
    {
      id: 'nfl-3',
      title: "NFL PrizePicks, Underdog Plays for Monday Night",
      author: "Doug Ziefel",
      timeAgo: "3 hours ago",
      imageUrl: "https://images.unsplash.com/photo-1598550476439-6847785fcea6?q=80&w=600&auto=format&fit=crop",
      type: "Props",
      league: "NFL",
      tag: "DFS / Props"
    },
    {
      id: 'nfl-4',
      title: "Public Betting: Where the Squares are Leaning",
      author: "Market Insights",
      timeAgo: "5 hours ago",
      imageUrl: "https://images.unsplash.com/photo-1518605348400-43ded60bdf08?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NFL",
      tag: "Fade Public"
    }
  ],
  NBA: [
    {
      id: 'nba-1',
      title: "Lakers vs. Warriors: LeBron James Prop Market Discrepancy",
      author: "PropMaster",
      timeAgo: "30 mins ago",
      imageUrl: "https://images.unsplash.com/photo-1504450758481-7338eba7524a?q=80&w=600&auto=format&fit=crop",
      type: "Props",
      league: "NBA",
      tag: "Prop Edge"
    },
    {
      id: 'nba-2',
      title: "Celtics Spread Analysis: Identifying the Inflation",
      author: "SharpEdge AI",
      timeAgo: "2 hours ago",
      imageUrl: "https://images.unsplash.com/photo-1519861531473-920026393112?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NBA",
      tag: "Model Pick"
    }
  ]
};

export const FeaturedContent = ({ league, onArticleClick }: FeaturedContentProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 320;
      scrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  const articles = ARTICLES[league] || ARTICLES['NHL'];

  return (
    <div className="w-full relative group/section my-8 motion-safe:animate-enter">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <TrendingUp size={14} className="text-accent" />
          Featured Insights
        </h3>
        
        <div className="flex gap-2">
          <button 
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`p-1.5 rounded-full border border-border/20 transition-all ${canScrollLeft ? 'bg-muted hover:bg-muted/80 text-foreground shadow-sm' : 'opacity-30 cursor-not-allowed text-muted-foreground'}`}
          >
            <ChevronLeft size={16} />
          </button>
          <button 
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`p-1.5 rounded-full border border-border/20 transition-all ${canScrollRight ? 'bg-muted hover:bg-muted/80 text-foreground shadow-sm' : 'opacity-30 cursor-not-allowed text-muted-foreground'}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-4 overflow-x-auto pb-6 scrollbar-hide snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {articles.map((article) => (
          <button
            key={article.id}
            onClick={() => onArticleClick(`Summarize the analysis for: ${article.title}`)}
            className="flex-shrink-0 w-[280px] md:w-[320px] snap-center text-left group/card relative rounded-2xl overflow-hidden bg-card border border-border/20 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-accent/30 hover:-translate-y-1"
          >
            {/* Image Area */}
            <div className="h-40 w-full relative overflow-hidden bg-muted">
               <img 
                 src={article.imageUrl} 
                 alt={article.title}
                 className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-105"
                 loading="lazy"
                 referrerPolicy="no-referrer"
               />
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />
               <div className="absolute inset-0 bg-accent/10 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 mix-blend-overlay" />
               
               {/* Type Tag */}
               <div className="absolute top-3 left-3 z-10">
                 <span className="px-2 py-1 rounded-md bg-black/50 backdrop-blur-md text-[10px] font-bold text-white uppercase tracking-wider border border-white/10 flex items-center gap-1 shadow-sm">
                   {article.type === 'Pick' && <CheckCircle2 size={10} className="text-green-400" />}
                   {article.type === 'Video' && <PlayCircle size={10} className="text-white" />}
                   {article.type === 'Analysis' && <TrendingUp size={10} className="text-blue-400" />}
                   {article.tag}
                 </span>
               </div>
            </div>

            {/* Content Area */}
            <div className="p-4 flex flex-col gap-2 h-[100px] justify-between">
              <h4 className="font-bold text-foreground text-sm md:text-base leading-tight line-clamp-2 group-hover/card:text-accent transition-colors">
                {article.title}
              </h4>
              
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/10 pt-2.5 mt-auto">
                <span className="font-medium flex items-center gap-1.5 truncate max-w-[140px]">
                   <span className="w-5 h-5 rounded-full bg-muted flex-shrink-0 flex items-center justify-center border border-border/20 text-[10px] font-bold">
                      {article.author.charAt(0)}
                   </span>
                   <span className="truncate">{article.author}</span>
                </span>
                <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono">
                  <Clock size={10} />
                  {article.timeAgo}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
