import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export const AdminSeedButton = () => {
  const [loading, setLoading] = useState(false);

  const handleSeed = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-nfl-schedule', {
        body: {}
      });

      if (error) throw error;

      toast.success(`Successfully seeded ${data.games_seeded} NFL games!`);
      console.log('Seed results:', data);
    } catch (error) {
      console.error('Seed error:', error);
      toast.error('Failed to seed schedule: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSeed}
      disabled={loading}
      variant="outline"
      className="gap-2"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      Seed NFL Schedule
    </Button>
  );
};
