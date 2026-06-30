# E-mails Norfood no Resend

## Endereços

| Uso | Variável | Padrão |
|-----|----------|--------|
| Cadastro / aprovação | `PLATFORM_EMAIL_FROM` | `Norfood <cadastro@norfood.com.br>` |
| Contato / suporte | `PLATFORM_EMAIL_CONTACT_FROM` | `Norfood <contato@norfood.com.br>` |

No Resend **não se cria cada e-mail à mão**: basta o domínio (ou subdomínio) estar verificado. Depois disso, qualquer prefixo funciona (`contato@`, `cadastro@`, `suporte@`, etc.).

## Domínio atual

O domínio `norfood.com.br` já está verificado. Teste de envio com `contato@norfood.com.br` funcionou em produção.

## Adicionar subdomínio `contato.norfood.com.br` (opcional)

Recomendado se quiser separar reputação de envio (ex.: `contato@contato.norfood.com.br`).

A API key de produção é **somente envio** — cadastro de domínio é pelo painel:

1. Acesse [resend.com/domains](https://resend.com/domains)
2. **Add Domain** → `contato.norfood.com.br`
3. Região: **South America (São Paulo)** (`sa-east-1`)
4. Copie os registros DNS (SPF, DKIM, MX em `send.contato.norfood.com.br`)
5. No DNS de `norfood.com.br` (Registro.br, Cloudflare, etc.), adicione os registros
6. No Resend, clique **Verify**
7. No servidor (`deploy/.env`):

```env
PLATFORM_EMAIL_CONTACT_FROM=Norfood <contato@contato.norfood.com.br>
```

8. Reinicie o app: `docker compose up -d norfood`

## Testar envio

Na VPS:

```bash
bash /tmp/resend-domains-remote.sh /opt/norfood/deploy/.env send-test \
  "Norfood <contato@norfood.com.br>" seu@email.com
```

## Scripts

- `node scripts/resend-domains.mjs list` — lista domínios (requer API key com permissão completa)
- `node scripts/resend-approval-email.mjs dolcina-pipocaria` — reenvia e-mail de aprovação
