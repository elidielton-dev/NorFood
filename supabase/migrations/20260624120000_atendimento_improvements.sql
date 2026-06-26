-- Melhorias Atendimento: reply Meta, prefs staff, tags ja existem no schema base

ALTER TABLE public.waba_messages
  ADD COLUMN IF NOT EXISTS reply_to_wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_text TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_from_me BOOLEAN;

CREATE TABLE IF NOT EXISTS public.staff_atendimento_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_atendimento_prefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_atendimento_prefs'
      AND policyname = 'staff_atendimento_prefs_own'
  ) THEN
    CREATE POLICY "staff_atendimento_prefs_own"
      ON public.staff_atendimento_prefs
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.staff_atendimento_prefs TO authenticated;
GRANT ALL ON public.staff_atendimento_prefs TO service_role;
