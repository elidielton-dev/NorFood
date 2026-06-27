-- Mercado Pago — campos de pagamento nas faturas da plataforma

ALTER TABLE public.tenant_billing_invoices
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS mp_pix_qr_code TEXT,
  ADD COLUMN IF NOT EXISTS mp_pix_qr_base64 TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenant_billing_invoices_mp_payment
  ON public.tenant_billing_invoices(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;
