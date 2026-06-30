import type { Enums } from "@/integrations/supabase/types";

export type StaffRole = Extract<
  Enums<"app_role">,
  "admin" | "gerente" | "cozinha" | "garcom" | "motoboy"
>;

export const STAFF_ROLE_OPTIONS: Array<{ value: StaffRole; label: string; hint: string }> = [
  { value: "admin", label: "Administrador", hint: "Acesso total ao painel e permissoes." },
  { value: "gerente", label: "Gerente", hint: "Operacao, cardapio e equipe." },
  { value: "cozinha", label: "Cozinha", hint: "KDS e preparo de pedidos." },
  { value: "garcom", label: "Garcom", hint: "Mesas, balcao e atendimento." },
  { value: "motoboy", label: "Motoboy", hint: "Entregas e rota de delivery." },
];

export const STAFF_ROLE_VALUES = STAFF_ROLE_OPTIONS.map((item) => item.value);

export type ColaboradorFormState = {
  id: string | null;
  nome: string;
  email: string;
  telefone: string;
  password: string;
  roles: StaffRole[];
};

export function createEmptyColaboradorForm(): ColaboradorFormState {
  return {
    id: null,
    nome: "",
    email: "",
    telefone: "",
    password: "",
    roles: ["garcom"],
  };
}

export function colaboradorToFormState(colaborador: {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  roles: string[];
}): ColaboradorFormState {
  return {
    id: colaborador.id,
    nome: colaborador.nome ?? "",
    email: colaborador.email ?? "",
    telefone: colaborador.telefone ?? "",
    password: "",
    roles: colaborador.roles.filter((role): role is StaffRole =>
      STAFF_ROLE_VALUES.includes(role as StaffRole),
    ),
  };
}

export function formatStaffRoleLabel(role: string) {
  if (role === "owner") return "Proprietario";
  return STAFF_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

export function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhone(value: string) {
  const digits = normalizePhoneDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isStrongPassword(value: string) {
  return value.trim().length >= 6 && /[a-zA-Z]/.test(value) && /\d/.test(value);
}
