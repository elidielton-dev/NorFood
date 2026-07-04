export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      bairros_entrega: {
        Row: {
          ativo: boolean;
          created_at: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          nome: string;
          taxa: number;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          nome: string;
          taxa?: number;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          nome?: string;
          taxa?: number;
        };
        Relationships: [];
      };
      config_operacional: {
        Row: {
          fuso_horario: string;
          horario_automatico: boolean;
          id: string;
          loja_aberta: boolean;
          pausa_imediata: boolean;
          pedido_minimo: number;
          pontos_por_real: number;
          updated_at: string;
          valor_padrao_entrega: number;
        };
        Insert: {
          fuso_horario?: string;
          horario_automatico?: boolean;
          id?: string;
          loja_aberta?: boolean;
          pausa_imediata?: boolean;
          pedido_minimo?: number;
          pontos_por_real?: number;
          updated_at?: string;
          valor_padrao_entrega?: number;
        };
        Update: {
          fuso_horario?: string;
          horario_automatico?: boolean;
          id?: string;
          loja_aberta?: boolean;
          pausa_imediata?: boolean;
          pedido_minimo?: number;
          pontos_por_real?: number;
          updated_at?: string;
          valor_padrao_entrega?: number;
        };
        Relationships: [];
      };
      horarios_funcionamento: {
        Row: {
          abre: string;
          ativo: boolean;
          dia_semana: number;
          fecha: string;
          updated_at: string;
        };
        Insert: {
          abre?: string;
          ativo?: boolean;
          dia_semana: number;
          fecha?: string;
          updated_at?: string;
        };
        Update: {
          abre?: string;
          ativo?: boolean;
          dia_semana?: number;
          fecha?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_chats: {
        Row: {
          cliente_id: string | null;
          id: string;
          is_group: boolean;
          last_message: string | null;
          last_message_at: string | null;
          name: string | null;
          phone: string | null;
          profile_pic_url: string | null;
          remote_jid: string;
          unread_count: number;
          updated_at: string;
        };
        Insert: {
          cliente_id?: string | null;
          id?: string;
          is_group?: boolean;
          last_message?: string | null;
          last_message_at?: string | null;
          name?: string | null;
          phone?: string | null;
          profile_pic_url?: string | null;
          remote_jid: string;
          unread_count?: number;
          updated_at?: string;
        };
        Update: {
          cliente_id?: string | null;
          id?: string;
          is_group?: boolean;
          last_message?: string | null;
          last_message_at?: string | null;
          name?: string | null;
          phone?: string | null;
          profile_pic_url?: string | null;
          remote_jid?: string;
          unread_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_chats_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_config: {
        Row: {
          id: string;
          instance_name: string;
          phone_number: string | null;
          profile_name: string | null;
          provider: string;
          qr_code: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          instance_name?: string;
          phone_number?: string | null;
          profile_name?: string | null;
          provider?: string;
          qr_code?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          instance_name?: string;
          phone_number?: string | null;
          profile_name?: string | null;
          provider?: string;
          qr_code?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_messages: {
        Row: {
          body: string | null;
          chat_id: string;
          created_at: string;
          direction: string;
          file_name: string | null;
          id: string;
          media_mime: string | null;
          media_url: string | null;
          message_type: string;
          remote_jid: string;
          sent_at: string;
          status: string;
          wa_message_id: string;
        };
        Insert: {
          body?: string | null;
          chat_id: string;
          created_at?: string;
          direction: string;
          file_name?: string | null;
          id?: string;
          media_mime?: string | null;
          media_url?: string | null;
          message_type?: string;
          remote_jid: string;
          sent_at?: string;
          status?: string;
          wa_message_id: string;
        };
        Update: {
          body?: string | null;
          chat_id?: string;
          created_at?: string;
          direction?: string;
          file_name?: string | null;
          id?: string;
          media_mime?: string | null;
          media_url?: string | null;
          message_type?: string;
          remote_jid?: string;
          sent_at?: string;
          status?: string;
          wa_message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_chats";
            referencedColumns: ["id"];
          },
        ];
      };
      notas_fiscais: {
        Row: {
          chave_acesso: string | null;
          created_at: string;
          danfe_url: string | null;
          id: string;
          numero: string | null;
          pedido_id: string | null;
          status: string;
          tipo: string;
          updated_at: string;
          valor: number;
          xml_enviado_contabilidade: boolean;
          xml_url: string | null;
        };
        Insert: {
          chave_acesso?: string | null;
          created_at?: string;
          danfe_url?: string | null;
          id?: string;
          numero?: string | null;
          pedido_id?: string | null;
          status?: string;
          tipo?: string;
          updated_at?: string;
          valor?: number;
          xml_enviado_contabilidade?: boolean;
          xml_url?: string | null;
        };
        Update: {
          chave_acesso?: string | null;
          created_at?: string;
          danfe_url?: string | null;
          id?: string;
          numero?: string | null;
          pedido_id?: string | null;
          status?: string;
          tipo?: string;
          updated_at?: string;
          valor?: number;
          xml_enviado_contabilidade?: boolean;
          xml_url?: string | null;
        };
        Relationships: [];
      };
      categorias: {
        Row: {
          ativo: boolean;
          created_at: string;
          descricao: string | null;
          emoji: string | null;
          id: string;
          nome: string;
          ordem: number;
          status_categoria: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          descricao?: string | null;
          emoji?: string | null;
          id?: string;
          nome: string;
          ordem?: number;
          status_categoria?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          descricao?: string | null;
          emoji?: string | null;
          id?: string;
          nome?: string;
          ordem?: number;
          status_categoria?: string;
        };
        Relationships: [];
      };
      cupons: {
        Row: {
          ativo: boolean;
          codigo: string;
          created_at: string;
          desconto_percentual: number | null;
          desconto_valor: number | null;
          descricao: string | null;
          id: string;
          usos: number;
          usos_maximos: number | null;
          valido_ate: string | null;
        };
        Insert: {
          ativo?: boolean;
          codigo: string;
          created_at?: string;
          desconto_percentual?: number | null;
          desconto_valor?: number | null;
          descricao?: string | null;
          id?: string;
          usos?: number;
          usos_maximos?: number | null;
          valido_ate?: string | null;
        };
        Update: {
          ativo?: boolean;
          codigo?: string;
          created_at?: string;
          desconto_percentual?: number | null;
          desconto_valor?: number | null;
          descricao?: string | null;
          id?: string;
          usos?: number;
          usos_maximos?: number | null;
          valido_ate?: string | null;
        };
        Relationships: [];
      };
      entregas: {
        Row: {
          bairro: string | null;
          created_at: string;
          distancia_km: number | null;
          endereco: string;
          entregue_em: string | null;
          id: string;
          motoboy_id: string | null;
          pedido_id: string;
          saiu_em: string | null;
          status: string;
          taxa: number;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          bairro?: string | null;
          created_at?: string;
          distancia_km?: number | null;
          endereco: string;
          entregue_em?: string | null;
          id?: string;
          motoboy_id?: string | null;
          pedido_id: string;
          saiu_em?: string | null;
          status?: string;
          taxa?: number;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          bairro?: string | null;
          created_at?: string;
          distancia_km?: number | null;
          endereco?: string;
          entregue_em?: string | null;
          id?: string;
          motoboy_id?: string | null;
          pedido_id?: string;
          saiu_em?: string | null;
          status?: string;
          taxa?: number;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entregas_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
        ];
      };
      entregadores_localizacao: {
        Row: {
          accuracy: number | null;
          battery: number | null;
          entregador_id: string;
          heading: number | null;
          id: string;
          latitude: number;
          longitude: number;
          speed: number | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          accuracy?: number | null;
          battery?: number | null;
          entregador_id: string;
          heading?: number | null;
          id?: string;
          latitude: number;
          longitude: number;
          speed?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          accuracy?: number | null;
          battery?: number | null;
          entregador_id?: string;
          heading?: number | null;
          id?: string;
          latitude?: number;
          longitude?: number;
          speed?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lancamentos_financeiros: {
        Row: {
          categoria: string | null;
          created_at: string;
          data: string;
          descricao: string;
          forma: Database["public"]["Enums"]["forma_pagamento"] | null;
          id: string;
          pedido_id: string | null;
          tipo: Database["public"]["Enums"]["financeiro_tipo"];
          valor: number;
        };
        Insert: {
          categoria?: string | null;
          created_at?: string;
          data?: string;
          descricao: string;
          forma?: Database["public"]["Enums"]["forma_pagamento"] | null;
          id?: string;
          pedido_id?: string | null;
          tipo: Database["public"]["Enums"]["financeiro_tipo"];
          valor: number;
        };
        Update: {
          categoria?: string | null;
          created_at?: string;
          data?: string;
          descricao?: string;
          forma?: Database["public"]["Enums"]["forma_pagamento"] | null;
          id?: string;
          pedido_id?: string | null;
          tipo?: Database["public"]["Enums"]["financeiro_tipo"];
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lancamentos_financeiros_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
        ];
      };
      mesas: {
        Row: {
          capacidade: number;
          created_at: string;
          id: string;
          numero: number;
          qrcode_token: string;
          status: Database["public"]["Enums"]["mesa_status"];
        };
        Insert: {
          capacidade?: number;
          created_at?: string;
          id?: string;
          numero: number;
          qrcode_token?: string;
          status?: Database["public"]["Enums"]["mesa_status"];
        };
        Update: {
          capacidade?: number;
          created_at?: string;
          id?: string;
          numero?: number;
          qrcode_token?: string;
          status?: Database["public"]["Enums"]["mesa_status"];
        };
        Relationships: [];
      };
      pedido_itens: {
        Row: {
          created_at: string;
          id: string;
          observacao: string | null;
          pedido_id: string;
          preco_unitario: number;
          produto_id: string;
          quantidade: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          observacao?: string | null;
          pedido_id: string;
          preco_unitario: number;
          produto_id: string;
          quantidade?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          observacao?: string | null;
          pedido_id?: string;
          preco_unitario?: number;
          produto_id?: string;
          quantidade?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_itens_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      pedidos: {
        Row: {
          canal: Database["public"]["Enums"]["pedido_canal"];
          cliente_id: string | null;
          created_at: string;
          distancia_restante: number | null;
          entregador_id: string | null;
          cupom_id: string | null;
          desconto: number;
          endereco: string | null;
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null;
          id: string;
          latitude_cliente: number | null;
          longitude_cliente: number | null;
          mesa_id: string | null;
          numero: number;
          observacoes: string | null;
          ordem_na_rota: number | null;
          previsao_entrega: string | null;
          status: Database["public"]["Enums"]["pedido_status"];
          subtotal: number;
          taxa_entrega: number;
          tenant_id: string | null;
          total: number;
          troco_para: number | null;
          updated_at: string;
        };
        Insert: {
          canal?: Database["public"]["Enums"]["pedido_canal"];
          cliente_id?: string | null;
          created_at?: string;
          distancia_restante?: number | null;
          entregador_id?: string | null;
          cupom_id?: string | null;
          desconto?: number;
          endereco?: string | null;
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"] | null;
          id?: string;
          latitude_cliente?: number | null;
          longitude_cliente?: number | null;
          mesa_id?: string | null;
          numero?: number;
          observacoes?: string | null;
          ordem_na_rota?: number | null;
          previsao_entrega?: string | null;
          status?: Database["public"]["Enums"]["pedido_status"];
          subtotal?: number;
          taxa_entrega?: number;
          tenant_id?: string | null;
          total?: number;
          troco_para?: number | null;
          updated_at?: string;
        };
        Update: {
          canal?: Database["public"]["Enums"]["pedido_canal"];
          cliente_id?: string | null;
          created_at?: string;
          distancia_restante?: number | null;
          entregador_id?: string | null;
          cupom_id?: string | null;
          desconto?: number;
          endereco?: string | null;
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"] | null;
          id?: string;
          latitude_cliente?: number | null;
          longitude_cliente?: number | null;
          mesa_id?: string | null;
          numero?: number;
          observacoes?: string | null;
          ordem_na_rota?: number | null;
          previsao_entrega?: string | null;
          status?: Database["public"]["Enums"]["pedido_status"];
          subtotal?: number;
          taxa_entrega?: number;
          tenant_id?: string | null;
          total?: number;
          troco_para?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pedidos_cupom_id_fkey";
            columns: ["cupom_id"];
            isOneToOne: false;
            referencedRelation: "cupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_mesa_id_fkey";
            columns: ["mesa_id"];
            isOneToOne: false;
            referencedRelation: "mesas";
            referencedColumns: ["id"];
          },
        ];
      };
      rotas_entrega: {
        Row: {
          created_at: string;
          distancia_km: number | null;
          entregador_id: string;
          id: string;
          ordem_entrega: number;
          pedido_id: string;
          status: string;
          tempo_estimado: number | null;
        };
        Insert: {
          created_at?: string;
          distancia_km?: number | null;
          entregador_id: string;
          id?: string;
          ordem_entrega?: number;
          pedido_id: string;
          status?: string;
          tempo_estimado?: number | null;
        };
        Update: {
          created_at?: string;
          distancia_km?: number | null;
          entregador_id?: string;
          id?: string;
          ordem_entrega?: number;
          pedido_id?: string;
          status?: string;
          tempo_estimado?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "rotas_entrega_entregador_id_fkey";
            columns: ["entregador_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rotas_entrega_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
        ];
      };
      grupos_adicionais: {
        Row: {
          created_at: string;
          descricao: string | null;
          id: string;
          nome: string;
        };
        Insert: {
          created_at?: string;
          descricao?: string | null;
          id?: string;
          nome: string;
        };
        Update: {
          created_at?: string;
          descricao?: string | null;
          id?: string;
          nome?: string;
        };
        Relationships: [];
      };
      produto_adicionais: {
        Row: {
          created_at: string;
          estoque: number;
          grupo_id: string;
          id: string;
          maximo: number;
          minimo: number;
          nome: string;
          obrigatorio: boolean;
          preco: number;
        };
        Insert: {
          created_at?: string;
          estoque?: number;
          grupo_id: string;
          id?: string;
          maximo?: number;
          minimo?: number;
          nome: string;
          obrigatorio?: boolean;
          preco?: number;
        };
        Update: {
          created_at?: string;
          estoque?: number;
          grupo_id?: string;
          id?: string;
          maximo?: number;
          minimo?: number;
          nome?: string;
          obrigatorio?: boolean;
          preco?: number;
        };
        Relationships: [
          {
            foreignKeyName: "produto_adicionais_grupo_id_fkey";
            columns: ["grupo_id"];
            isOneToOne: false;
            referencedRelation: "grupos_adicionais";
            referencedColumns: ["id"];
          },
        ];
      };
      produto_ficha_tecnica: {
        Row: {
          created_at: string;
          custo_unitario: number;
          fornecedor: string | null;
          id: string;
          ingrediente: string;
          produto_id: string;
          quantidade: number;
          unidade: string;
        };
        Insert: {
          created_at?: string;
          custo_unitario?: number;
          fornecedor?: string | null;
          id?: string;
          ingrediente: string;
          produto_id: string;
          quantidade?: number;
          unidade?: string;
        };
        Update: {
          created_at?: string;
          custo_unitario?: number;
          fornecedor?: string | null;
          id?: string;
          ingrediente?: string;
          produto_id?: string;
          quantidade?: number;
          unidade?: string;
        };
        Relationships: [
          {
            foreignKeyName: "produto_ficha_tecnica_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      produto_movimentos_estoque: {
        Row: {
          acao: string;
          canal: string | null;
          created_at: string;
          id: string;
          observacao: string | null;
          produto_id: string;
          quantidade: number;
        };
        Insert: {
          acao: string;
          canal?: string | null;
          created_at?: string;
          id?: string;
          observacao?: string | null;
          produto_id: string;
          quantidade?: number;
        };
        Update: {
          acao?: string;
          canal?: string | null;
          created_at?: string;
          id?: string;
          observacao?: string | null;
          produto_id?: string;
          quantidade?: number;
        };
        Relationships: [
          {
            foreignKeyName: "produto_movimentos_estoque_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      produto_promocoes: {
        Row: {
          ativa: boolean;
          created_at: string;
          fim: string | null;
          id: string;
          inicio: string | null;
          produto_id: string;
          tipo: string;
          titulo: string;
          valor: number;
        };
        Insert: {
          ativa?: boolean;
          created_at?: string;
          fim?: string | null;
          id?: string;
          inicio?: string | null;
          produto_id: string;
          tipo?: string;
          titulo: string;
          valor?: number;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          fim?: string | null;
          id?: string;
          inicio?: string | null;
          produto_id?: string;
          tipo?: string;
          titulo?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "produto_promocoes_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      produto_variacoes: {
        Row: {
          created_at: string;
          estoque: number;
          id: string;
          nome: string;
          preco: number;
          produto_id: string;
          status: string;
          tempo_preparo: number;
        };
        Insert: {
          created_at?: string;
          estoque?: number;
          id?: string;
          nome: string;
          preco?: number;
          produto_id: string;
          status?: string;
          tempo_preparo?: number;
        };
        Update: {
          created_at?: string;
          estoque?: number;
          id?: string;
          nome?: string;
          preco?: number;
          produto_id?: string;
          status?: string;
          tempo_preparo?: number;
        };
        Relationships: [
          {
            foreignKeyName: "produto_variacoes_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      produtos: {
        Row: {
          alergenos: Json;
          ativo: boolean;
          auto_pause_sem_estoque: boolean;
          calorias: number | null;
          categoria_id: string | null;
          created_at: string;
          custo_producao: number;
          descricao: string | null;
          descricao_curta: string | null;
          destaque: boolean;
          disponivel_canais: Json;
          estoque: number | null;
          estoque_minimo: number;
          id: string;
          imagem_url: string | null;
          ingredientes: string | null;
          mais_vendido: boolean;
          nome: string;
          novo: boolean;
          peso_aproximado: string | null;
          preco: number;
          preco_promocional: number | null;
          receita_total: number;
          recomendado: boolean;
          serve_pessoas: string | null;
          sku: string | null;
          status_produto: string;
          subcategoria: string | null;
          tempo_preparo_min: number;
          unidade: string;
          updated_at: string;
          validade: string | null;
          vendas_count: number;
        };
        Insert: {
          alergenos?: Json;
          ativo?: boolean;
          auto_pause_sem_estoque?: boolean;
          calorias?: number | null;
          categoria_id?: string | null;
          created_at?: string;
          custo_producao?: number;
          descricao?: string | null;
          descricao_curta?: string | null;
          destaque?: boolean;
          disponivel_canais?: Json;
          estoque?: number | null;
          estoque_minimo?: number;
          id?: string;
          imagem_url?: string | null;
          ingredientes?: string | null;
          mais_vendido?: boolean;
          nome: string;
          novo?: boolean;
          peso_aproximado?: string | null;
          preco?: number;
          preco_promocional?: number | null;
          receita_total?: number;
          recomendado?: boolean;
          serve_pessoas?: string | null;
          sku?: string | null;
          status_produto?: string;
          subcategoria?: string | null;
          tempo_preparo_min?: number;
          unidade?: string;
          updated_at?: string;
          validade?: string | null;
          vendas_count?: number;
        };
        Update: {
          alergenos?: Json;
          ativo?: boolean;
          auto_pause_sem_estoque?: boolean;
          calorias?: number | null;
          categoria_id?: string | null;
          created_at?: string;
          custo_producao?: number;
          descricao?: string | null;
          descricao_curta?: string | null;
          destaque?: boolean;
          disponivel_canais?: Json;
          estoque?: number | null;
          estoque_minimo?: number;
          id?: string;
          imagem_url?: string | null;
          ingredientes?: string | null;
          mais_vendido?: boolean;
          nome?: string;
          novo?: boolean;
          peso_aproximado?: string | null;
          preco?: number;
          preco_promocional?: number | null;
          receita_total?: number;
          recomendado?: boolean;
          serve_pessoas?: string | null;
          sku?: string | null;
          status_produto?: string;
          subcategoria?: string | null;
          tempo_preparo_min?: number;
          unidade?: string;
          updated_at?: string;
          validade?: string | null;
          vendas_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          nome: string;
          pontos_fidelidade: number;
          telefone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id: string;
          nome?: string;
          pontos_fidelidade?: number;
          telefone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          nome?: string;
          pontos_fidelidade?: number;
          telefone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
    };
    Enums: {
      app_role: "cliente" | "garcom" | "cozinha" | "motoboy" | "gerente" | "admin";
      financeiro_tipo: "entrada" | "saida";
      forma_pagamento: "dinheiro" | "pix" | "credito" | "debito" | "vale" | "online";
      mesa_status: "livre" | "ocupada" | "fechando" | "reservada";
      pedido_canal: "mesa" | "balcao" | "delivery" | "qrcode" | "ifood";
      pedido_status: "aberto" | "em_preparo" | "pronto" | "em_entrega" | "entregue" | "cancelado";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["cliente", "garcom", "cozinha", "motoboy", "gerente", "admin"],
      financeiro_tipo: ["entrada", "saida"],
      forma_pagamento: ["dinheiro", "pix", "credito", "debito", "vale", "online"],
      mesa_status: ["livre", "ocupada", "fechando", "reservada"],
      pedido_canal: ["mesa", "balcao", "delivery", "qrcode", "ifood"],
      pedido_status: ["aberto", "em_preparo", "pronto", "em_entrega", "entregue", "cancelado"],
    },
  },
} as const;
