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
      cobranca_agendamentos: {
        Row: {
          ativo: boolean
          created_at: string
          executado_at: string | null
          id: number
          intervalo_max: number
          intervalo_min: number
          scheduled_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          executado_at?: string | null
          id?: number
          intervalo_max?: number
          intervalo_min?: number
          scheduled_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          executado_at?: string | null
          id?: number
          intervalo_max?: number
          intervalo_min?: number
          scheduled_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cobranca_fila: {
        Row: {
          agendamento_id: number
          criado_at: string
          enviado_at: string | null
          erro_msg: string | null
          id: string
          mensagem: string
          militar_id: string
          proxima_tentativa_at: string
          status: string
          tentativas: number
          user_id: string
        }
        Insert: {
          agendamento_id: number
          criado_at?: string
          enviado_at?: string | null
          erro_msg?: string | null
          id?: string
          mensagem: string
          militar_id: string
          proxima_tentativa_at?: string
          status?: string
          tentativas?: number
          user_id: string
        }
        Update: {
          agendamento_id?: number
          criado_at?: string
          enviado_at?: string | null
          erro_msg?: string | null
          id?: string
          mensagem?: string
          militar_id?: string
          proxima_tentativa_at?: string
          status?: string
          tentativas?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_fila_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "cobranca_agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_fila_militar_id_fkey"
            columns: ["militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_logs: {
        Row: {
          agendamento_id: number
          enviado_at: string
          erro_msg: string | null
          id: string
          militar_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          agendamento_id: number
          enviado_at?: string
          erro_msg?: string | null
          id?: string
          militar_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          agendamento_id?: number
          enviado_at?: string
          erro_msg?: string | null
          id?: string
          militar_id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_logs_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "cobranca_agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_logs_militar_id_fkey"
            columns: ["militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          created_at: string
          data_compra: string
          id: string
          item_id: string | null
          itens: string
          militar_id: string
          observacoes: string | null
          pago_na_hora: boolean
          quantidade: number
          updated_at: string
          user_id: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          data_compra?: string
          id?: string
          item_id?: string | null
          itens: string
          militar_id: string
          observacoes?: string | null
          pago_na_hora?: boolean
          quantidade?: number
          updated_at?: string
          user_id?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          data_compra?: string
          id?: string
          item_id?: string | null
          itens?: string
          militar_id?: string
          observacoes?: string | null
          pago_na_hora?: boolean
          quantidade?: number
          updated_at?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_militar_id_fkey"
            columns: ["militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          admin_phone: string | null
          frequencia_cobranca_dias: number
          horario_cobranca: string
          id: number
          mensagem_template: string | null
          mp_access_token: string | null
          pix_key: string | null
          pix_nome: string | null
          proxima_cobranca: string | null
          updated_at: string
          user_id: string | null
          z_api_client_token: string | null
          z_api_instance: string | null
          z_api_token: string | null
        }
        Insert: {
          admin_phone?: string | null
          frequencia_cobranca_dias?: number
          horario_cobranca?: string
          id?: never
          mensagem_template?: string | null
          mp_access_token?: string | null
          pix_key?: string | null
          pix_nome?: string | null
          proxima_cobranca?: string | null
          updated_at?: string
          user_id?: string | null
          z_api_client_token?: string | null
          z_api_instance?: string | null
          z_api_token?: string | null
        }
        Update: {
          admin_phone?: string | null
          frequencia_cobranca_dias?: number
          horario_cobranca?: string
          id?: never
          mensagem_template?: string | null
          mp_access_token?: string | null
          pix_key?: string | null
          pix_nome?: string | null
          proxima_cobranca?: string | null
          updated_at?: string
          user_id?: string | null
          z_api_client_token?: string | null
          z_api_instance?: string | null
          z_api_token?: string | null
        }
        Relationships: []
      }
      item_price_history: {
        Row: {
          changed_at: string
          id: string
          item_id: string
          preco_avista: number
          preco_fiado: number
          user_id: string | null
        }
        Insert: {
          changed_at?: string
          id?: string
          item_id: string
          preco_avista: number
          preco_fiado: number
          user_id?: string | null
        }
        Update: {
          changed_at?: string
          id?: string
          item_id?: string
          preco_avista?: number
          preco_fiado?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
        ]
      }
      itens: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          preco_avista: number
          preco_fiado: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          preco_avista?: number
          preco_fiado?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          preco_avista?: number
          preco_fiado?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      militares: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome_guerra: string
          posto: string
          telefone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_guerra: string
          posto: string
          telefone: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_guerra?: string
          posto?: string
          telefone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          created_at: string
          id: string
          militar_id: string
          observacoes: string | null
          pago_em: string
          periodo: string
          user_id: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          militar_id: string
          observacoes?: string | null
          pago_em?: string
          periodo: string
          user_id?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          id?: string
          militar_id?: string
          observacoes?: string | null
          pago_em?: string
          periodo?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_militar_id_fkey"
            columns: ["militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_cobrancas: {
        Row: {
          copia_cola: string | null
          created_at: string
          id: string
          militar_id: string
          mp_payment_id: string | null
          needs_review: boolean
          paid_amount: number | null
          paid_at: string | null
          periodo: string
          qr_code_base64: string | null
          raw: Json | null
          status: string
          ticket_url: string | null
          txid: string
          updated_at: string
          user_id: string | null
          valor: number
        }
        Insert: {
          copia_cola?: string | null
          created_at?: string
          id?: string
          militar_id: string
          mp_payment_id?: string | null
          needs_review?: boolean
          paid_amount?: number | null
          paid_at?: string | null
          periodo: string
          qr_code_base64?: string | null
          raw?: Json | null
          status?: string
          ticket_url?: string | null
          txid: string
          updated_at?: string
          user_id?: string | null
          valor: number
        }
        Update: {
          copia_cola?: string | null
          created_at?: string
          id?: string
          militar_id?: string
          mp_payment_id?: string | null
          needs_review?: boolean
          paid_amount?: number | null
          paid_at?: string | null
          periodo?: string
          qr_code_base64?: string | null
          raw?: Json | null
          status?: string
          ticket_url?: string | null
          txid?: string
          updated_at?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
