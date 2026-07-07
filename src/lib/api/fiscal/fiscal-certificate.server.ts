import forge from "node-forge";
import { decrypt, encrypt } from "@/lib/waba/encryption";
import { formatCnpj, isValidCnpj, onlyDigits } from "@/lib/fiscal/fiscal-validation";

const ICP_BRASIL_CNPJ_OID = "2.16.76.1.3.3";
const SUBJECT_ALT_NAME_OID = "2.5.29.17";

type ForgeCert = {
  subject: {
    attributes: Array<{ shortName?: string; name?: string; value?: string | string[] }>;
    getField: (name: string) => { value?: string } | null;
  };
  validity: { notAfter: Date };
  extensions?: Array<{
    id?: string;
    name?: string;
    ca?: boolean;
    altNames?: Array<{
      type: number;
      value?: unknown;
    }>;
  }>;
};

export type ParsedCertificate = {
  titular: string;
  /** CNPJ principal do titular (ICP-Brasil). */
  cnpj: string | null;
  /** Todos os CNPJs identificados no certificado do titular. */
  cnpjs: string[];
  validoAte: Date;
  resolvedPassword: string;
};

function assertEncryptionKey() {
  if (!process.env.ENCRYPTION_KEY?.trim()) {
    throw new Error(
      "ENCRYPTION_KEY nao configurada no servidor. Necessaria para armazenar o certificado com seguranca.",
    );
  }
}

export function encryptSecret(value: string) {
  assertEncryptionKey();
  return encrypt(value);
}

export function decryptSecret(encrypted: string) {
  assertEncryptionKey();
  return decrypt(encrypted);
}

export function encryptCertificatePfx(buffer: Buffer) {
  return encryptSecret(buffer.toString("base64"));
}

export function decryptCertificatePfx(encrypted: string) {
  return Buffer.from(decryptSecret(encrypted), "base64");
}

function passwordCandidates(password: string) {
  const candidates = [password];
  const trimmed = password.trim();
  if (trimmed && trimmed !== password) candidates.push(trimmed);
  return [...new Set(candidates)];
}

function readOtherNameValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readOtherNameValue(item);
      if (nested) return nested;
    }
    return "";
  }
  if (typeof value === "object") {
    const record = value as { value?: unknown };
    if (record.value != null) return readOtherNameValue(record.value);
  }
  return String(value);
}

function extractIcpBrasilCnpjFromSan(cert: ForgeCert): string | null {
  const sanExt = cert.extensions?.find(
    (ext) => ext.id === SUBJECT_ALT_NAME_OID || ext.name === "subjectAltName",
  );
  if (!sanExt?.altNames?.length) return null;

  for (const alt of sanExt.altNames) {
    if (alt.type !== 0 || !alt.value) continue;

    try {
      const parts = alt.value as Array<{ type?: number; value?: unknown }>;
      const oidPart = parts[0];
      if (!oidPart || oidPart.type !== 6 || oidPart.value == null) continue;

      const oid = forge.asn1.derToOid(oidPart.value as string);
      if (oid !== ICP_BRASIL_CNPJ_OID) continue;

      const raw = readOtherNameValue(parts[1]);
      const digits = onlyDigits(raw).slice(0, 14);
      if (digits.length === 14 && isValidCnpj(digits)) return digits;
    } catch {
      // tenta proximo otherName
    }
  }

  return null;
}

function extractCnpjFromSerialNumber(cert: ForgeCert): string | null {
  const serialNumber = cert.subject.getField("serialNumber");
  if (!serialNumber?.value) return null;

  const text = String(serialNumber.value).toUpperCase();
  if (!text.includes("CNPJ")) return null;

  const digits = onlyDigits(text).slice(0, 14);
  if (digits.length === 14 && isValidCnpj(digits)) return digits;
  return null;
}

function extractCnpjsFromCert(cert: ForgeCert): string[] {
  const found = new Set<string>();

  const fromSan = extractIcpBrasilCnpjFromSan(cert);
  if (fromSan) found.add(fromSan);

  const fromSerial = extractCnpjFromSerialNumber(cert);
  if (fromSerial) found.add(fromSerial);

  return [...found];
}

function isCaCertificate(cert: ForgeCert) {
  const basic = cert.extensions?.find(
    (ext) => ext.id === "2.5.29.19" || ext.name === "basicConstraints",
  );
  return Boolean(basic?.ca);
}

