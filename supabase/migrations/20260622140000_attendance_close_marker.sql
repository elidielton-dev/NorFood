-- Marca o instante em que atendimentos foram encerrados pelo horario da loja

ALTER TABLE public.config_operacional
  ADD COLUMN IF NOT EXISTS attendance_close_marker TIMESTAMPTZ;
