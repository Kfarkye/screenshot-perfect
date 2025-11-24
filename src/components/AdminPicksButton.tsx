import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export const AdminPicksButton = () => {
  const [loading, setLoading] = useState(false);

  const handleGeneratePicks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-nfl-picks-cron', {
        body: { manual_trigger: true }
      });

      if (error) throw error;

      toast.success(`Generated picks for ${data?.processed || 0} games!`);
      console.log('Pick generation results:', data);
    } catch (error) {
      console.error('Pick generation error:', error);
      toast.error('Failed to generate picks: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleGeneratePicks}
      disabled={loading}
      variant="outline"
      className="gap-2"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      Generate NFL Picks
    </Button>
  );
};
