import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { assertAuthRateLimit, maskAuthIdentifier } from "@/lib/signup/auth-rate-limit.server";

type CustomerAccountPayload = {
  name: string;
  email: string;
  phone: string;
  password: string;
  cep?: string;
  address?: string;
  addressNumber?: string;
  neighborhood?: string;
  city?: string;
  stateCode?: string;
  reference?: string;
  clientIp?: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function formatPhone(value: string) {
  const digits = normalizePhone(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(value: string) {
  return value.trim().length >= 6 && /[a-zA-Z]/.test(value) && /\d/.test(value);
}

function getSupabasePublishableKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
}

const ACCOUNT_LOOKUP_ERROR = "Nao encontramos uma conta com esse e-mail ou telefone.";
const GENERIC_AUTH_ERROR = "E-mail/telefone ou senha invalidos.";

async function resolveCustomerEmailFromIdentifier(identifier: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const trimmedIdentifier = identifier.trim();

  if (isValidEmail(trimmedIdentifier)) {
    return { email: normalizeEmail(trimmedIdentifier) };
  }

  const digits = normalizePhone(trimmedIdentifier);
  if (digits.length < 10) throw new Error("Use um e-mail valido ou um telefone com DDD.");

  const { data: profiles, error } = await supabaseAdmin.from("profiles").select("id, telefone");
  if (error) throw error;

  const profile = (profiles ?? []).find((item) => normalizePhone(item.telefone ?? "") === digits);
  if (!profile?.id) throw new Error(ACCOUNT_LOOKUP_ERROR);

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(
    profile.id,
  );
  if (authError) throw authError;

  const email = authUser.user?.email;
  if (!email) throw new Error(ACCOUNT_LOOKUP_ERROR);

  return { email: normalizeEmail(email) };
}

function validatePayload(input: CustomerAccountPayload) {
  if (!input.name.trim()) throw new Error("Informe seu nome completo.");
  if (!isValidEmail(input.email)) throw new Error("Informe um e-mail valido.");
  if (normalizePhone(input.phone).length < 10)
    throw new Error("Informe um telefone com DDD valido.");
  if (!isStrongPassword(input.password)) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres, com letras e numeros.");
  }
}

export const createCustomerAccount = createServerFn({ method: "POST" })
  .validator((input: CustomerAccountPayload) => input)
  .handler(async ({ data }) => {
    validatePayload(data);
    await assertAuthRateLimit(data.clientIp?.trim() || "unknown", "signup", data.email);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = normalizeEmail(data.email);
    const phone = formatPhone(data.phone);
    const phoneDigits = normalizePhone(phone);

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, telefone");
    if (profilesError) throw profilesError;

    const phoneInUse = (profiles ?? []).some(
      (profile) => normalizePhone(profile.telefone ?? "") === phoneDigits,
    );
    if (phoneInUse) throw new Error("Ja existe uma conta com esse telefone.");

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        name: data.name.trim(),
        phone,
        cep: data.cep?.trim() ?? "",
        address: data.address?.trim() ?? "",
        addressNumber: data.addressNumber?.trim() ?? "",
        neighborhood: data.neighborhood?.trim() ?? "",
        city: data.city?.trim() ?? "",
        stateCode: data.stateCode?.trim().toUpperCase() ?? "",
        reference: data.reference?.trim() ?? "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    if (createError) throw createError;

    const userId = createdUser.user?.id;
    if (!userId) throw new Error("Nao foi possivel criar a conta do cliente.");

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      nome: data.name.trim(),
      telefone: phone,
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw profileError;

    await supabaseAdmin.from("user_roles").upsert({
      user_id: userId,
      role: "cliente",
    });

    return { ok: true, userId };
  });

export const signInCustomerServer = createServerFn({ method: "POST" })
  .validator((input: { identifier: string; password: string; clientIp?: string }) => input)
  .handler(async ({ data }) => {
    const identifier = data.identifier?.trim();
    const password = data.password ?? "";
    if (!identifier || !password) {
      throw new Error(GENERIC_AUTH_ERROR);
    }

    await assertAuthRateLimit(data.clientIp?.trim() || "unknown", "sign_in", identifier);

    let email: string;
    try {
      ({ email } = await resolveCustomerEmailFromIdentifier(identifier));
    } catch {
      throw new Error(GENERIC_AUTH_ERROR);
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = getSupabasePublishableKey();
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Autenticacao indisponivel no momento.");
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: sessionData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !sessionData.session) {
      throw new Error(GENERIC_AUTH_ERROR);
    }

    return {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_at: sessionData.session.expires_at,
    };
  });

export const startCustomerPasswordResetServer = createServerFn({ method: "POST" })
  .validator((input: { identifier: string; clientIp?: string }) => input)
  .handler(async ({ data }) => {
    const identifier = data.identifier?.trim();
    if (!identifier) {
      throw new Error("Informe o e-mail ou telefone da conta.");
    }

    await assertAuthRateLimit(data.clientIp?.trim() || "unknown", "password_reset", identifier);

    try {
      const resolved = await resolveCustomerEmailFromIdentifier(identifier);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const redirectTo =
        process.env.VITE_APP_URL?.trim()?.replace(/\/$/, "") + "/recuperar-senha" ||
        "https://abelhaemel.vercel.app/recuperar-senha";

      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(resolved.email, {
        redirectTo,
      });
      if (error) throw error;
    } catch (error) {
      if (error instanceof Error && error.message === ACCOUNT_LOOKUP_ERROR) {
        // Resposta uniforme para nao revelar se a conta existe.
      } else if (error instanceof Error) {
        throw error;
      }
    }

    return {
      sent: true as const,
      maskedIdentifier: maskAuthIdentifier(identifier),
    };
  });

export const verifyCustomerPasswordResetOtpServer = createServerFn({ method: "POST" })
  .validator((input: { identifier: string; code: string; clientIp?: string }) => input)
  .handler(async ({ data }) => {
    const identifier = data.identifier?.trim();
    const code = data.code?.trim();
    if (!identifier || code.length < 6) {
      throw new Error("Codigo de recuperacao invalido.");
    }

    await assertAuthRateLimit(data.clientIp?.trim() || "unknown", "password_verify", identifier);

    const resolved = await resolveCustomerEmailFromIdentifier(identifier);
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = getSupabasePublishableKey();
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Recuperacao indisponivel no momento.");
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: otpData, error } = await supabase.auth.verifyOtp({
      email: resolved.email,
      token: code,
      type: "recovery",
    });
    if (error || !otpData.session) {
      throw new Error("Codigo de recuperacao invalido ou expirado.");
    }

    return {
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
      expires_at: otpData.session.expires_at,
    };
  });

export const syncCustomerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string; phone: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = formatPhone(data.phone);

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: context.userId,
      nome: data.name.trim(),
      telefone: phone,
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw profileError;

    return { ok: true };
  });
