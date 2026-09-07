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
      admin_memberships: {
        Row: {
          business_unit_id: string
          created_at: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_memberships_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          business_unit_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          request_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          business_unit_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          business_unit_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      business_units: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_products: {
        Row: {
          availability_status: string
          campaign_id: string
          created_at: string
          currency: string
          id: string
          price_amount: number
          product_id: string
          product_variant_id: string | null
          quantity_limit: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          availability_status?: string
          campaign_id: string
          created_at?: string
          currency?: string
          id?: string
          price_amount: number
          product_id: string
          product_variant_id?: string | null
          quantity_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          availability_status?: string
          campaign_id?: string
          created_at?: string
          currency?: string
          id?: string
          price_amount?: number
          product_id?: string
          product_variant_id?: string | null
          quantity_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_products_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          archived_at: string | null
          business_unit_id: string
          closes_at: string | null
          created_at: string
          id: string
          name: string
          number: number
          opens_at: string | null
          public_message: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_unit_id: string
          closes_at?: string | null
          created_at?: string
          id?: string
          name: string
          number: number
          opens_at?: string | null
          public_message?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_unit_id?: string
          closes_at?: string | null
          created_at?: string
          id?: string
          name?: string
          number?: number
          opens_at?: string | null
          public_message?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          business_unit_id: string
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          parent_id: string | null
          publication_status: string
          slug: string
          sort_order: number
          spec_schema: Json
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_unit_id: string
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          name: string
          parent_id?: string | null
          publication_status?: string
          slug: string
          sort_order?: number
          spec_schema?: Json
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_unit_id?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          publication_status?: string
          slug?: string
          sort_order?: number
          spec_schema?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_items: {
        Row: {
          combo_id: string
          created_at: string
          id: string
          product_variant_id: string
          quantity: number
          sort_order: number
        }
        Insert: {
          combo_id: string
          created_at?: string
          id?: string
          product_variant_id: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          combo_id?: string
          created_at?: string
          id?: string
          product_variant_id?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          archived_at: string | null
          composition_verification_status: string
          created_at: string
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          composition_verification_status?: string
          created_at?: string
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          composition_verification_status?: string
          created_at?: string
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "combos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          business_unit_id: string
          created_at: string
          document_id: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          verified_customer_status: string
        }
        Insert: {
          archived_at?: string | null
          business_unit_id: string
          created_at?: string
          document_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_customer_status?: string
        }
        Update: {
          archived_at?: string | null
          business_unit_id?: string
          created_at?: string
          document_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_customer_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_policies: {
        Row: {
          business_unit_id: string
          created_at: string
          customer_status: string
          deposit_percentage: number
          effective_from: string
          effective_until: string | null
          id: string
          is_active: boolean
          source: string
          updated_at: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          customer_status: string
          deposit_percentage: number
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean
          source?: string
          updated_at?: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          customer_status?: string
          deposit_percentage?: number
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_policies_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          availability_status: string
          created_at: string
          id: string
          inventory_mode: string
          product_variant_id: string
          quantity_on_hand: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          availability_status?: string
          created_at?: string
          id?: string
          inventory_mode?: string
          product_variant_id: string
          quantity_on_hand?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          availability_status?: string
          created_at?: string
          id?: string
          inventory_mode?: string
          product_variant_id?: string
          quantity_on_hand?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          campaign_product_id: string | null
          campaign_snapshot: Json | null
          created_at: string
          currency: string
          id: string
          line_total_amount: number
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          product_variant_id: string | null
          quantity: number
          sort_order: number
          unit_price_amount: number
          variant_label_snapshot: string
          variant_snapshot: Json
        }
        Insert: {
          campaign_product_id?: string | null
          campaign_snapshot?: Json | null
          created_at?: string
          currency?: string
          id?: string
          line_total_amount: number
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          product_variant_id?: string | null
          quantity: number
          sort_order?: number
          unit_price_amount: number
          variant_label_snapshot: string
          variant_snapshot?: Json
        }
        Update: {
          campaign_product_id?: string | null
          campaign_snapshot?: Json | null
          created_at?: string
          currency?: string
          id?: string
          line_total_amount?: number
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          product_variant_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price_amount?: number
          variant_label_snapshot?: string
          variant_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_campaign_product_id_fkey"
            columns: ["campaign_product_id"]
            isOneToOne: false
            referencedRelation: "campaign_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          archived_at: string | null
          business_unit_id: string
          campaign_id: string | null
          channel: string
          claimed_customer_status: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_snapshot: Json
          delivery_snapshot: Json
          deposit_percentage_snapshot: number | null
          deposit_policy_snapshot: Json | null
          id: string
          notes: string | null
          order_number: string
          shipping_method_id: string | null
          status: string
          subtotal_amount: number
          updated_at: string
          verified_customer_status_snapshot: string | null
        }
        Insert: {
          archived_at?: string | null
          business_unit_id: string
          campaign_id?: string | null
          channel?: string
          claimed_customer_status?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_snapshot?: Json
          delivery_snapshot?: Json
          deposit_percentage_snapshot?: number | null
          deposit_policy_snapshot?: Json | null
          id?: string
          notes?: string | null
          order_number: string
          shipping_method_id?: string | null
          status?: string
          subtotal_amount?: number
          updated_at?: string
          verified_customer_status_snapshot?: string | null
        }
        Update: {
          archived_at?: string | null
          business_unit_id?: string
          campaign_id?: string | null
          channel?: string
          claimed_customer_status?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_snapshot?: Json
          delivery_snapshot?: Json
          deposit_percentage_snapshot?: number | null
          deposit_policy_snapshot?: Json | null
          id?: string
          notes?: string | null
          order_number?: string
          shipping_method_id?: string | null
          status?: string
          subtotal_amount?: number
          updated_at?: string
          verified_customer_status_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string
          product_id: string
          sort_order: number
        }
        Insert: {
          category_id: string
          created_at?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt: string | null
          archived_at: string | null
          bytes: number | null
          checksum: string | null
          created_at: string
          format: string | null
          height: number | null
          id: string
          is_primary: boolean
          metadata: Json
          product_id: string
          product_variant_id: string | null
          provider: string
          public_id: string | null
          secure_url: string
          sort_order: number
          updated_at: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          archived_at?: string | null
          bytes?: number | null
          checksum?: string | null
          created_at?: string
          format?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          product_id: string
          product_variant_id?: string | null
          provider?: string
          public_id?: string | null
          secure_url: string
          sort_order?: number
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          archived_at?: string | null
          bytes?: number | null
          checksum?: string | null
          created_at?: string
          format?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          product_id?: string
          product_variant_id?: string | null
          provider?: string
          public_id?: string | null
          secure_url?: string
          sort_order?: number
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          archived_at: string | null
          created_at: string
          currency: string
          id: string
          label: string
          option_values: Json
          price_amount: number
          price_verification_status: string
          product_id: string
          publication_status: string
          size_ml: number | null
          sku: string | null
          sort_order: number
          updated_at: string
          variant_kind: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          label: string
          option_values?: Json
          price_amount: number
          price_verification_status?: string
          product_id: string
          publication_status?: string
          size_ml?: number | null
          sku?: string | null
          sort_order?: number
          updated_at?: string
          variant_kind: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          label?: string
          option_values?: Json
          price_amount?: number
          price_verification_status?: string
          product_id?: string
          publication_status?: string
          size_ml?: number | null
          sku?: string | null
          sort_order?: number
          updated_at?: string
          variant_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          availability_status: string
          brand: string | null
          business_unit_id: string
          concentration: string | null
          created_at: string
          description: string | null
          featured_from: string | null
          featured_rank: number | null
          featured_until: string | null
          gender: string | null
          id: string
          is_featured: boolean
          legacy_id: string | null
          name: string
          production_status: string
          publication_status: string
          sales_mode: string
          short_description: string | null
          slug: string
          specs: Json
          updated_at: string
          verification_status: string
        }
        Insert: {
          archived_at?: string | null
          availability_status?: string
          brand?: string | null
          business_unit_id: string
          concentration?: string | null
          created_at?: string
          description?: string | null
          featured_from?: string | null
          featured_rank?: number | null
          featured_until?: string | null
          gender?: string | null
          id?: string
          is_featured?: boolean
          legacy_id?: string | null
          name: string
          production_status?: string
          publication_status?: string
          sales_mode?: string
          short_description?: string | null
          slug: string
          specs?: Json
          updated_at?: string
          verification_status?: string
        }
        Update: {
          archived_at?: string | null
          availability_status?: string
          brand?: string | null
          business_unit_id?: string
          concentration?: string | null
          created_at?: string
          description?: string | null
          featured_from?: string | null
          featured_rank?: number | null
          featured_until?: string | null
          gender?: string | null
          id?: string
          is_featured?: boolean
          legacy_id?: string | null
          name?: string
          production_status?: string
          publication_status?: string
          sales_mode?: string
          short_description?: string | null
          slug?: string
          specs?: Json
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          business_unit_id: string | null
          created_at: string
          id: string
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          business_unit_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          business_unit_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          business_unit_id: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_unit_id: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_unit_id?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_methods_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_price_tiers: {
        Row: {
          archived_at: string | null
          context: string
          created_at: string
          currency: string
          id: string
          min_quantity: number
          price_amount: number
          product_variant_id: string
          updated_at: string
          wholesale_policy_id: string | null
        }
        Insert: {
          archived_at?: string | null
          context?: string
          created_at?: string
          currency?: string
          id?: string
          min_quantity: number
          price_amount: number
          product_variant_id: string
          updated_at?: string
          wholesale_policy_id?: string | null
        }
        Update: {
          archived_at?: string | null
          context?: string
          created_at?: string
          currency?: string
          id?: string
          min_quantity?: number
          price_amount?: number
          product_variant_id?: string
          updated_at?: string
          wholesale_policy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variant_price_tiers_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_price_tiers_wholesale_policy_id_fkey"
            columns: ["wholesale_policy_id"]
            isOneToOne: false
            referencedRelation: "wholesale_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_policies: {
        Row: {
          archived_at: string | null
          business_unit_id: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          min_amount: number | null
          min_quantity: number | null
          name: string
          notes: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_unit_id: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          min_amount?: number | null
          min_quantity?: number | null
          name: string
          notes?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_unit_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          min_amount?: number | null
          min_quantity?: number | null
          name?: string
          notes?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_policies_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
