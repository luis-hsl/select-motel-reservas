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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      packages: {
        Row: {
          highlighted: boolean
          id: string
          includes: string[]
          label: string
          note: string | null
          price_overnight: number
          price_period: number
          sort_order: number
          tagline: string
        }
        Insert: {
          highlighted?: boolean
          id: string
          includes?: string[]
          label: string
          note?: string | null
          price_overnight: number
          price_period: number
          sort_order: number
          tagline: string
        }
        Update: {
          highlighted?: boolean
          id?: string
          includes?: string[]
          label?: string
          note?: string | null
          price_overnight?: number
          price_period?: number
          sort_order?: number
          tagline?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          check_in: string
          check_out: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id: string
          package_id: string
          payment_id: string | null
          status: string
          suite_id: string
          total_amount: number
          type: string
          updated_at: string
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id?: string
          package_id: string
          payment_id?: string | null
          status?: string
          suite_id: string
          total_amount: number
          type: string
          updated_at?: string
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          package_id?: string
          payment_id?: string | null
          status?: string
          suite_id?: string
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "suites"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          label: string | null
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          label?: string | null
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          label?: string | null
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      suites: {
        Row: {
          active: boolean
          category: string | null
          cleaning_buffer_h: number
          description: string
          id: string
          name: string
          package_ids: string[] | null
          photo_url: string | null
          room_number: number | null
          size: string
          sort_order: number
          video_url: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          cleaning_buffer_h: number
          description: string
          id: string
          name: string
          package_ids?: string[] | null
          photo_url?: string | null
          room_number?: number | null
          size: string
          sort_order: number
          video_url?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          cleaning_buffer_h?: number
          description?: string
          id?: string
          name?: string
          package_ids?: string[] | null
          photo_url?: string | null
          room_number?: number | null
          size?: string
          sort_order?: number
          video_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_occupied_suite_ids: {
        Args: { p_check_in: string; p_check_out: string }
        Returns: { suite_id: string }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
