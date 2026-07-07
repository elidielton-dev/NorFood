import { supabase } from "@/integrations/supabase/client";
import { getAuthenticatedUser } from "@/lib/auth/auth-session";
import { canUseBrowserStorage } from "@/lib/shared/runtime";
import { getActiveTenantSlug } from "@/lib/tenant/active-tenant";
import {
  DEMO_CUSTOMER_EMAIL,
  DEMO_CUSTOMER_NAME,
  DEMO_CUSTOMER_PASSWORD,
  DEMO_CUSTOMER_PHONE,
} from "@/lib/demo/demo-credentials";
import {
  createCustomerAccount,
  generateCustomerPasswordRecoveryCode,
  resolveCustomerEmailByIdentifier,
  syncCustomerProfile,
} from "@/lib/api/auth/customer-auth.functions";

const RESET_STORAGE_SUFFIX = "reset-v1";
export const CUSTOMER_AUTH_EVENT = "abelha-mel-customer-auth-change";

function resolveCustomerStorageScope(): string {
  const slug = getActiveTenantSlug();
  if (slug) return slug;
  if (canUseBrowserStorage()) {
    const match = window.location.pathname.match(/\/t\/([^/]+)/);
    if (match?.[1]) return match[1];
  }
  return "global";
}

function scopedStorageKey(kind: "accounts" | "session" | "reset") {
  const scope = resolveCustomerStorageScope();
  if (kind === "accounts") return `norfood-customer:${scope}:accounts-v1`;
  if (kind === "session") return `norfood-customer:${scope}:session-v1`;
  return `norfood-customer:${scope}:${RESET_STORAGE_SUFFIX}`;
}

type CustomerAccountRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  cep: string;
  address: string;
  addressNumber: string;
  neighborhood: string;
  city: string;
  stateCode: string;
  reference: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAccount = Omit<CustomerAccountRecord, "password">;

type CustomerSession = {
  userId: string;
};

type CustomerPasswordResetRecord = {
  accountId: string;
  code: string;
  identifier: string;
  createdAt: string;
};

export type CustomerAccountInput = {
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
};

export type CustomerAccountUpdate = Partial<
  Omit<CustomerAccountRecord, "id" | "password" | "createdAt" | "updatedAt">
>;

export type CustomerPasswordResetStartResult = {
  method: "email" | "local_code";
  maskedIdentifier: string;
  code?: string;
};

export type CustomerAuthChange = {
  event: string;
  account: CustomerAccount | null;
};

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(value: string) {
  const hasMinLength = value.trim().length >= 6;
  const hasLetter = /[a-zA-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  return hasMinLength && hasLetter && hasNumber;
}

function formatPhone(value: string) {
  const digits = normalizePhone(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function createResetCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function toPublicAccount(account: CustomerAccountRecord): CustomerAccount {
  const { password: _password, ...rest } = account;
  return rest;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function isSupabaseCustomerAuthEnabled() {
  return Boolean(
    (import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) &&
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY),
  );
}

function canUseSupabaseCustomerAuth() {
  return canUseBrowserStorage() && isSupabaseCustomerAuthEnabled();
}

function getCustomerRecoveryRedirectUrl() {
  const configuredOrigin =
    import.meta.env.VITE_PUBLIC_APP_URL ||
    import.meta.env.VITE_APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    process.env.VITE_APP_URL ||
    "";

  const browserOrigin = canUseBrowserStorage() ? window.location.origin : "";
  const origin =
    configuredOrigin ||
    (browserOrigin && !browserOrigin.includes("lovable.app")
      ? browserOrigin
      : "https://abelhaemel.vercel.app");

  return `${origin.replace(/\/$/, "")}/?recovery=1`;
}

function readAccounts() {
  if (!canUseBrowserStorage()) return [] as CustomerAccountRecord[];

  const raw = window.localStorage.getItem(scopedStorageKey("accounts"));
  if (!raw) return [];

  try {
    return JSON.parse(raw) as CustomerAccountRecord[];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: CustomerAccountRecord[]) {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(scopedStorageKey("accounts"), JSON.stringify(accounts));
}

function readSession() {
  if (!canUseBrowserStorage()) return null;

  const raw = window.localStorage.getItem(scopedStorageKey("session"));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CustomerSession;
  } catch {
    return null;
  }
}

function writeSession(session: CustomerSession | null) {
  if (!canUseBrowserStorage()) return;

  if (!session) {
    window.localStorage.removeItem(scopedStorageKey("session"));
    return;
  }

  window.localStorage.setItem(scopedStorageKey("session"), JSON.stringify(session));
}

function readResetRecord() {
  if (!canUseBrowserStorage()) return null;

  const raw = window.localStorage.getItem(scopedStorageKey("reset"));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CustomerPasswordResetRecord;
  } catch {
    return null;
  }
}

function writeResetRecord(record: CustomerPasswordResetRecord | null) {
  if (!canUseBrowserStorage()) return;

  if (!record) {
    window.localStorage.removeItem(scopedStorageKey("reset"));
    return;
  }

  window.localStorage.setItem(scopedStorageKey("reset"), JSON.stringify(record));
}

function emitAuthChanged(event = "LOCAL_CHANGED", account: CustomerAccount | null = null) {
  if (!canUseBrowserStorage()) return;
  window.dispatchEvent(
    new CustomEvent<CustomerAuthChange>(CUSTOMER_AUTH_EVENT, {
      detail: { event, account },
    }),
  );
}

async function getAuthorizationHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}

function validateLocalProfileInput(input: CustomerAccountInput | CustomerAccountUpdate) {
  if ("name" in input && typeof input.name === "string" && !input.name.trim()) {
    throw new Error("Informe seu nome completo.");
  }

  if ("email" in input && typeof input.email === "string") {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) throw new Error("Informe um e-mail valido.");
  }

  if ("phone" in input && typeof input.phone === "string") {
    const phone = normalizePhone(input.phone);
    if (phone.length < 10 || phone.length > 11) {
      throw new Error("Informe um telefone com DDD valido.");
    }
  }
}

function toCustomerAccountFromUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    name: String(metadata.name ?? metadata.nome ?? ""),
    email: String(user.email ?? metadata.email ?? ""),
    phone: formatPhone(String(metadata.phone ?? metadata.telefone ?? "")),
    cep: String(metadata.cep ?? ""),
    address: String(metadata.address ?? ""),
    addressNumber: String(metadata.addressNumber ?? ""),
    neighborhood: String(metadata.neighborhood ?? ""),
    city: String(metadata.city ?? ""),
    stateCode: String(metadata.stateCode ?? ""),
    reference: String(metadata.reference ?? ""),
    createdAt: String(metadata.createdAt ?? nowIso()),
    updatedAt: String(metadata.updatedAt ?? nowIso()),
  } satisfies CustomerAccount;
}

async function getSupabaseAccount() {
  const user = await getAuthenticatedUser();
  return user ? toCustomerAccountFromUser(user) : null;
}

function persistCustomerSession(account: CustomerAccount | null) {
  if (!account) return;
  writeSession({ userId: account.id });
}

async function signUpLocalCustomerAccount(input: CustomerAccountInput) {
  const accounts = readAccounts();
  const email = normalizeEmail(input.email);
  const phone = formatPhone(input.phone);
  const normalizedPhone = normalizePhone(phone);

  validateLocalProfileInput({ ...input, email, phone });
  if (!isStrongPassword(input.password)) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres, com letras e numeros.");
  }

  const emailInUse = accounts.some((item) => normalizeEmail(item.email) === email);
  if (emailInUse) throw new Error("Ja existe uma conta com esse e-mail.");

  const phoneInUse = accounts.some((item) => normalizePhone(item.phone) === normalizedPhone);
  if (phoneInUse) throw new Error("Ja existe uma conta com esse telefone.");

  const account: CustomerAccountRecord = {
    id: createId("cust"),
    name: input.name.trim(),
    email,
    phone,
    password: input.password,
    cep: input.cep?.trim() ?? "",
    address: input.address?.trim() ?? "",
    addressNumber: input.addressNumber?.trim() ?? "",
    neighborhood: input.neighborhood?.trim() ?? "",
    city: input.city?.trim() ?? "",
    stateCode: input.stateCode?.trim().toUpperCase() ?? "",
    reference: input.reference?.trim() ?? "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  accounts.unshift(account);
  writeAccounts(accounts);
  writeSession({ userId: account.id });
  emitAuthChanged("SIGNED_IN", toPublicAccount(account));
  return toPublicAccount(account);
}

