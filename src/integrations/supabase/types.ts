export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      focus_sessions: {
        Row: {
          breaks_taken: number
          ended_at: string | null
          end_mood: string | null
          flows_completed: number
          focus_seconds: number
          id: string
          intention: string | null
          planned_block_minutes: number | null
          planned_break_minutes: number | null
          planned_flows: number | null
          reflection_did_well: string | null
          reflection_to_improve: string | null
          source: string
          started_at: string
          start_mood: string | null
          start_type: string | null
          status: string
          user_id: string
        }
        Insert: {
          breaks_taken?: number
          ended_at?: string | null
          end_mood?: string | null
          flows_completed?: number
          focus_seconds?: number
          id?: string
          intention?: string | null
          planned_block_minutes?: number | null
          planned_break_minutes?: number | null
          planned_flows?: number | null
          reflection_did_well?: string | null
          reflection_to_improve?: string | null
          source: string
          started_at?: string
          start_mood?: string | null
          start_type?: string | null
          status?: string
          user_id: string
        }
        Update: {
          breaks_taken?: number
          ended_at?: string | null
          end_mood?: string | null
          flows_completed?: number
          focus_seconds?: number
          id?: string
          intention?: string | null
          planned_block_minutes?: number | null
          planned_break_minutes?: number | null
          planned_flows?: number | null
          reflection_did_well?: string | null
          reflection_to_improve?: string | null
          source?: string
          started_at?: string
          start_mood?: string | null
          start_type?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          entry_type: string
          id: string
          responses: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_type: string
          id?: string
          responses: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_type?: string
          id?: string
          responses?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_checkins: {
        Row: {
          created_at: string
          id: string
          mood: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mood: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mood?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_responses: {
        Row: {
          additional_info: string | null
          adhd_status: string | null
          created_at: string
          daily_feeling: string | null
          first_help: string | null
          id: string
          overwhelmed_response: string | null
          reason: string | null
          stress_level: number | null
          struggles: string[] | null
          support_style: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_info?: string | null
          adhd_status?: string | null
          created_at?: string
          daily_feeling?: string | null
          first_help?: string | null
          id?: string
          overwhelmed_response?: string | null
          reason?: string | null
          stress_level?: number | null
          struggles?: string[] | null
          support_style?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_info?: string | null
          adhd_status?: string | null
          created_at?: string
          daily_feeling?: string | null
          first_help?: string | null
          id?: string
          overwhelmed_response?: string | null
          reason?: string | null
          stress_level?: number | null
          struggles?: string[] | null
          support_style?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_emoji: string | null
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string | null
          focus_goal: string | null
          full_name: string | null
          id: string
          mood_checkin_frequency: string | null
          onboarding_completed_at: string | null
          preferred_mode: string | null
          pronouns: string | null
          updated_at: string
          use_emoji_avatar: boolean
        }
        Insert: {
          avatar_emoji?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string | null
          focus_goal?: string | null
          full_name?: string | null
          id: string
          mood_checkin_frequency?: string | null
          onboarding_completed_at?: string | null
          preferred_mode?: string | null
          pronouns?: string | null
          updated_at?: string
          use_emoji_avatar?: boolean
        }
        Update: {
          avatar_emoji?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string | null
          focus_goal?: string | null
          full_name?: string | null
          id?: string
          mood_checkin_frequency?: string | null
          onboarding_completed_at?: string | null
          preferred_mode?: string | null
          pronouns?: string | null
          updated_at?: string
          use_emoji_avatar?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      safe_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          instagram: string | null
          label: string
          name: string
          note: string | null
          phone: string | null
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          label?: string
          name: string
          note?: string | null
          phone?: string | null
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          label?: string
          name?: string
          note?: string | null
          phone?: string | null
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safe_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          scheduled_date: string
          start_time: string | null
          tag: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          scheduled_date?: string
          start_time?: string | null
          tag?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          scheduled_date?: string
          start_time?: string | null
          tag?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          adhd_mode: boolean
          ai_companion_name: string | null
          animation_speed: string
          buffer_minutes: number
          created_at: string
          daily_focus_goal: string | null
          default_flows: number
          encouragement: boolean
          focus_block_minutes: number
          sound_volume: number
          theme: string
          timeboxing_style: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adhd_mode?: boolean
          ai_companion_name?: string | null
          animation_speed?: string
          buffer_minutes?: number
          created_at?: string
          daily_focus_goal?: string | null
          default_flows?: number
          encouragement?: boolean
          focus_block_minutes?: number
          sound_volume?: number
          theme?: string
          timeboxing_style?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adhd_mode?: boolean
          ai_companion_name?: string | null
          animation_speed?: string
          buffer_minutes?: number
          created_at?: string
          daily_focus_goal?: string | null
          default_flows?: number
          encouragement?: boolean
          focus_block_minutes?: number
          sound_volume?: number
          theme?: string
          timeboxing_style?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_sessions: {
        Row: {
          category: string
          completed: boolean
          cycles_completed: number | null
          duration_seconds: number
          ended_at: string | null
          exercise_slug: string
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          category: string
          completed?: boolean
          cycles_completed?: number | null
          duration_seconds?: number
          ended_at?: string | null
          exercise_slug: string
          id?: string
          started_at?: string
          user_id: string
        }
        Update: {
          category?: string
          completed?: boolean
          cycles_completed?: number | null
          duration_seconds?: number
          ended_at?: string | null
          exercise_slug?: string
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wellness_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
