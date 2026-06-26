import { lookupCnpjPublic } from "../src/lib/api/cnpj-lookup.server.ts";

const cnpj = (process.argv[2] ?? "19131243000197").replace(/\D/g, "");

const result = await lookupCnpjPublic(cnpj);
console.log(
  JSON.stringify(
    {
      fonte: result.fonte,
      situacao: result.situacaoCadastral,
      empresa: {
        cnpj: result.empresa.cnpj,
        razaoSocial: result.empresa.razaoSocial,
        municipio: result.empresa.municipio,
        uf: result.empresa.uf,
        codigoMunicipioIbge: result.empresa.codigoMunicipioIbge,
        cnae: result.empresa.cnae,
      },
    },
    null,
    2,
  ),
);