async function signInLocalCustomerAccount(identifier: string, password: string) {
  const accounts = readAccounts();
  const parsed = validateCustomerIdentity(identifier);

  const account = accounts.find((item) => {
    const sameEmail = parsed.type === "email" && normalizeEmail(item.email) === parsed.value;
    const samePhone = parsed.type === "phone" && normalizePhone(item.phone) === parsed.value;
    return sameEmail || samePhone;
  });

  if (!account || account.password !== password) {
    throw new Error("E-mail/telefone ou senha invalidos.");
  }

  writeSession({ userId: account.id });
  emitAuthChanged("SIGNED_IN", toPublicAccount(account));
  return toPublicAccount(account);
}

function updateLocalCustomerAccount(updates: CustomerAccountUpdate) {
  const session = readSession();
  if (!session) throw new Error("Nenhum cliente autenticado.");

  const accounts = readAccounts();
  const index = accounts.findIndex((item) => item.id === session.userId);
  if (index === -1) throw new Error("Conta do cliente nao encontrada.");

  const current = accounts[index];
  const nextEmail = updates.email == null ? current.email : normalizeEmail(updates.email);
  const nextPhone = updates.phone == null ? current.phone : formatPhone(updates.phone);

  validateLocalProfileInput({
    ...(updates.name != null ? { name: updates.name } : {}),
    ...(updates.email != null ? { email: nextEmail } : {}),
    ...(updates.phone != null ? { phone: nextPhone } : {}),
  });

  const emailInUse = accounts.some(
    (item, itemIndex) => itemIndex !== index && normalizeEmail(item.email) === nextEmail,
  );
  if (emailInUse) throw new Error("Ja existe uma conta com esse e-mail.");

  const phoneInUse = accounts.some(
    (item, itemIndex) =>
      itemIndex !== index && normalizePhone(item.phone) === normalizePhone(nextPhone),
  );
  if (phoneInUse) throw new Error("Ja existe uma conta com esse telefone.");

  const updated: CustomerAccountRecord = {
    ...current,
    ...updates,
    email: nextEmail,
    phone: nextPhone,
    stateCode:
      updates.stateCode == null ? current.stateCode : updates.stateCode.trim().toUpperCase(),
    updatedAt: nowIso(),
  };

  accounts[index] = updated;
  writeAccounts(accounts);
  emitAuthChanged("USER_UPDATED", toPublicAccount(updated));
  return toPublicAccount(updated);
}

export function listCustomerAccounts() {
  return readAccounts().map(toPublicAccount);
}

export function validateCustomerIdentity(identifier: string) {
  const trimmed = identifier.trim();
  const digits = normalizePhone(trimmed);
  const email = normalizeEmail(trimmed);

  if (digits.length >= 10) return { type: "phone" as const, value: digits };
  if (isValidEmail(email)) return { type: "email" as const, value: email };
  throw new Error("Use um e-mail valido ou um telefone com DDD.");
}

export function validateCustomerProfileInput(input: CustomerAccountInput | CustomerAccountUpdate) {
  validateLocalProfileInput(input);
  if (
    "password" in input &&
    typeof input.password === "string" &&
    !isStrongPassword(input.password)
  ) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres, com letras e numeros.");
  }
}

