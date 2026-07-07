import {
  loadCertificateDataForSefaz,
  type SefazCertificateData,
} from "@/lib/api/fiscal/fiscal-certificate.server";

/** Provedor A1 sem openssl CLI — usa node-forge (compativel com Vercel/serverless). */
export class ForgeA1CertificateProvider {
  constructor(
    private readonly pfx: Buffer,
    private readonly password: string,
  ) {}

  async load(): Promise<SefazCertificateData> {
    try {
      return loadCertificateDataForSefaz(this.pfx, this.password);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Falha ao carregar certificado A1: ${message}`, {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
}
