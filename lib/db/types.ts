// Hand-written mirror of supabase/migrations/*.sql.
// Once a live Supabase project exists, regenerate with:
//   supabase gen types typescript --project-id <id> > lib/db/types.ts
// and diff against this file before overwriting.

type EventRowShape = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  created_by: string;
  remind_offset_minutes: number;
  remind_at: string | null;
  reminder_sent: boolean;
  reminder_claimed_at: string | null;
  reminder_attempts: number;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string;
          telegram_chat_id: number | null;
          telegram_link_code: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          telegram_chat_id?: number | null;
          telegram_link_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          telegram_chat_id?: number | null;
          telegram_link_code?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: EventRowShape;
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          location?: string | null;
          start_at: string;
          end_at?: string | null;
          created_by: string;
          remind_offset_minutes?: number;
          // remind_at, reminder_sent, reminder_claimed_at, reminder_attempts
          // are trigger-maintained -- never set these from application code.
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          location?: string | null;
          start_at?: string;
          end_at?: string | null;
          created_by?: string;
          remind_offset_minutes?: number;
          // remind_at is trigger-derived and never written directly.
          // reminder_sent/reminder_claimed_at/reminder_attempts ARE
          // legitimately written by the admin-client cron dispatcher
          // (lib/supabase/admin.ts) after a confirmed send -- the type
          // system can't express "only this caller may set this field,"
          // so app/actions/events.ts (the anon-client Server Actions) must
          // not set them by convention, enforced by code review, not TS.
          reminder_sent?: boolean;
          reminder_claimed_at?: string | null;
          reminder_attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_status: {
        Row: {
          id: number;
          last_successful_dispatch_at: string | null;
        };
        Insert: {
          id?: number;
          last_successful_dispatch_at?: string | null;
        };
        Update: {
          id?: number;
          last_successful_dispatch_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_due_reminders: {
        Args: { lease_minutes: number; max_attempts: number };
        Returns: EventRowShape[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