/** Garante conta demo local para testes sem Supabase. */
export function ensureDemoLocalCustomerAccount() {
  if (isSupabaseCustomerAuthEnabled() || !canUseBrowserStorage()) return;

  const email = normalizeEmail(DEMO_CUSTOMER_EMAIL);
  const phone = formatPhone(DEMO_CUSTOMER_PHONE);
  const exists = readAccounts().some((item) => normalizeEmail(item.email) === email);
  if (exists) return;

  const account: CustomerAccountRecord = {
    id: createId("cust"),
    name: DEMO_CUSTOMER_NAME,
    email,
    phone,
    password: DEMO_CUSTOMER_PASSWORD,
    cep: "01310-100",
    address: "Av. Paulista",
    addressNumber: "1000",
    neighborhood: "Bela Vista",
    city: "Sao Paulo",
    stateCode: "SP",
    reference: "Conta demo local",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  writeAccounts([account, ...readAccounts()]);
}

export async function getCurrentCustomerAccount() {
  if (canUseSupabaseCustomerAuth()) {
    try {
      const account = await getSupabaseAccount();
      if (account) {
        persistCustomerSession(account);
        return account;
      }
    } catch {
      // fallback local abaixo
    }
  }

  return getCurrentLocalCustomerAccount();
}

function getCurrentLocalCustomerAccount() {
  const session = readSession();
  if (!session) return null;

  const account = readAccounts().find((item) => item.id === session.userId);
  return account ? toPublicAccount(account) : null;
}

export async function signUpCustomerAccount(input: CustomerAccountInput) {
  validateCustomerProfileInput(input);

  if (!canUseSupabaseCustomerAuth()) {
    return signUpLocalCustomerAccount(input);
  }

  try {
    await createCustomerAccount({
      data: {
        ...input,
        email: normalizeEmail(input.email),
        phone: formatPhone(input.phone),
      },
    });

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(input.email),
      password: input.password,
    });
    if (error) throw error;

    const account = await getSupabaseAccount();
    emitAuthChanged("SIGNED_IN", account);
    persistCustomerSession(account);
    return account;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Nao foi possivel criar a conta.");
  }
}

export async function signInCustomerAccount(identifier: string, password: string) {
  validateCustomerIdentity(identifier);

  if (!canUseSupabaseCustomerAuth()) {
    return signInLocalCustomerAccount(identifier, password);
  }

  try {
    const resolved = await resolveCustomerEmailByIdentifier({
      data: { identifier },
    });

    const { error } = await supabase.auth.signInWithPassword({
      email: resolved.email,
      password,
    });
    if (error) throw error;

    const account = await getSupabaseAccount();
    emitAuthChanged("SIGNED_IN", account);
    persistCustomerSession(account);
    return account;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Nao foi possivel entrar.");
  }
}

export async function signOutCustomerAccount() {
  if (canUseSupabaseCustomerAuth()) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore and clear local fallback state below
    }
  }

  writeSession(null);
  emitAuthChanged("SIGNED_OUT", null);
}

export async function updateCurrentCustomerAccount(updates: CustomerAccountUpdate) {
  validateLocalProfileInput(updates);

  if (!canUseSupabaseCustomerAuth()) {
    return updateLocalCustomerAccount(updates);
  }

  const headers = await getAuthorizationHeaders();
  if (!headers) throw new Error("Sessao do cliente nao encontrada.");

  const current = await getSupabaseAccount();
  if (!current) throw new Error("Nenhum cliente autenticado.");

  const nextPhone = updates.phone == null ? current.phone : formatPhone(updates.phone);
  const nextEmail = updates.email == null ? current.email : normalizeEmail(updates.email);

  const payload = {
    ...current,
    ...updates,
    email: nextEmail,
    phone: nextPhone,
    stateCode:
      updates.stateCode == null ? current.stateCode : updates.stateCode.trim().toUpperCase(),
    updatedAt: nowIso(),
  };

  const { error } = await supabase.auth.updateUser({
    ...(nextEmail !== current.email ? { email: nextEmail } : {}),
    data: {
      name: payload.name,
      phone: payload.phone,
      cep: payload.cep,
      address: payload.address,
      addressNumber: payload.addressNumber,
      neighborhood: payload.neighborhood,
      city: payload.city,
      stateCode: payload.stateCode,
      reference: payload.reference,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    },
  });
  if (error) throw error;

  await syncCustomerProfile({
    data: { name: payload.name, phone: payload.phone },
    headers,
  });

  const account = await getSupabaseAccount();
  emitAuthChanged("USER_UPDATED", account);
  return account;
}

export async function startCustomerPasswordReset(
  identifier: string,
): Promise<CustomerPasswordResetStartResult> {
  const parsed = validateCustomerIdentity(identifier);

  if (!canUseSupabaseCustomerAuth()) {
    const accounts = readAccounts();
    const account = accounts.find((item) =>
      parsed.type === "email"
        ? normalizeEmail(item.email) === parsed.value
        : normalizePhone(item.phone) === parsed.value,
    );

    if (!account) throw new Error("Nao encontramos uma conta com esse e-mail ou telefone.");

    const record: CustomerPasswordResetRecord = {
      accountId: account.id,
      code: createResetCode(),
      identifier: parsed.type === "email" ? account.email : account.phone,
      createdAt: nowIso(),
    };

    writeResetRecord(record);

    return {
      method: "local_code",
      code: record.code,
      maskedIdentifier: record.identifier,
    };
  }

  const resolved = await resolveCustomerEmailByIdentifier({
    data: { identifier },
  });

  await generateCustomerPasswordRecoveryCode({
    data: { identifier },
  });

  return {
    method: "email",
    maskedIdentifier: maskEmail(resolved.email),
  };
}