function listCertificates(p12: ReturnType<typeof forge.pkcs12.pkcs12FromAsn1>) {
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  return (certBags[forge.pki.oids.certBag] ?? [])
    .map((bag) => bag.cert as ForgeCert | undefined)
    .filter((cert): cert is ForgeCert => Boolean(cert));
}

function pickEndEntityCertificate(certs: ForgeCert[]) {
  if (certs.length === 0) return null;

  const nonCa = certs.filter((cert) => !isCaCertificate(cert));
  const pool = nonCa.length > 0 ? nonCa : certs;

  for (const cert of pool) {
    if (extractIcpBrasilCnpjFromSan(cert)) return cert;
  }

  for (const cert of pool) {
    if (extractCnpjFromSerialNumber(cert)) return cert;
  }

  return pool[0] ?? certs[certs.length - 1] ?? null;
}

function extractPrivateKeyFromP12(p12: ReturnType<typeof forge.pkcs12.pkcs12FromAsn1>) {
  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const fromShrouded = shrouded[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
  if (fromShrouded) return fromShrouded;

  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag });
  return plain[forge.pki.oids.keyBag]?.[0]?.key ?? null;
}

function openPkcs12(pfxBuffer: Buffer, password: string) {
  let asn1: ReturnType<typeof forge.asn1.fromDer>;
  try {
    asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  } catch {
    throw new Error("Arquivo .pfx invalido ou corrompido.");
  }

  for (const candidate of passwordCandidates(password)) {
    try {
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, candidate);
      const privateKey = extractPrivateKeyFromP12(p12);
      if (!privateKey) continue;

      const cert = pickEndEntityCertificate(listCertificates(p12));
      if (!cert) continue;

      return { cert, privateKey, resolvedPassword: candidate };
    } catch {
      // tenta proxima variante de senha
    }
  }

  throw new Error(
    "Senha do certificado incorreta. Confira maiusculas/minusculas e evite espacos no inicio ou fim.",
  );
}

export type SefazCertificateData = {
  pfx: Buffer;
  password: string;
  notAfter: Date;
  privateKey: string;
  certPem: string;
};

/** Carrega PFX com node-forge (sem openssl CLI — necessario na Vercel). */
export function loadCertificateDataForSefaz(
  pfxBuffer: Buffer,
  password: string,
): SefazCertificateData {
  const { cert, privateKey, resolvedPassword } = openPkcs12(pfxBuffer, password);
  const notAfter = cert.validity.notAfter;
  if (notAfter < new Date()) {
    throw new Error(`Certificado expirado em ${notAfter.toISOString()}`);
  }

  return {
    pfx: pfxBuffer,
    password: resolvedPassword,
    notAfter,
    privateKey: forge.pki.privateKeyToPem(privateKey),
    certPem: forge.pki.certificateToPem(cert as forge.pki.Certificate),
  };
}

export function parsePfxCertificate(pfxBuffer: Buffer, password: string): ParsedCertificate {
  const { cert, resolvedPassword } = openPkcs12(pfxBuffer, password);
  const cnpjs = extractCnpjsFromCert(cert);

  const subject = cert.subject.attributes
    .map((attr) => {
      const shortName = attr.shortName ?? attr.name ?? "";
      const value = Array.isArray(attr.value) ? attr.value.join("") : String(attr.value ?? "");
      return `${shortName}=${value}`;
    })
    .join(", ");

  const cnAttr = cert.subject.getField("CN");
  const titular = cnAttr?.value ? String(cnAttr.value) : subject || "Certificado A1";

  return {
    titular,
    cnpj: cnpjs[0] ?? null,
    cnpjs,
    validoAte: cert.validity.notAfter,
    resolvedPassword,
  };
}

export function validateCertificateMatchesCnpj(parsed: ParsedCertificate, empresaCnpj: string) {
  const empresaDigits = onlyDigits(empresaCnpj);
  if (!empresaDigits) return;
  if (parsed.cnpjs.length === 0) return;

  if (parsed.cnpjs.includes(empresaDigits)) return;

  const certList = parsed.cnpjs.map((cnpj) => formatCnpj(cnpj)).join(", ");
  throw new Error(
    `O CNPJ da empresa (${formatCnpj(empresaDigits)}) nao consta no certificado (${certList}). Confira o CNPJ na aba Empresa.`,
  );
}
