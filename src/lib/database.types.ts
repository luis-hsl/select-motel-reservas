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
      suites: {
        Row: {
          active: boolean
          cleaning_buffer_h: number
          description: string
          id: string
          name: string
          size: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          cleaning_buffer_h: number
          description: string
          id: string
          name: string
          size: string
          sort_order: number
        }
        Update: {
          active?: boolean
          cleaning_buffer_h?: number
          description?: string
          id?: string
          name?: string
          size?: string
          sort_order?: number
        }
        Relationships: []
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

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
