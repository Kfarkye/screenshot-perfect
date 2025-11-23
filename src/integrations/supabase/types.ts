export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      achievement_badges: {
        Row: {
          badge_type: string
          created_at: string | null
          description: string
          icon: string
          id: string
          name: string
          rarity: string
          unlock_criteria: Json
        }
        Insert: {
          badge_type: string
          created_at?: string | null
          description: string
          icon?: string
          id?: string
          name: string
          rarity?: string
          unlock_criteria: Json
        }
        Update: {
          badge_type?: string
          created_at?: string | null
          description?: string
          icon?: string
          id?: string
          name?: string
          rarity?: string
          unlock_criteria?: Json
        }
        Relationships: []
      }
      ai_artifacts: {
        Row: {
          created_at: string | null
          id: string
          ref_id: string
          rerank_score: number | null
          snippet_hash: string
          snippet_location: string | null
          snippet_text: string | null
          source_type: string
          source_uri: string | null
          space_run_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ref_id: string
          rerank_score?: number | null
          snippet_hash: string
          snippet_location?: string | null
          snippet_text?: string | null
          source_type: string
          source_uri?: string | null
          space_run_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ref_id?: string
          rerank_score?: number | null
          snippet_hash?: string
          snippet_location?: string | null
          snippet_text?: string | null
          source_type?: string
          source_uri?: string | null
          space_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_artifacts_space_run_id_fkey"
            columns: ["space_run_id"]
            isOneToOne: false
            referencedRelation: "space_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cache: {
        Row: {
          cache_key: string
          created_at: string | null
          expires_at: string
          output_data: Json
          pass_type: Database["public"]["Enums"]["ai_pass_type"]
          usage_metadata: Json
        }
        Insert: {
          cache_key: string
          created_at?: string | null
          expires_at: string
          output_data: Json
          pass_type: Database["public"]["Enums"]["ai_pass_type"]
          usage_metadata: Json
        }
        Update: {
          cache_key?: string
          created_at?: string | null
          expires_at?: string
          output_data?: Json
          pass_type?: Database["public"]["Enums"]["ai_pass_type"]
          usage_metadata?: Json
        }
        Relationships: []
      }
      ai_code_chunks: {
        Row: {
          chunk_text: string
          created_at: string | null
          embedding: string | null
          filename: string
          id: string
          language: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          chunk_text: string
          created_at?: string | null
          embedding?: string | null
          filename: string
          id?: string
          language?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          chunk_text?: string
          created_at?: string | null
          embedding?: string | null
          filename?: string
          id?: string
          language?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_code_chunks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          clinician_id: string | null
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["interaction_mode"] | null
          preferred_model: string | null
          preferred_provider: string | null
          project_id: string | null
          provider: string | null
          session_id: string
          space_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clinician_id?: string | null
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["interaction_mode"] | null
          preferred_model?: string | null
          preferred_provider?: string | null
          project_id?: string | null
          provider?: string | null
          session_id: string
          space_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clinician_id?: string | null
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["interaction_mode"] | null
          preferred_model?: string | null
          preferred_provider?: string | null
          project_id?: string | null
          provider?: string | null
          session_id?: string
          space_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
          {
            foreignKeyName: "ai_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cost_ledger: {
        Row: {
          ai_run_id: string
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          user_id: string
        }
        Insert: {
          ai_run_id: string
          cost_usd: number
          created_at?: string
          id?: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          user_id: string
        }
        Update: {
          ai_run_id?: string
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_cost_ledger_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cost_ledger_y2025m11: {
        Row: {
          ai_run_id: string
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          user_id: string
        }
        Insert: {
          ai_run_id: string
          cost_usd: number
          created_at?: string
          id?: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          user_id: string
        }
        Update: {
          ai_run_id?: string
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_cost_ledger_y2025m12: {
        Row: {
          ai_run_id: string
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          user_id: string
        }
        Insert: {
          ai_run_id: string
          cost_usd: number
          created_at?: string
          id?: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          user_id: string
        }
        Update: {
          ai_run_id?: string
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_documents: {
        Row: {
          clinician_id: string | null
          content: string
          created_at: string | null
          embedding: string | null
          filename: string | null
          id: string
          metadata: Json
          mode: Database["public"]["Enums"]["interaction_mode"]
          scope: Database["public"]["Enums"]["document_scope"]
          space_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clinician_id?: string | null
          content: string
          created_at?: string | null
          embedding?: string | null
          filename?: string | null
          id?: string
          metadata?: Json
          mode: Database["public"]["Enums"]["interaction_mode"]
          scope: Database["public"]["Enums"]["document_scope"]
          space_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clinician_id?: string | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          filename?: string | null
          id?: string
          metadata?: Json
          mode?: Database["public"]["Enums"]["interaction_mode"]
          scope?: Database["public"]["Enums"]["document_scope"]
          space_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_documents_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_documents_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
          {
            foreignKeyName: "ai_documents_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_lanes: {
        Row: {
          config_json: Json
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          config_json: Json
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          config_json?: Json
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      ai_memory_artifacts_backup_20251118: {
        Row: {
          content: Json | null
          context: string | null
          conversation_id: string | null
          created_at: string | null
          embedding: string | null
          id: string | null
          last_accessed_at: string | null
          priority: string | null
          space_id: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content?: Json | null
          context?: string | null
          conversation_id?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string | null
          last_accessed_at?: string | null
          priority?: string | null
          space_id?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: Json | null
          context?: string | null
          conversation_id?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string | null
          last_accessed_at?: string | null
          priority?: string | null
          space_id?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: number
          image_attachments: Json | null
          metadata: Json | null
          model: string | null
          provider: string | null
          rated_at: string | null
          rating: string | null
          role: string
          task_type: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          correlation_id?: string | null
          created_at?: string
          id?: number
          image_attachments?: Json | null
          metadata?: Json | null
          model?: string | null
          provider?: string | null
          rated_at?: string | null
          rating?: string | null
          role: string
          task_type?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          correlation_id?: string | null
          created_at?: string
          id?: number
          image_attachments?: Json | null
          metadata?: Json | null
          model?: string | null
          provider?: string | null
          rated_at?: string | null
          rating?: string | null
          role?: string
          task_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_run_checks: {
        Row: {
          candidate_run_id: string
          check_name: string
          check_type: string
          created_at: string | null
          id: string
          reasoning: string | null
          status: string
          verifier_run_id: string
        }
        Insert: {
          candidate_run_id: string
          check_name: string
          check_type: string
          created_at?: string | null
          id?: string
          reasoning?: string | null
          status: string
          verifier_run_id: string
        }
        Update: {
          candidate_run_id?: string
          check_name?: string
          check_type?: string
          created_at?: string | null
          id?: string
          reasoning?: string | null
          status?: string
          verifier_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_run_checks_candidate_run_id_fkey"
            columns: ["candidate_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_run_checks_verifier_run_id_fkey"
            columns: ["verifier_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          cache_hit: boolean | null
          created_at: string | null
          execution_params: Json | null
          id: string
          input_data: Json | null
          input_tokens: number | null
          is_winner: boolean | null
          latency_ms: number | null
          model_name: string | null
          output_data: Json | null
          output_tokens: number | null
          pass_candidate: number | null
          pass_type: Database["public"]["Enums"]["ai_pass_type"]
          space_run_id: string
        }
        Insert: {
          cache_hit?: boolean | null
          created_at?: string | null
          execution_params?: Json | null
          id?: string
          input_data?: Json | null
          input_tokens?: number | null
          is_winner?: boolean | null
          latency_ms?: number | null
          model_name?: string | null
          output_data?: Json | null
          output_tokens?: number | null
          pass_candidate?: number | null
          pass_type: Database["public"]["Enums"]["ai_pass_type"]
          space_run_id: string
        }
        Update: {
          cache_hit?: boolean | null
          created_at?: string | null
          execution_params?: Json | null
          id?: string
          input_data?: Json | null
          input_tokens?: number | null
          is_winner?: boolean | null
          latency_ms?: number | null
          model_name?: string | null
          output_data?: Json | null
          output_tokens?: number | null
          pass_candidate?: number | null
          pass_type?: Database["public"]["Enums"]["ai_pass_type"]
          space_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_space_run_id_fkey"
            columns: ["space_run_id"]
            isOneToOne: false
            referencedRelation: "space_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_versions: {
        Row: {
          artifact_id: string
          changed_by: string | null
          compiled_content: string | null
          content: string
          created_at: string | null
          id: string
          version_number: number
        }
        Insert: {
          artifact_id: string
          changed_by?: string | null
          compiled_content?: string | null
          content: string
          created_at?: string | null
          id?: string
          version_number: number
        }
        Update: {
          artifact_id?: string
          changed_by?: string | null
          compiled_content?: string | null
          content?: string
          created_at?: string | null
          id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifact_versions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          artifact_type: string
          content: string | null
          conversation_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          name: string | null
          storage_path: string | null
          user_id: string
        }
        Insert: {
          artifact_type: string
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          storage_path?: string | null
          user_id: string
        }
        Update: {
          artifact_type?: string
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          clinician_id: string
          created_at: string | null
          end_date: string
          facility_name: string
          id: string
          start_date: string
          status: string | null
          user_id: string
        }
        Insert: {
          clinician_id: string
          created_at?: string | null
          end_date: string
          facility_name: string
          id?: string
          start_date: string
          status?: string | null
          user_id: string
        }
        Update: {
          clinician_id?: string
          created_at?: string | null
          end_date?: string
          facility_name?: string
          id?: string
          start_date?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
        ]
      }
      betting_lines_history: {
        Row: {
          away_team: string
          created_at: string | null
          current_moneyline_away: number | null
          current_moneyline_home: number | null
          current_spread_away: number | null
          current_spread_home: number | null
          current_total: number | null
          game_date: string
          game_id: string
          home_team: string
          id: string
          last_updated: string | null
          open_moneyline_away: number | null
          open_moneyline_home: number | null
          open_spread_away: number | null
          open_spread_home: number | null
          open_total: number | null
          public_percentage_away: number | null
          public_percentage_home: number | null
          sharp_action: string | null
          source: string | null
          sport: string
          spread_movement: string | null
          total_movement: string | null
        }
        Insert: {
          away_team: string
          created_at?: string | null
          current_moneyline_away?: number | null
          current_moneyline_home?: number | null
          current_spread_away?: number | null
          current_spread_home?: number | null
          current_total?: number | null
          game_date: string
          game_id: string
          home_team: string
          id?: string
          last_updated?: string | null
          open_moneyline_away?: number | null
          open_moneyline_home?: number | null
          open_spread_away?: number | null
          open_spread_home?: number | null
          open_total?: number | null
          public_percentage_away?: number | null
          public_percentage_home?: number | null
          sharp_action?: string | null
          source?: string | null
          sport: string
          spread_movement?: string | null
          total_movement?: string | null
        }
        Update: {
          away_team?: string
          created_at?: string | null
          current_moneyline_away?: number | null
          current_moneyline_home?: number | null
          current_spread_away?: number | null
          current_spread_home?: number | null
          current_total?: number | null
          game_date?: string
          game_id?: string
          home_team?: string
          id?: string
          last_updated?: string | null
          open_moneyline_away?: number | null
          open_moneyline_home?: number | null
          open_spread_away?: number | null
          open_spread_home?: number | null
          open_total?: number | null
          public_percentage_away?: number | null
          public_percentage_home?: number | null
          sharp_action?: string | null
          source?: string | null
          sport?: string
          spread_movement?: string | null
          total_movement?: string | null
        }
        Relationships: []
      }
      clinician_communication_profiles: {
        Row: {
          clinician_id: string
          communication_style: string
          created_at: string | null
          id: string
          last_contacted: string | null
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clinician_id: string
          communication_style?: string
          created_at?: string | null
          id?: string
          last_contacted?: string | null
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clinician_id?: string
          communication_style?: string
          created_at?: string | null
          id?: string
          last_contacted?: string | null
          notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinician_communication_profiles_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: true
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinician_communication_profiles_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: true
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
        ]
      }
      clinician_interactions: {
        Row: {
          clinician_id: string
          id: string
          interaction_date: string | null
          interaction_summary: string | null
          interaction_type: string
          user_id: string
        }
        Insert: {
          clinician_id: string
          id?: string
          interaction_date?: string | null
          interaction_summary?: string | null
          interaction_type: string
          user_id: string
        }
        Update: {
          clinician_id?: string
          id?: string
          interaction_date?: string | null
          interaction_summary?: string | null
          interaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinician_interactions_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinician_interactions_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
        ]
      }
      clinician_profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      clipboard_items: {
        Row: {
          content: string
          created_at: string | null
          id: string
          item_type: string
          notes: string | null
          source_app: string | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          item_type: string
          notes?: string | null
          source_app?: string | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          item_type?: string
          notes?: string | null
          source_app?: string | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      code_snippets: {
        Row: {
          content: string
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          fts_vector: unknown
          id: string
          language: string | null
          line_count: number | null
          message_id: string
          order_index: number | null
          updated_at: string | null
          user_defined_name: string | null
          user_id: string
        }
        Insert: {
          content: string
          content_hash?: string | null
          conversation_id?: string | null
          created_at?: string | null
          fts_vector?: unknown
          id?: string
          language?: string | null
          line_count?: number | null
          message_id: string
          order_index?: number | null
          updated_at?: string | null
          user_defined_name?: string | null
          user_id: string
        }
        Update: {
          content?: string
          content_hash?: string | null
          conversation_id?: string | null
          created_at?: string | null
          fts_vector?: unknown
          id?: string
          language?: string | null
          line_count?: number | null
          message_id?: string
          order_index?: number | null
          updated_at?: string | null
          user_defined_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_snippets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      design_specs: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_favorite: boolean | null
          name: string
          spec_data: Json
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          name: string
          spec_data?: Json
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          name?: string
          spec_data?: Json
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      extracted_schemas: {
        Row: {
          conversation_id: string
          description: string | null
          extracted_at: string
          file_size: number
          format: string
          id: string
          is_favorite: boolean | null
          message_id: number
          name: string
          parent_schema_id: string | null
          storage_path: string
          tags: string[] | null
          user_id: string
          version: number
        }
        Insert: {
          conversation_id: string
          description?: string | null
          extracted_at?: string
          file_size: number
          format: string
          id?: string
          is_favorite?: boolean | null
          message_id: number
          name: string
          parent_schema_id?: string | null
          storage_path: string
          tags?: string[] | null
          user_id: string
          version?: number
        }
        Update: {
          conversation_id?: string
          description?: string | null
          extracted_at?: string
          file_size?: number
          format?: string
          id?: string
          is_favorite?: boolean | null
          message_id?: number
          name?: string
          parent_schema_id?: string | null
          storage_path?: string
          tags?: string[] | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "extracted_schemas_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_schemas_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_schemas_parent_schema_id_fkey"
            columns: ["parent_schema_id"]
            isOneToOne: false
            referencedRelation: "extracted_schemas"
            referencedColumns: ["id"]
          },
        ]
      }
      fast_jobs: {
        Row: {
          contact_info: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          facility_name: string
          filled_by_candidate_id: string | null
          hourly_rate: number | null
          id: string
          job_id: string
          location: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["job_priority"] | null
          requirements: string[] | null
          shift_pattern: string | null
          specialty: string
          start_date: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          contact_info?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          facility_name: string
          filled_by_candidate_id?: string | null
          hourly_rate?: number | null
          id?: string
          job_id: string
          location?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["job_priority"] | null
          requirements?: string[] | null
          shift_pattern?: string | null
          specialty: string
          start_date?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          contact_info?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          facility_name?: string
          filled_by_candidate_id?: string | null
          hourly_rate?: number | null
          id?: string
          job_id?: string
          location?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["job_priority"] | null
          requirements?: string[] | null
          shift_pattern?: string | null
          specialty?: string
          start_date?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          feature_name: string
          id: string
          rollout_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          feature_name: string
          id?: string
          rollout_percentage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          feature_name?: string
          id?: string
          rollout_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      learning_paths: {
        Row: {
          created_at: string | null
          description: string
          estimated_hours: number
          id: string
          is_active: boolean
          name: string
          target_skill: string
          tutorial_sequence: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          estimated_hours?: number
          id?: string
          is_active?: boolean
          name: string
          target_skill: string
          tutorial_sequence?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          estimated_hours?: number
          id?: string
          is_active?: boolean
          name?: string
          target_skill?: string
          tutorial_sequence?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      memories: {
        Row: {
          clinician_id: string | null
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          kind: string
          metadata: Json | null
          mode: Database["public"]["Enums"]["interaction_mode"] | null
          project_id: string | null
          source_conversation_id: string | null
          source_message_id: number | null
          space_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clinician_id?: string | null
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          mode?: Database["public"]["Enums"]["interaction_mode"] | null
          project_id?: string | null
          source_conversation_id?: string | null
          source_message_id?: number | null
          space_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clinician_id?: string | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          mode?: Database["public"]["Enums"]["interaction_mode"] | null
          project_id?: string | null
          source_conversation_id?: string | null
          source_message_id?: number | null
          space_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
          {
            foreignKeyName: "memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "memory_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_spaces: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          project_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          project_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_spaces_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      message_ratings: {
        Row: {
          conversation_id: string
          created_at: string | null
          feedback_text: string | null
          id: string
          message_id: number
          message_length: number | null
          metadata: Json | null
          model_used: string | null
          rating: string
          response_time_ms: number | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          message_id: number
          message_length?: number | null
          metadata?: Json | null
          model_used?: string | null
          rating: string
          response_time_ms?: number | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          message_id?: number
          message_length?: number | null
          metadata?: Json | null
          model_used?: string | null
          rating?: string
          response_time_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_ratings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_ratings_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      nba_games: {
        Row: {
          away_score: number | null
          away_team: string
          created_at: string | null
          game_data: Json | null
          game_date: string
          game_id: string
          home_score: number | null
          home_team: string
          id: string
          season: string
          start_time: string
          status: string
          updated_at: string | null
          venue: string | null
        }
        Insert: {
          away_score?: number | null
          away_team: string
          created_at?: string | null
          game_data?: Json | null
          game_date: string
          game_id: string
          home_score?: number | null
          home_team: string
          id?: string
          season: string
          start_time: string
          status?: string
          updated_at?: string | null
          venue?: string | null
        }
        Update: {
          away_score?: number | null
          away_team?: string
          created_at?: string | null
          game_data?: Json | null
          game_date?: string
          game_id?: string
          home_score?: number | null
          home_team?: string
          id?: string
          season?: string
          start_time?: string
          status?: string
          updated_at?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      organization_usage: {
        Row: {
          alert_threshold_80: boolean | null
          alert_threshold_90: boolean | null
          created_at: string | null
          current_usage_usd: number | null
          id: string
          monthly_allowance_usd: number | null
          organization_name: string | null
          reset_date: string
          search_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_threshold_80?: boolean | null
          alert_threshold_90?: boolean | null
          created_at?: string | null
          current_usage_usd?: number | null
          id?: string
          monthly_allowance_usd?: number | null
          organization_name?: string | null
          reset_date?: string
          search_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_threshold_80?: boolean | null
          alert_threshold_90?: boolean | null
          created_at?: string | null
          current_usage_usd?: number | null
          id?: string
          monthly_allowance_usd?: number | null
          organization_name?: string | null
          reset_date?: string
          search_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      player_data_cache: {
        Row: {
          career_stats: Json | null
          confidence_score: number | null
          created_at: string | null
          data_source: string | null
          expected_return: string | null
          expires_at: string
          game_status: string | null
          id: string
          injury_details: string | null
          injury_status: string | null
          last_game_date: string | null
          player_name: string
          position: string | null
          props: Json | null
          recent_stats: Json | null
          season_stats: Json | null
          sport: string
          team: string
          updated_at: string | null
        }
        Insert: {
          career_stats?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          data_source?: string | null
          expected_return?: string | null
          expires_at: string
          game_status?: string | null
          id?: string
          injury_details?: string | null
          injury_status?: string | null
          last_game_date?: string | null
          player_name: string
          position?: string | null
          props?: Json | null
          recent_stats?: Json | null
          season_stats?: Json | null
          sport: string
          team: string
          updated_at?: string | null
        }
        Update: {
          career_stats?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          data_source?: string | null
          expected_return?: string | null
          expires_at?: string
          game_status?: string | null
          id?: string
          injury_details?: string | null
          injury_status?: string | null
          last_game_date?: string | null
          player_name?: string
          position?: string | null
          props?: Json | null
          recent_stats?: Json | null
          season_stats?: Json | null
          sport?: string
          team?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      project_files: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          is_dir: boolean | null
          path: string
          project_id: string | null
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_dir?: boolean | null
          path: string
          project_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_dir?: boolean | null
          path?: string
          project_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          clinician_id: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          owner_id: string | null
          slug: string | null
          system_prompt: string | null
          template: string | null
          type: Database["public"]["Enums"]["project_type"] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          clinician_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
          slug?: string | null
          system_prompt?: string | null
          template?: string | null
          type?: Database["public"]["Enums"]["project_type"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          clinician_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string | null
          system_prompt?: string | null
          template?: string | null
          type?: Database["public"]["Enums"]["project_type"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          category: string
          created_at: string | null
          effectiveness_rating: number | null
          example_result: string | null
          id: string
          is_public: boolean
          template_text: string
          times_used: number
          title: string
          updated_at: string | null
          use_case: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          effectiveness_rating?: number | null
          example_result?: string | null
          id?: string
          is_public?: boolean
          template_text: string
          times_used?: number
          title: string
          updated_at?: string | null
          use_case: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          effectiveness_rating?: number | null
          example_result?: string | null
          id?: string
          is_public?: boolean
          template_text?: string
          times_used?: number
          title?: string
          updated_at?: string | null
          use_case?: string
          user_id?: string | null
        }
        Relationships: []
      }
      provider_calls: {
        Row: {
          cost_usd: number | null
          created_at: string | null
          endpoint: string
          error_message: string | null
          id: string
          latency_ms: number | null
          model: string
          provider: string
          request_id: string
          schema_ok: boolean | null
          success: boolean
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string | null
          endpoint: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model: string
          provider: string
          request_id: string
          schema_ok?: boolean | null
          success: boolean
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string | null
          endpoint?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string
          provider?: string
          request_id?: string
          schema_ok?: boolean | null
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_calls_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_messages: {
        Row: {
          clinician_id: string | null
          created_at: string | null
          generated_reply_1: string | null
          generated_reply_2: string | null
          id: string
          incoming_text: string | null
          message_type: string
          metadata: Json | null
          selected_reply: string | null
          thread_id: string
          user_goal: string | null
          user_id: string
        }
        Insert: {
          clinician_id?: string | null
          created_at?: string | null
          generated_reply_1?: string | null
          generated_reply_2?: string | null
          id?: string
          incoming_text?: string | null
          message_type: string
          metadata?: Json | null
          selected_reply?: string | null
          thread_id: string
          user_goal?: string | null
          user_id: string
        }
        Update: {
          clinician_id?: string | null
          created_at?: string | null
          generated_reply_1?: string | null
          generated_reply_2?: string | null
          id?: string
          incoming_text?: string | null
          message_type?: string
          metadata?: Json | null
          selected_reply?: string | null
          thread_id?: string
          user_goal?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_messages_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_messages_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
          {
            foreignKeyName: "reply_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "reply_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_threads: {
        Row: {
          created_at: string | null
          id: string
          project_id: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      request_contexts: {
        Row: {
          clinician_id: string | null
          conversation_id: string | null
          created_at: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          lane: string
          mode: string
          session_id: string | null
          space_id: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          clinician_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          lane: string
          mode: string
          session_id?: string | null
          space_id?: string | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          clinician_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          lane?: string
          mode?: string
          session_id?: string | null
          space_id?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_contexts_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "clinician_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_contexts_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "recruiter_dashboard"
            referencedColumns: ["clinician_id"]
          },
          {
            foreignKeyName: "request_contexts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_schemas: {
        Row: {
          content: Json
          created_at: string
          id: string
          name: string
          project_id: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          name: string
          project_id?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          name?: string
          project_id?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_schemas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshot_parses: {
        Row: {
          candidate_created_id: string | null
          confidence_score: number | null
          created_at: string | null
          created_by: string | null
          file_name: string | null
          file_url: string | null
          id: string
          memory_entry_id: string | null
          parsed_data: Json
          processing_time_ms: number | null
        }
        Insert: {
          candidate_created_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          memory_entry_id?: string | null
          parsed_data: Json
          processing_time_ms?: number | null
        }
        Update: {
          candidate_created_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          memory_entry_id?: string | null
          parsed_data?: Json
          processing_time_ms?: number | null
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          created_at: string | null
          expires_at: string
          hit_count: number | null
          last_accessed_at: string | null
          metadata: Json | null
          model_used: string | null
          query_hash: string
          query_text: string
          response_payload: Json
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          hit_count?: number | null
          last_accessed_at?: string | null
          metadata?: Json | null
          model_used?: string | null
          query_hash: string
          query_text: string
          response_payload: Json
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          hit_count?: number | null
          last_accessed_at?: string | null
          metadata?: Json | null
          model_used?: string | null
          query_hash?: string
          query_text?: string
          response_payload?: Json
        }
        Relationships: []
      }
      search_queries: {
        Row: {
          cache_hit: boolean | null
          conversation_id: string | null
          correlation_id: string | null
          cost_usd: number | null
          created_at: string | null
          detected_intent: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          provider_model: string
          query_text: string
          search_triggered_by: string | null
          search_type: string | null
          session_id: string | null
          sport: string | null
          tokens_input: number | null
          tokens_output: number | null
          user_id: string
        }
        Insert: {
          cache_hit?: boolean | null
          conversation_id?: string | null
          correlation_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          detected_intent?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          provider_model: string
          query_text: string
          search_triggered_by?: string | null
          search_type?: string | null
          session_id?: string | null
          sport?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id: string
        }
        Update: {
          cache_hit?: boolean | null
          conversation_id?: string | null
          correlation_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          detected_intent?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          provider_model?: string
          query_text?: string
          search_triggered_by?: string | null
          search_type?: string | null
          session_id?: string | null
          sport?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string
        }
        Relationships: []
      }
      search_results: {
        Row: {
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          published_date: string | null
          query_id: string
          rank: number
          source_domain: string | null
          source_snippet: string | null
          source_title: string
          source_url: string
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          published_date?: string | null
          query_id: string
          rank: number
          source_domain?: string | null
          source_snippet?: string | null
          source_title: string
          source_url: string
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          published_date?: string | null
          query_id?: string
          rank?: number
          source_domain?: string | null
          source_snippet?: string | null
          source_title?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_results_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "search_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      snippet_bookmarks: {
        Row: {
          created_at: string | null
          folder_path: unknown
          id: string
          notes: string | null
          snippet_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          folder_path?: unknown
          id?: string
          notes?: string | null
          snippet_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          folder_path?: unknown
          id?: string
          notes?: string | null
          snippet_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snippet_bookmarks_snippet_id_fkey"
            columns: ["snippet_id"]
            isOneToOne: false
            referencedRelation: "code_snippets"
            referencedColumns: ["id"]
          },
        ]
      }
      snippet_tags: {
        Row: {
          snippet_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          snippet_id: string
          tag_id: string
          user_id: string
        }
        Update: {
          snippet_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snippet_tags_snippet_id_fkey"
            columns: ["snippet_id"]
            isOneToOne: false
            referencedRelation: "code_snippets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snippet_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      space_runs: {
        Row: {
          created_at: string | null
          end_time: string | null
          final_output: Json | null
          goal_prompt: string
          id: string
          lane_id: string
          residual_risk: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["run_status"] | null
          total_cost_usd: number | null
          total_latency_ms: number | null
          total_tokens: number | null
          trace_id: string
          user_id: string
          verify_score: number | null
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          final_output?: Json | null
          goal_prompt: string
          id?: string
          lane_id: string
          residual_risk?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["run_status"] | null
          total_cost_usd?: number | null
          total_latency_ms?: number | null
          total_tokens?: number | null
          trace_id: string
          user_id: string
          verify_score?: number | null
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          final_output?: Json | null
          goal_prompt?: string
          id?: string
          lane_id?: string
          residual_risk?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["run_status"] | null
          total_cost_usd?: number | null
          total_latency_ms?: number | null
          total_tokens?: number | null
          trace_id?: string
          user_id?: string
          verify_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "space_runs_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "ai_lanes"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_analytics_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          players: string[] | null
          properties: Json | null
          query_id: string | null
          search_type: string | null
          sport: string | null
          teams: string[] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          players?: string[] | null
          properties?: Json | null
          query_id?: string | null
          search_type?: string | null
          sport?: string | null
          teams?: string[] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          players?: string[] | null
          properties?: Json | null
          query_id?: string | null
          search_type?: string | null
          sport?: string | null
          teams?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_analytics_events_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "search_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_data_cache: {
        Row: {
          confidence_score: number | null
          conflicts_detected: string[] | null
          created_at: string | null
          data_payload: Json
          data_type: string
          expires_at: string
          id: string
          query_id: string | null
          sources: string[] | null
          sport: string | null
          updated_at: string | null
        }
        Insert: {
          confidence_score?: number | null
          conflicts_detected?: string[] | null
          created_at?: string | null
          data_payload: Json
          data_type: string
          expires_at: string
          id?: string
          query_id?: string | null
          sources?: string[] | null
          sport?: string | null
          updated_at?: string | null
        }
        Update: {
          confidence_score?: number | null
          conflicts_detected?: string[] | null
          created_at?: string | null
          data_payload?: Json
          data_type?: string
          expires_at?: string
          id?: string
          query_id?: string | null
          sources?: string[] | null
          sport?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_data_cache_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "search_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_items: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          item_type: string
          mime_type: string | null
          name: string
          parent_id: string | null
          size_bytes: number | null
          storage_path: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          item_type: string
          mime_type?: string | null
          name: string
          parent_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          item_type?: string
          mime_type?: string | null
          name?: string
          parent_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "storage_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stored_files: {
        Row: {
          content: string
          created_at: string
          id: string
          mime_type: string
          name: string
          size: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mime_type: string
          name: string
          size: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mime_type?: string
          name?: string
          size?: number
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color_hex: string | null
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      team_rosters: {
        Row: {
          conference: string | null
          created_at: string | null
          division: string | null
          id: string
          last_updated: string | null
          players: Json
          recent_form: string | null
          record: string | null
          season: string | null
          sport: string
          standing: string | null
          team_abbreviation: string | null
          team_name: string
        }
        Insert: {
          conference?: string | null
          created_at?: string | null
          division?: string | null
          id?: string
          last_updated?: string | null
          players: Json
          recent_form?: string | null
          record?: string | null
          season?: string | null
          sport: string
          standing?: string | null
          team_abbreviation?: string | null
          team_name: string
        }
        Update: {
          conference?: string | null
          created_at?: string | null
          division?: string | null
          id?: string
          last_updated?: string | null
          players?: Json
          recent_form?: string | null
          record?: string | null
          season?: string | null
          sport?: string
          standing?: string | null
          team_abbreviation?: string | null
          team_name?: string
        }
        Relationships: []
      }
      tutorial_categories: {
        Row: {
          created_at: string | null
          description: string
          icon: string
          id: string
          name: string
          skill_mapping: Json
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          description: string
          icon?: string
          id?: string
          name: string
          skill_mapping?: Json
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          icon?: string
          id?: string
          name?: string
          skill_mapping?: Json
          sort_order?: number
        }
        Relationships: []
      }
      tutorial_exercises: {
        Row: {
          created_at: string | null
          exercise_type: string
          hints: Json | null
          id: string
          instructions: string
          max_attempts: number | null
          solution_code: string
          sort_order: number
          starter_code: string | null
          test_cases: Json | null
          title: string
          tutorial_id: string
        }
        Insert: {
          created_at?: string | null
          exercise_type: string
          hints?: Json | null
          id?: string
          instructions: string
          max_attempts?: number | null
          solution_code: string
          sort_order?: number
          starter_code?: string | null
          test_cases?: Json | null
          title: string
          tutorial_id: string
        }
        Update: {
          created_at?: string | null
          exercise_type?: string
          hints?: Json | null
          id?: string
          instructions?: string
          max_attempts?: number | null
          solution_code?: string
          sort_order?: number
          starter_code?: string | null
          test_cases?: Json | null
          title?: string
          tutorial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_exercises_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "tutorials"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_steps: {
        Row: {
          created_at: string | null
          explanation: string
          highlight_spec: string | null
          id: string
          is_completed: boolean
          step_number: number
          tutorial_id: string
        }
        Insert: {
          created_at?: string | null
          explanation: string
          highlight_spec?: string | null
          id?: string
          is_completed?: boolean
          step_number: number
          tutorial_id: string
        }
        Update: {
          created_at?: string | null
          explanation?: string
          highlight_spec?: string | null
          id?: string
          is_completed?: boolean
          step_number?: number
          tutorial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_steps_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "tutorials"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_version_diff: {
        Row: {
          additions: number
          created_at: string | null
          deletions: number
          diff_summary: string | null
          id: string
          parent_version_id: string
          version_id: string
        }
        Insert: {
          additions?: number
          created_at?: string | null
          deletions?: number
          diff_summary?: string | null
          id?: string
          parent_version_id: string
          version_id: string
        }
        Update: {
          additions?: number
          created_at?: string | null
          deletions?: number
          diff_summary?: string | null
          id?: string
          parent_version_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_version_diff_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "tutorial_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_version_diff_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "tutorial_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_versions: {
        Row: {
          code_snapshot: string
          created_at: string | null
          description: string
          file_path: string | null
          id: string
          is_starred: boolean
          language: string
          parent_version_id: string | null
          project_id: string | null
          tags: string[] | null
          tutorial_id: string | null
          user_id: string
          version_name: string
        }
        Insert: {
          code_snapshot: string
          created_at?: string | null
          description?: string
          file_path?: string | null
          id?: string
          is_starred?: boolean
          language?: string
          parent_version_id?: string | null
          project_id?: string | null
          tags?: string[] | null
          tutorial_id?: string | null
          user_id: string
          version_name: string
        }
        Update: {
          code_snapshot?: string
          created_at?: string | null
          description?: string
          file_path?: string | null
          id?: string
          is_starred?: boolean
          language?: string
          parent_version_id?: string | null
          project_id?: string | null
          tags?: string[] | null
          tutorial_id?: string | null
          user_id?: string
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "tutorial_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_versions_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "tutorials"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorials: {
        Row: {
          category_id: string | null
          code: string
          completion_percentage: number
          created_at: string | null
          difficulty: string | null
          error_message: string | null
          estimated_duration_minutes: number | null
          exercise_data: Json | null
          id: string
          language: string
          last_accessed_at: string | null
          prerequisites: Json | null
          project_id: string | null
          skill_focus: Json | null
          status: string
          title: string
          total_steps: number
          tutorial_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_id?: string | null
          code: string
          completion_percentage?: number
          created_at?: string | null
          difficulty?: string | null
          error_message?: string | null
          estimated_duration_minutes?: number | null
          exercise_data?: Json | null
          id?: string
          language?: string
          last_accessed_at?: string | null
          prerequisites?: Json | null
          project_id?: string | null
          skill_focus?: Json | null
          status?: string
          title: string
          total_steps?: number
          tutorial_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_id?: string | null
          code?: string
          completion_percentage?: number
          created_at?: string | null
          difficulty?: string | null
          error_message?: string | null
          estimated_duration_minutes?: number | null
          exercise_data?: Json | null
          id?: string
          language?: string
          last_accessed_at?: string | null
          prerequisites?: Json | null
          project_id?: string | null
          skill_focus?: Json | null
          status?: string
          title?: string
          total_steps?: number
          tutorial_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tutorial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_images: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          file_size: number
          height: number | null
          id: string
          message_id: number | null
          mime_type: string
          original_filename: string
          public_url: string | null
          session_id: string
          signed_url: string | null
          storage_path: string
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          width: number | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          file_size?: number
          height?: number | null
          id?: string
          message_id?: number | null
          mime_type?: string
          original_filename: string
          public_url?: string | null
          session_id: string
          signed_url?: string | null
          storage_path: string
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
          width?: number | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          file_size?: number
          height?: number | null
          id?: string
          message_id?: number | null
          mime_type?: string
          original_filename?: string
          public_url?: string | null
          session_id?: string
          signed_url?: string | null
          storage_path?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_images_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_images_cleanup_log: {
        Row: {
          deleted_count: number
          executed_at: string | null
          id: string
          storage_paths: string[] | null
        }
        Insert: {
          deleted_count: number
          executed_at?: string | null
          id?: string
          storage_paths?: string[] | null
        }
        Update: {
          deleted_count?: number
          executed_at?: string | null
          id?: string
          storage_paths?: string[] | null
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          progress_snapshot: Json | null
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          progress_snapshot?: Json | null
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          progress_snapshot?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "achievement_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_contexts: {
        Row: {
          character_count: number
          context_content: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          token_estimate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          character_count?: number
          context_content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          token_estimate?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          character_count?: number
          context_content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          token_estimate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          event_type: string | null
          id: number
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          event_type?: string | null
          id: number
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: number
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_exercise_attempts: {
        Row: {
          attempt_number: number
          created_at: string | null
          exercise_id: string
          feedback: string | null
          hints_used: number
          id: string
          is_correct: boolean
          submitted_code: string | null
          submitted_prompt: string | null
          time_spent_seconds: number | null
          user_id: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string | null
          exercise_id: string
          feedback?: string | null
          hints_used?: number
          id?: string
          is_correct?: boolean
          submitted_code?: string | null
          submitted_prompt?: string | null
          time_spent_seconds?: number | null
          user_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string | null
          exercise_id?: string
          feedback?: string | null
          hints_used?: number
          id?: string
          is_correct?: boolean
          submitted_code?: string | null
          submitted_prompt?: string | null
          time_spent_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exercise_attempts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "tutorial_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          created_at: string
          feature_name: string
          feedback_content: string
          feedback_type: string
          id: string
          status: string
          updated_at: string
          user_context: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_name: string
          feedback_content: string
          feedback_type: string
          id?: string
          status?: string
          updated_at?: string
          user_context?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          feature_name?: string
          feedback_content?: string
          feedback_type?: string
          id?: string
          status?: string
          updated_at?: string
          user_context?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_learning_progress: {
        Row: {
          completed_at: string | null
          current_tutorial_index: number
          id: string
          last_activity_at: string | null
          learning_path_id: string
          started_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          current_tutorial_index?: number
          id?: string
          last_activity_at?: string | null
          learning_path_id: string
          started_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          current_tutorial_index?: number
          id?: string
          last_activity_at?: string | null
          learning_path_id?: string
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_learning_progress_learning_path_id_fkey"
            columns: ["learning_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding_state: {
        Row: {
          created_at: string | null
          has_seen_spaces_intro: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          has_seen_spaces_intro?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          has_seen_spaces_intro?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string | null
          features: Json | null
          system_prompts: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          system_prompts?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          system_prompts?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_skills: {
        Row: {
          created_at: string | null
          exercises_passed: number
          id: string
          last_practiced_at: string | null
          proficiency_level: number
          skill_name: string
          tutorials_completed: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exercises_passed?: number
          id?: string
          last_practiced_at?: string | null
          proficiency_level?: number
          skill_name: string
          tutorials_completed?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          exercises_passed?: number
          id?: string
          last_practiced_at?: string | null
          proficiency_level?: number
          skill_name?: string
          tutorials_completed?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      verification_results: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          passed: boolean
          request_id: string
          rule: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          passed: boolean
          request_id: string
          rule: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          passed?: boolean
          request_id?: string
          rule?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_results_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      constraint_violations: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string | null
          lane: string | null
          mode: string | null
          request_id: string | null
          rule: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_results_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiter_dashboard: {
        Row: {
          clinician_id: string | null
          days_remaining: number | null
          email: string | null
          end_date: string | null
          facility_name: string | null
          full_name: string | null
          phone: string | null
          priority_order: number | null
          start_date: string | null
          trigger_type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_quota: {
        Args: { p_estimated_cost?: number; p_user_id: string }
        Returns: {
          allowed: boolean
          message: string
          remaining_usd: number
        }[]
      }
      cleanup_expired_cache: { Args: never; Returns: number }
      cleanup_expired_sports_cache: { Args: never; Returns: number }
      cleanup_orphaned_images: {
        Args: never
        Returns: {
          deleted_count: number
          storage_paths: string[]
        }[]
      }
      create_cost_ledger_partitions: { Args: never; Returns: undefined }
      generate_schema_storage_path: {
        Args: { p_format: string; p_name: string; p_user_id: string }
        Returns: string
      }
      get_clinician_context: {
        Args: { p_clinician_id: string; p_user_id: string }
        Returns: Json
      }
      get_clinician_reply_context: {
        Args: { p_clinician_id: string; p_user_id: string }
        Returns: {
          assignment_end_date: string
          assignment_facility: string
          communication_style: string
          days_remaining: number
          email: string
          full_name: string
          golden_notes: Json
          phone: string
          profile_notes: string
          recent_interactions: Json
        }[]
      }
      get_default_mode_for_backfill: {
        Args: never
        Returns: Database["public"]["Enums"]["interaction_mode"]
      }
      get_default_project_type_for_backfill: {
        Args: never
        Returns: Database["public"]["Enums"]["project_type"]
      }
      get_document_stats: {
        Args: {
          mode_param: Database["public"]["Enums"]["interaction_mode"]
          user_id_param: string
        }
        Returns: {
          count: number
          scope: Database["public"]["Enums"]["document_scope"]
        }[]
      }
      get_lane_costs: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id: string }
        Returns: {
          avg_latency_ms: number
          lane: string
          mode: string
          total_calls: number
          total_cost_usd: number
        }[]
      }
      get_latest_lines: {
        Args: { p_away_team: string; p_home_team: string; p_sport: string }
        Returns: {
          last_updated: string
          moneyline_away: number
          moneyline_home: number
          spread_away: number
          spread_home: number
          total: number
        }[]
      }
      get_request_trace: { Args: { p_request_id: string }; Returns: Json }
      get_schema_content: { Args: { p_schema_id: string }; Returns: string }
      get_version_history: {
        Args: { p_user_id: string; p_version_id: string }
        Returns: {
          additions: number
          created_at: string
          deletions: number
          depth: number
          description: string
          id: string
          version_name: string
        }[]
      }
      increment_space_run_totals: {
        Args: { p_cost_usd: number; p_space_run_id: string; p_tokens: number }
        Returns: undefined
      }
      increment_usage: {
        Args: {
          p_actual_cost: number
          p_search_query_id?: string
          p_user_id: string
        }
        Returns: undefined
      }
      match_code_chunks: {
        Args: {
          filter_session_id?: string
          filter_user_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_text: string
          created_at: string
          filename: string
          id: string
          language: string
          session_id: string
          similarity: number
          user_id: string
        }[]
      }
      match_documents_chat: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          space_id_param: string
          user_id_param: string
        }
        Returns: {
          content: string
          filename: string
          id: string
          metadata: Json
          mode: Database["public"]["Enums"]["interaction_mode"]
          scope: Database["public"]["Enums"]["document_scope"]
          similarity: number
        }[]
      }
      match_documents_recruiting_clinician: {
        Args: {
          clinician_id_param: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
          user_id_param: string
        }
        Returns: {
          content: string
          filename: string
          id: string
          metadata: Json
          mode: Database["public"]["Enums"]["interaction_mode"]
          scope: Database["public"]["Enums"]["document_scope"]
          similarity: number
        }[]
      }
      match_documents_recruiting_general: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          user_id_param: string
        }
        Returns: {
          content: string
          filename: string
          id: string
          metadata: Json
          mode: Database["public"]["Enums"]["interaction_mode"]
          scope: Database["public"]["Enums"]["document_scope"]
          similarity: number
        }[]
      }
      match_memories: {
        Args: {
          filter_space_id?: string
          filter_user_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          similarity: number
          space_id: string
          user_id: string
        }[]
      }
      search_memory_artifacts: {
        Args: {
          match_count: number
          match_threshold: number
          p_conversation_id?: string
          p_space_id?: string
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          content: Json
          context: string
          conversation_id: string
          id: string
          last_accessed_at: string
          priority: string
          similarity: number
          space_id: string
          type: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      text2ltree: { Args: { "": string }; Returns: unknown }
      track_line_movement: {
        Args: {
          p_game_id: string
          p_new_spread_home: number
          p_new_total: number
        }
        Returns: undefined
      }
      validate_player_team: {
        Args: { p_player_name: string; p_sport: string; p_team_name: string }
        Returns: boolean
      }
    }
    Enums: {
      ai_pass_type:
        | "planner"
        | "retriever"
        | "reranker"
        | "solver"
        | "verifier_hybrid"
        | "verifier_llm"
      candidate_status:
        | "prospecting"
        | "interested"
        | "submitted"
        | "working"
        | "retention"
        | "offers"
        | "placed"
        | "declined"
        | "inactive"
      document_scope: "global" | "space" | "clinician"
      interaction_mode: "chat" | "recruiting_general" | "recruiting_clinician"
      interaction_type:
        | "call"
        | "email"
        | "text"
        | "slack"
        | "verbal"
        | "screenshot"
        | "note"
      job_priority: "low" | "medium" | "high" | "urgent"
      pipeline_stage:
        | "prospecting"
        | "working"
        | "retention"
        | "fast"
        | "live_list"
        | "offers"
      project_type: "vertical" | "clinician" | "general"
      run_status: "pending" | "running" | "success" | "error" | "cancelled"
      urgency_level: "low" | "normal" | "high" | "urgent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_pass_type: [
        "planner",
        "retriever",
        "reranker",
        "solver",
        "verifier_hybrid",
        "verifier_llm",
      ],
      candidate_status: [
        "prospecting",
        "interested",
        "submitted",
        "working",
        "retention",
        "offers",
        "placed",
        "declined",
        "inactive",
      ],
      document_scope: ["global", "space", "clinician"],
      interaction_mode: ["chat", "recruiting_general", "recruiting_clinician"],
      interaction_type: [
        "call",
        "email",
        "text",
        "slack",
        "verbal",
        "screenshot",
        "note",
      ],
      job_priority: ["low", "medium", "high", "urgent"],
      pipeline_stage: [
        "prospecting",
        "working",
        "retention",
        "fast",
        "live_list",
        "offers",
      ],
      project_type: ["vertical", "clinician", "general"],
      run_status: ["pending", "running", "success", "error", "cancelled"],
      urgency_level: ["low", "normal", "high", "urgent"],
    },
  },
} as const