export async function verifyCustomerPasswordResetCode(identifier: string, code: string) {
  const parsed = validateCustomerIdentity(identifier);
  const normalizedCode = code.trim();

  if (normalizedCode.length < 6) {
    throw new Error("Informe o codigo de 6 digitos.");
  }

  if (canUseSupabaseCustomerAuth()) {
    const resolved = await resolveCustomerEmailByIdentifier({
      data: { identifier },
    });

    const { error } = await supabase.auth.verifyOtp({
      email: resolved.email,
      token: normalizedCode,
      type: "recovery",
    });
    if (error) throw error;

    return { method: "email" as const, identifier: resolved.email };
  }

  const record = readResetRecord();
  if (!record) throw new Error("Nenhuma recuperacao foi iniciada.");

  const expectedIdentifier =
    parsed.type === "email" ? normalizeEmail(record.identifier) : normalizePhone(record.identifier);
  if (expectedIdentifier !== parsed.value) {
    throw new Error("Esse codigo nao pertence ao e-mail informado.");
  }
  if (record.code !== normalizedCode) {
    throw new Error("Codigo de recuperacao invalido.");
  }

  return { method: "local_code" as const, identifier: record.identifier };
}

export async function completeCustomerPasswordReset(
  codeOrPassword: string,
  maybePassword?: string,
) {
  if (canUseSupabaseCustomerAuth()) {
    const newPassword = codeOrPassword;
    if (!isStrongPassword(newPassword)) {
      throw new Error("A nova senha precisa ter pelo menos 6 caracteres, com letras e numeros.");
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    const account = await getSupabaseAccount();
    emitAuthChanged("PASSWORD_RECOVERY", account);
    return account;
  }

  const code = codeOrPassword;
  const newPassword = maybePassword ?? "";
  const record = readResetRecord();
  if (!record) throw new Error("Nenhuma recuperacao foi iniciada.");
  if (record.code !== code.trim()) throw new Error("Codigo de recuperacao invalido.");
  if (!isStrongPassword(newPassword)) {
    throw new Error("A nova senha precisa ter pelo menos 6 caracteres, com letras e numeros.");
  }

  const accounts = readAccounts();
  const index = accounts.findIndex((item) => item.id === record.accountId);
  if (index === -1) throw new Error("Conta do cliente nao encontrada.");

  accounts[index] = {
    ...accounts[index],
    password: newPassword,
    updatedAt: nowIso(),
  };

  writeAccounts(accounts);
  writeSession({ userId: accounts[index].id });
  writeResetRecord(null);
  emitAuthChanged("PASSWORD_RECOVERY", toPublicAccount(accounts[index]));
  return toPublicAccount(accounts[index]);
}

export function subscribeCustomerAuth(listener: (change: CustomerAuthChange) => void) {
  if (!canUseBrowserStorage()) return () => undefined;

  const customHandler = (event: Event) => {
    const detail = (event as CustomEvent<CustomerAuthChange>).detail;
    listener(detail ?? { event: "LOCAL_CHANGED", account: null });
  };

  window.addEventListener(CUSTOMER_AUTH_EVENT, customHandler as EventListener);

  let unsub = () => undefined;

  if (canUseSupabaseCustomerAuth()) {
    const subscription = supabase.auth.onAuthStateChange(async (event, session) => {
      const account = session?.user ? toCustomerAccountFromUser(session.user) : null;
      listener({ event, account });
    });

    unsub = () => {
      subscription.data.subscription.unsubscribe();
    };
  }

  return () => {
    window.removeEventListener(CUSTOMER_AUTH_EVENT, customHandler as EventListener);
    unsub();
  };
}

export function isCustomerRecoveryMode() {
  if (!canUseBrowserStorage()) return false;
  return new URLSearchParams(window.location.search).get("recovery") === "1";
}
