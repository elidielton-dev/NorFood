import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Save, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  fetchFiscalSettingsServer,
  lookupCnpjPublicServer,
  removeFiscalCertificateServer,
  saveEmpresaFiscalServer,
  saveFiscalConfigServer,
  uploadFiscalCertificateServer,
  emitNfceHomologacaoTestServer,
} from "@/lib/api/fiscal.functions";
import type { EmpresaFiscal, FiscalAmbiente } from "@/lib/fiscal/fiscal-types";
import { CRT_OPTIONS, UF_OPTIONS } from "@/lib/fiscal/fiscal-types";
import { formatCep, formatCnpj, isValidCnpj, onlyDigits, validateEmpresaFiscal } from "@/lib/fiscal/fiscal-validation";
import {
  GestaoAlert,
  GestaoButton,
  GestaoCard,
  GestaoField,
  GestaoInput,
  GestaoPage,
  GestaoSectionTitle,
  GestaoSelect,
  GestaoUnderlineTabs,
} from "@/components/gestao-ui";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/painel/fiscal/configuracoes")({
  component: FiscalConfiguracoesPage,
});

type Tab = "empresa" | "nfce" | "certificado";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function mutationErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Nao foi possivel concluir a acao. Tente novamente.";
}

function FiscalConfiguracoesPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const lastCnpjLookupRef = useRef<string>("");
  const [tab, setTab] = useState<Tab>("empresa");
  const [empresa, setEmpresa] = useState<EmpresaFiscal | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [selectedCertFile, setSelectedCertFile] = useState<File | null>(null);
  const [cscToken, setCscToken] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [configForm, setConfigForm] = useState({
    nfceHabilitada: false,
    nfeHabilitada: false,
    ambiente: "homologacao" as FiscalAmbiente,
    serieNfce: 1,
    proximoNumeroNfce: 1,
    cscId: "",
    emitirAutomaticoPdv: false,
    emitirAutomaticoDelivery: false,
    emitirAutomaticoMesas: false,
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["fiscal-settings"],
    queryFn: () => fetchFiscalSettingsServer(),
    retry: 1,
  });

  useEffect(() => {
    if (!data) return;
    setEmpresa((current) => {
      if (current && onlyDigits(current.cnpj) === onlyDigits(data.empresa.cnpj) && current.razaoSocial.trim()) {
        return current;
      }
      return data.empresa;
    });
    setConfigForm({
      nfceHabilitada: data.config.nfceHabilitada,
      nfeHabilitada: data.config.nfeHabilitada,
      ambiente: data.config.ambiente,
      serieNfce: data.config.serieNfce,
      proximoNumeroNfce: data.config.proximoNumeroNfce,
      cscId: data.config.cscId,
      emitirAutomaticoPdv: data.config.emitirAutomaticoPdv,
      emitirAutomaticoDelivery: data.config.emitirAutomaticoDelivery,
      emitirAutomaticoMesas: data.config.emitirAutomaticoMesas,
    });
  }, [data]);

  const saveEmpresaMutation = useMutation({
    mutationFn: (payload: EmpresaFiscal) => saveEmpresaFiscalServer({ data: payload }),
    onMutate: () => toast.loading("Salvando empresa...", { id: "fiscal-empresa" }),
    onSuccess: () => {
      toast.success("Dados da empresa salvos.", { id: "fiscal-empresa" });
      setFormErrors([]);
      void qc.invalidateQueries({ queryKey: ["fiscal-settings"] });
    },
    onError: (err: unknown) => {
      toast.error(mutationErrorMessage(err), { id: "fiscal-empresa" });
    },
  });

  const lookupCnpjMutation = useMutation({
    mutationFn: (cnpj: string) => lookupCnpjPublicServer({ data: { cnpj } }),
    onMutate: () => toast.loading("Consultando CNPJ...", { id: "cnpj-lookup" }),
    onSuccess: (result) => {
      lastCnpjLookupRef.current = result.empresa.cnpj;
      setEmpresa((current) => {
        const base = current ?? data?.empresa;
        if (!base) return result.empresa;
        return {
          ...result.empresa,
          inscricaoEstadual: base.inscricaoEstadual || result.empresa.inscricaoEstadual,
          inscricaoMunicipal: base.inscricaoMunicipal || result.empresa.inscricaoMunicipal,
          email: result.empresa.email || base.email,
        };
      });
      setFormErrors([]);
      const situacao = result.situacaoCadastral.toUpperCase();
      if (situacao.includes("ATIVA")) {
        toast.success("Dados publicos do CNPJ preenchidos.", { id: "cnpj-lookup" });
      } else {
        toast.warning(
          `Dados preenchidos. Situacao cadastral: ${result.situacaoCadastral}. Confira a IE manualmente.`,
          { id: "cnpj-lookup" },
        );
      }
    },
    onError: (err: unknown) => {
      toast.error(mutationErrorMessage(err), { id: "cnpj-lookup" });
    },
  });

  function requestCnpjLookup(cnpjValue: string, force = false) {
    const digits = onlyDigits(cnpjValue);
    if (digits.length < 14) {
      if (force) toast.error("Digite os 14 digitos do CNPJ.");
      return;
    }
    if (!isValidCnpj(digits)) {
      toast.error("CNPJ invalido. Verifique os digitos verificadores.");
      return;
    }
    if (!force && lastCnpjLookupRef.current === digits) return;
    if (lookupCnpjMutation.isPending) return;
    lookupCnpjMutation.mutate(digits);
  }

  useEffect(() => {
    if (!data) return;
    const digits = onlyDigits(data.empresa.cnpj);
    if (digits.length !== 14 || !isValidCnpj(digits) || data.empresa.razaoSocial.trim()) return;
    if (lastCnpjLookupRef.current === digits) return;
    requestCnpjLookup(digits, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara ao carregar CNPJ salvo sem razao social
  }, [data]);

  const testHomologMutation = useMutation({
    mutationFn: () => emitNfceHomologacaoTestServer(),
    onMutate: () => toast.loading("Emitindo NFC-e de teste na SEFAZ...", { id: "fiscal-test" }),
    onSuccess: (result) => {
      toast.success(
        `NFC-e autorizada na SEFAZ. Chave: ${result.nota.chave_acesso?.slice(0, 12) ?? ""}...`,
        { id: "fiscal-test" },
      );
      void qc.invalidateQueries({ queryKey: ["notas-fiscais"] });
    },
    onError: (err: unknown) => {
      toast.error(mutationErrorMessage(err), { id: "fiscal-test" });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: () =>
      saveFiscalConfigServer({
        data: {
          ...configForm,
          cscToken: cscToken.trim() || undefined,
        },
      }),
    onMutate: () => toast.loading("Salvando NFC-e...", { id: "fiscal-nfce" }),
    onSuccess: () => {
      const ambienteLabel =
        configForm.ambiente === "producao" ? "Producao (SEFAZ)" : "Homologacao (testes)";
      toast.success(`Configuracao NFC-e salva. Ambiente: ${ambienteLabel}.`, { id: "fiscal-nfce" });
      setCscToken("");
      void qc.invalidateQueries({ queryKey: ["fiscal-settings"] });
    },
    onError: (err: unknown) => {
      toast.error(mutationErrorMessage(err), { id: "fiscal-nfce" });
    },
  });

  const uploadCertMutation = useMutation({
    mutationFn: (input: { pfxBase64: string; password: string; empresaCnpj: string }) =>
      uploadFiscalCertificateServer({ data: input }),
    onMutate: () => toast.loading("Instalando certificado...", { id: "fiscal-cert" }),
    onSuccess: (result) => {
      toast.success(`Certificado instalado: ${result.titular}`, { id: "fiscal-cert" });
      setCertPassword("");
      setSelectedCertFile(null);
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["fiscal-settings"] });
    },
    onError: (err: unknown) => {
      toast.error(mutationErrorMessage(err), { id: "fiscal-cert" });
    },
  });

  const removeCertMutation = useMutation({
    mutationFn: () => removeFiscalCertificateServer(),
    onMutate: () => toast.loading("Removendo certificado...", { id: "fiscal-cert-rm" }),
    onSuccess: () => {
      toast.success("Certificado removido.", { id: "fiscal-cert-rm" });
      void qc.invalidateQueries({ queryKey: ["fiscal-settings"] });
    },
    onError: (err: unknown) => {
      toast.error(mutationErrorMessage(err), { id: "fiscal-cert-rm" });
    },
  });

  function handleSaveEmpresa() {
    if (!empresa) return;
    const warnings = validateEmpresaFiscal(empresa);
    if (warnings.length > 0) {
      setFormErrors(warnings);
      toast.warning("Salvo como rascunho. Complete os campos para emitir NFC-e.");
    } else {
      setFormErrors([]);
    }
    saveEmpresaMutation.mutate(empresa);
  }

  async function handleCertFileSelect(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pfx") && !file.name.toLowerCase().endsWith(".p12")) {
      toast.error("Selecione um arquivo .pfx ou .p12 (certificado A1).");
      setSelectedCertFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setSelectedCertFile(file);
  }

  async function handleInstallCertificate() {
    const file = selectedCertFile ?? fileRef.current?.files?.[0] ?? null;
    await handleCertFile(file);
  }

  async function handleCertFile(file: File | null) {
    if (!file || !empresa) return;
    if (!file.name.toLowerCase().endsWith(".pfx") && !file.name.toLowerCase().endsWith(".p12")) {
      toast.error("Envie um arquivo .pfx ou .p12 (certificado A1).");
      return;
    }
    if (!certPassword) {
      toast.error("Informe a senha do certificado.");
      return;
    }
    const buffer = await file.arrayBuffer();
    uploadCertMutation.mutate({
      pfxBase64: arrayBufferToBase64(buffer),
      password: certPassword,
      empresaCnpj: empresa.cnpj,
    });
  }

  if (isLoading) {
    return (
      <GestaoPage title="Configuracoes fiscais" subtitle="Carregando...">
        <GestaoCard>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando modulo fiscal...
          </p>
        </GestaoCard>
      </GestaoPage>
    );
  }

  if (isError || !data) {
    return (
      <GestaoPage title="Configuracoes fiscais" subtitle="Modulo fiscal">
        <GestaoAlert tone="warning">
          <p className="font-medium">Nao foi possivel carregar as configuracoes fiscais</p>
          <p className="text-sm text-muted-foreground mt-1">
            {mutationErrorMessage(error)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Se as tabelas ainda nao existem, rode{" "}
            <code>scripts/production-fiscal-migrations.sql</code> no Supabase SQL Editor.
          </p>
          <GestaoButton className="mt-4" onClick={() => void refetch()}>
            Tentar novamente
          </GestaoButton>
        </GestaoAlert>
      </GestaoPage>
    );
  }

  const activeEmpresa = empresa ?? data.empresa;
  const readiness = data.readiness;
  const cert = data.config.certificado;

  return (
    <GestaoPage
      title="Configuracoes fiscais"
      subtitle="Dados da empresa, certificado A1 criptografado e emissao NFC-e direta na SEFAZ (PE)."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          to="/painel/fiscal"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--honey-line)] bg-background px-4 text-sm font-semibold hover:bg-muted/50"
        >
          Voltar para notas
        </Link>
        {isFetching ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Atualizando...
          </span>
        ) : null}
      </div>

      {formErrors.length > 0 && (
        <GestaoAlert tone="warning">
          <p className="font-medium mb-2">Campos pendentes para emissao</p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {formErrors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </GestaoAlert>
      )}

      {readiness.camposPendentes.length > 0 && (
        <GestaoAlert tone="warning">
          <p className="font-medium mb-2">Pendencias para emissao em producao</p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {readiness.camposPendentes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </GestaoAlert>
      )}

      {readiness.certificadoValido && readiness.empresaCompleta && (
        <GestaoAlert tone="success">
          <p className="font-medium flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Pronto para homologacao / emissao NFC-e
          </p>
        </GestaoAlert>
      )}

      <GestaoUnderlineTabs
        value={tab}
        onChange={(id) => setTab(id as Tab)}
        items={[
          { id: "empresa", label: "Empresa" },
          { id: "nfce", label: "NFC-e" },
          { id: "certificado", label: "Certificado" },
        ]}
      />

      {tab === "empresa" && (
        <GestaoCard className="mt-4 space-y-4">
          <GestaoSectionTitle
            title="Dados do emitente"
            description="Informe o CNPJ para buscar razao social, endereco e CNAE em bases publicas gratuitas. A inscricao estadual deve ser preenchida manualmente."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <GestaoField label="CNPJ" className="sm:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <GestaoInput
                  className="flex-1"
                  value={formatCnpj(activeEmpresa.cnpj)}
                  onChange={(e) => {
                    const nextCnpj = e.target.value;
                    const digits = onlyDigits(nextCnpj);
                    setEmpresa({ ...activeEmpresa, cnpj: nextCnpj });
                    if (digits.length === 14 && isValidCnpj(digits)) {
                      requestCnpjLookup(digits);
                    }
                  }}
                  onBlur={(e) => {
                    const digits = onlyDigits(e.target.value);
                    const needsFill = !activeEmpresa.razaoSocial.trim();
                    requestCnpjLookup(e.target.value, needsFill);
                  }}
                  placeholder="00.000.000/0000-00"
                />
                <GestaoButton
                  type="button"
                  variant="secondary"
                  disabled={lookupCnpjMutation.isPending || !isValidCnpj(activeEmpresa.cnpj)}
                  onClick={() => requestCnpjLookup(activeEmpresa.cnpj, true)}
                >
                  {lookupCnpjMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  Buscar dados
                </GestaoButton>
              </div>
            </GestaoField>
            <GestaoField label="Inscricao estadual">
              <GestaoInput
                value={activeEmpresa.inscricaoEstadual}
                onChange={(e) =>
                  setEmpresa({ ...activeEmpresa, inscricaoEstadual: e.target.value })
                }
              />
            </GestaoField>
            <GestaoField label="Razao social" className="sm:col-span-2">
              <GestaoInput
                value={activeEmpresa.razaoSocial}
                onChange={(e) => setEmpresa({ ...activeEmpresa, razaoSocial: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="Nome fantasia" className="sm:col-span-2">
              <GestaoInput
                value={activeEmpresa.nomeFantasia}
                onChange={(e) => setEmpresa({ ...activeEmpresa, nomeFantasia: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="CRT (regime tributario)">
              <GestaoSelect
                value={String(activeEmpresa.crt)}
                onChange={(e) =>
                  setEmpresa({
                    ...activeEmpresa,
                    crt: Number(e.target.value) as EmpresaFiscal["crt"],
                  })
                }
              >
                {CRT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </GestaoSelect>
            </GestaoField>
            <GestaoField label="CNAE">
              <GestaoInput
                value={activeEmpresa.cnae}
                onChange={(e) => setEmpresa({ ...activeEmpresa, cnae: e.target.value })}
                placeholder="1096100"
              />
            </GestaoField>
            <GestaoField label="Logradouro" className="sm:col-span-2">
              <GestaoInput
                value={activeEmpresa.logradouro}
                onChange={(e) => setEmpresa({ ...activeEmpresa, logradouro: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="Numero">
              <GestaoInput
                value={activeEmpresa.numero}
                onChange={(e) => setEmpresa({ ...activeEmpresa, numero: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="Complemento">
              <GestaoInput
                value={activeEmpresa.complemento}
                onChange={(e) => setEmpresa({ ...activeEmpresa, complemento: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="Bairro">
              <GestaoInput
                value={activeEmpresa.bairro}
                onChange={(e) => setEmpresa({ ...activeEmpresa, bairro: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="Municipio">
              <GestaoInput
                value={activeEmpresa.municipio}
                onChange={(e) => setEmpresa({ ...activeEmpresa, municipio: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="Codigo IBGE (7 digitos)">
              <GestaoInput
                value={activeEmpresa.codigoMunicipioIbge}
                onChange={(e) =>
                  setEmpresa({ ...activeEmpresa, codigoMunicipioIbge: e.target.value })
                }
                placeholder="2611606"
              />
            </GestaoField>
            <GestaoField label="UF">
              <GestaoSelect
                value={activeEmpresa.uf}
                onChange={(e) => setEmpresa({ ...activeEmpresa, uf: e.target.value })}
              >
                {UF_OPTIONS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </GestaoSelect>
            </GestaoField>
            <GestaoField label="CEP">
              <GestaoInput
                value={formatCep(activeEmpresa.cep)}
                onChange={(e) => setEmpresa({ ...activeEmpresa, cep: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="Telefone">
              <GestaoInput
                value={activeEmpresa.telefone}
                onChange={(e) => setEmpresa({ ...activeEmpresa, telefone: e.target.value })}
              />
            </GestaoField>
            <GestaoField label="E-mail fiscal">
              <GestaoInput
                type="email"
                value={activeEmpresa.email}
                onChange={(e) => setEmpresa({ ...activeEmpresa, email: e.target.value })}
              />
            </GestaoField>
          </div>
          <GestaoButton onClick={handleSaveEmpresa} disabled={saveEmpresaMutation.isPending}>
            {saveEmpresaMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar empresa
          </GestaoButton>
        </GestaoCard>
      )}

      {tab === "nfce" && (
        <GestaoCard className="mt-4 space-y-5">
          <GestaoSectionTitle
            title="NFC-e (modelo 65)"
            description="Use o seletor Homologacao / Producao no topo da pagina fiscal para trocar o ambiente SEFAZ."
          />
          <GestaoAlert tone="info">
            <p className="text-sm text-muted-foreground">
              Emissao 100% direta na SEFAZ (sem Webmania). Regime tributario padrao: Simples Nacional
              (CRT 1) — ajuste na aba Empresa se necessario. O CSC pode ser diferente entre
              homologacao e producao no portal da SEFAZ PE.
            </p>
          </GestaoAlert>
          <div className="flex items-center justify-between rounded-xl border border-[color:var(--honey-line)] p-4">
            <div>
              <Label className="font-medium">Habilitar NFC-e</Label>
              <p className="text-xs text-muted-foreground">Permite emitir notas de consumidor</p>
            </div>
            <Switch
              checked={configForm.nfceHabilitada}
              onCheckedChange={(checked) =>
                setConfigForm((c) => ({ ...c, nfceHabilitada: checked }))
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <GestaoField label="Serie NFC-e">
              <GestaoInput
                type="number"
                min={1}
                value={configForm.serieNfce}
                onChange={(e) =>
                  setConfigForm((c) => ({ ...c, serieNfce: Number(e.target.value) || 1 }))
                }
              />
            </GestaoField>
            <GestaoField label="Proximo numero">
              <GestaoInput
                type="number"
                min={1}
                value={configForm.proximoNumeroNfce}
                onChange={(e) =>
                  setConfigForm((c) => ({
                    ...c,
                    proximoNumeroNfce: Number(e.target.value) || 1,
                  }))
                }
              />
            </GestaoField>
            <GestaoField label="CSC ID (SEFAZ)">
              <GestaoInput
                value={configForm.cscId}
                onChange={(e) => setConfigForm((c) => ({ ...c, cscId: e.target.value }))}
                placeholder="000001"
              />
            </GestaoField>
            <GestaoField label="CSC Token" className="sm:col-span-2">
              <GestaoInput
                type="password"
                value={cscToken}
                onChange={(e) => setCscToken(e.target.value)}
                placeholder={
                  data.config.cscTokenConfigured
                    ? "•••••••• (deixe vazio para manter)"
                    : "Token do portal SEFAZ"
                }
              />
            </GestaoField>
          </div>
          <div className="space-y-3 rounded-xl border border-[color:var(--honey-line)] p-4">
            <p className="text-sm font-medium">Emissao automatica</p>
            {(
              [
                ["emitirAutomaticoPdv", "PDV / Balcao"],
                ["emitirAutomaticoDelivery", "Delivery"],
                ["emitirAutomaticoMesas", "Mesas"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Switch
                  checked={configForm[key]}
                  onCheckedChange={(checked) => setConfigForm((c) => ({ ...c, [key]: checked }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <GestaoButton
              onClick={() => saveConfigMutation.mutate()}
              disabled={saveConfigMutation.isPending}
            >
              {saveConfigMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Salvar NFC-e
            </GestaoButton>
            {configForm.ambiente === "homologacao" && readiness.sefazDireto && (
              <GestaoButton
                variant="secondary"
                onClick={() => testHomologMutation.mutate()}
                disabled={testHomologMutation.isPending}
              >
                {testHomologMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Testar emissao SEFAZ
              </GestaoButton>
            )}
          </div>
        </GestaoCard>
      )}

      {tab === "certificado" && (
        <GestaoCard className="mt-4 space-y-4">
          <GestaoSectionTitle
            title="Certificado digital A1"
            description="Arquivo .pfx criptografado com AES-256-GCM (ENCRYPTION_KEY). A senha nunca e armazenada em texto puro."
          />
          {cert.instalado ? (
            <GestaoAlert tone="info">
              <p className="font-medium">{cert.titular}</p>
              <p className="text-sm text-muted-foreground mt-1">
                CNPJ: {cert.cnpj ?? "—"} · Valido ate:{" "}
                {cert.validoAte ? new Date(cert.validoAte).toLocaleDateString("pt-BR") : "—"}
                {cert.diasRestantes != null && cert.diasRestantes <= 30 && (
                  <span className="text-amber-700">
                    {" "}
                    · Renove em breve ({cert.diasRestantes} dias)
                  </span>
                )}
              </p>
            </GestaoAlert>
          ) : (
            <GestaoAlert tone="warning">
              Nenhum certificado instalado. Envie o arquivo .pfx da sua contabilidade ou
              certificadora.
            </GestaoAlert>
          )}
          <GestaoField label="Certificado A1 (.pfx / .p12)">
            <input
              ref={fileRef}
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              className="sr-only"
              onChange={(e) => void handleCertFileSelect(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <GestaoButton
                type="button"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
              >
                <FolderOpen className="size-4" />
                Selecionar certificado
              </GestaoButton>
              <p className="text-sm text-muted-foreground">
                {selectedCertFile
                  ? `Arquivo: ${selectedCertFile.name}`
                  : "Nenhum arquivo selecionado"}
              </p>
            </div>
          </GestaoField>
          <GestaoField label="Senha do certificado">
            <GestaoInput
              type="password"
              value={certPassword}
              onChange={(e) => setCertPassword(e.target.value)}
              placeholder="Senha definida na emissao do certificado"
            />
          </GestaoField>
          <p className="text-xs text-muted-foreground">
            Ambiente SEFAZ (homologacao ou producao): use o seletor no topo da area Fiscal.
          </p>
          <div className="flex flex-wrap gap-2">
            <GestaoButton
              onClick={() => void handleInstallCertificate()}
              disabled={uploadCertMutation.isPending || !selectedCertFile}
            >
              {uploadCertMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Instalar certificado
            </GestaoButton>
            {cert.instalado && (
              <GestaoButton
                variant="secondary"
                onClick={() => removeCertMutation.mutate()}
                disabled={removeCertMutation.isPending}
              >
                {removeCertMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Remover
              </GestaoButton>
            )}
          </div>
        </GestaoCard>
      )}
    </GestaoPage>
  );
}
