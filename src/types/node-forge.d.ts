declare module "node-forge" {
  const forge: {
    asn1: {
      fromDer: (bytes: string) => unknown;
      derToOid: (bytes: string) => string;
    };
    pkcs12: {
      pkcs12FromAsn1: (asn1: unknown, password: string) => {
        getBags: (filter: { bagType: string }) => Record<
          string,
          Array<{ cert?: Cert; key?: unknown }> | undefined
        >;
      };
    };
    pki: {
      oids: { certBag: string; pkcs8ShroudedKeyBag: string; keyBag: string };
    };
  };
  export default forge;
}

type Cert = {
  subject: {
    attributes: Array<{ shortName?: string; name?: string; value?: string | string[] }>;
    getField: (name: string) => { value?: string } | null;
  };
  validity: { notAfter: Date };
};
