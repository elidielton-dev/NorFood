import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AtendimentoStaffMember = {
  id: string;
  nome: string | null;
  email: string | null;
};

/** Lista colaboradores com acesso ao painel (para atribuicao de conversas). */
export async function listAtendimentoStaff(): Promise<AtendimentoStaffMember[]> {
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "gerente", "atendente", "motoboy"]);
  if (rolesError) throw rolesError;

  const staffIds = [...new Set((roles ?? []).map((row) => row.user_id as string))];
  if (staffIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, nome, email")
    .in("id", staffIds);
  if (profilesError) throw profilesError;

  return (profiles ?? [])
    .map((row) => ({
      id: row.id as string,
      nome: (row.nome as string | null) ?? null,
      email: (row.email as string | null) ?? null,
    }))
    .sort((a, b) => (a.nome ?? a.email ?? "").localeCompare(b.nome ?? b.email ?? ""));
}
