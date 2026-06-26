import type { EmpresaFiscal, FiscalConfigPublic } from "@/lib/fiscal/fiscal-types";

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatCep(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function calcCnpjCheckDigit(base: string, weights: number[]) {
  const sum = base.split("").reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const base12 = cnpj.slice(0, 12);
  const d1 = calcCnpjCheckDigit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcCnpjCheckDigit(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj === base12 + String(d1) + String(d2);
}

export function isValidNcm(value: string) {
  const ncm = onlyDigits(value);
  return ncm.length === 8;
}

export function isValidCfop(value: string) {
  return /^\d{4}$/.test(value.trim());
}

export function validateEmpresaFiscal(empresa: EmpresaFiscal) {
  const errors: string[] = [];
  if (!isValidCnpj(empresa.cnpj)) errors.push("CNPJ invalido.");
  if (!empresa.razaoSocial.trim()) errors.push("Razao social obrigatoria.");
  if (!empresa.inscricaoEstadual.trim()) errors.push("Inscricao estadual obrigatoria.");
  if (!empresa.logradouro.trim()) errors.push("Logradouro obrigatorio.");
  if (!empresa.numero.trim()) errors.push("Numero obrigatorio.");
  if (!empresa.bairro.trim()) errors.push("Bairro obrigatorio.");
  if (!/^\d{7}$/.test(onlyDigits(empresa.codigoMunicipioIbge)))
    errors.push("Codigo IBGE do municipio deve ter 7 digitos.");
  if (!empresa.municipio.trim()) errors.push("Municipio obrigatorio.");
  if (!/^[A-Z]{2}$/.test(empresa.uf.trim().toUpperCase())) errors.push("UF invalida.");
  if (onlyDigits(empresa.cep).length !== 8) errors.push("CEP invalido.");
  if (!empresa.email.trim()) errors.push("E-mail obrigatorio.");
  return errors;
}

export function assessFiscalReadiness(input: {
  empresa: EmpresaFiscal;
  config: FiscalConfigPublic;
  encryptionKeyConfigured: boolean;
}) {
  const empresaErrors = validateEmpresaFiscal(input.empresa);
  const camposPendentes = [...empresaErrors];

  const certificadoValido =
    input.config.certificado.instalado &&
    (!input.config.certificado.validoAte ||
      new Date(input.config.certificado.validoAte).getTime() > Date.now());

  if (!certificadoValido) camposPendentes.push("Certificado digital A1 (.pfx) valido.");
  if (!input.config.cscTokenConfigured || !input.config.cscId.trim()) {
    camposPendentes.push("CSC (ID + token) da SEFAZ para NFC-e.");
  }
  if (!input.encryptionKeyConfigured) {
    camposPendentes.push("ENCRYPTION_KEY no servidor para criptografar certificado.");
  }

  const sefazDireto =
    certificadoValido &&
    input.config.cscTokenConfigured &&
    Boolean(input.config.cscId.trim()) &&
    input.encryptionKeyConfigured;

  return {
    empresaCompleta: empresaErrors.length === 0,
    certificadoValido,
    cscConfigurado: Boolean(input.config.cscTokenConfigured && input.config.cscId.trim()),
    sefazDireto,
    encryptionKey: input.encryptionKeyConfigured,
    camposPendentes,
  };
}
