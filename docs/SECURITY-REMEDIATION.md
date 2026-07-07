# Plano de remediação de segurança — NorFood

Documento de contexto para correções identificadas na auditoria de rotas/RPC expostos ao client (`createServerFn`, `/api/*`, payloads sensíveis).

**Última atualização:** 2026-07-06

## Resumo executivo

O app expõe ~200 RPC via TanStack Start e 9 rotas HTTP. A maior parte do painel usa `requireSupabaseAuth` + `resolveStaffTenantId`, mas há falhas graves em **fiscal**, **pedidos cross-tenant**, **taxa de entrega sem tenant** e **enumeração de contas** no auth de clientes.

## Prioridades

| Prioridade | Prazo | Foco |
|------------|-------|------|
| **P0** | Imediato | Isolamento fiscal, pedidos, delivery fee, auth cliente |
| **P1** | Curto prazo | Atendimento/WABA por tenant, MP panel, integrações, PII pública |
| **P2** | Endurecimento | Rate limits amplos, demo admin, relatórios por role, tokens mesa |

---

## P0 — Imediato (em implementação)

### P0.1 Fiscal multitenancy

**Problema:** `empresa_fiscal`, `fiscal_config` e `notas_fiscais` usavam registro global `id = 'default'`. Qualquer staff via RPC fiscal acessava certificado, CSC e notas de todos os tenants.

**Correção:**
- Migration `20260706230000_fiscal_tenant_scope.sql`: `tenant_id` nas 3 tabelas + backfill de notas via `pedidos`.
- `fiscal-store.server.ts`: todas as operações exigem `tenantId`.
- `fiscal.functions.ts`: `tenantSlug` + `resolveStaffTenantId` em todas as RPC.
- `fiscal.server.ts`: emissão/consulta/cancelamento escopados ao tenant do pedido.
- UI fiscal: `useTenantSlug()` nas queries e mutations.

**Arquivos:** `supabase/migrations/20260706230000_fiscal_tenant_scope.sql`, `src/lib/api/fiscal/*`, `src/routes/_authenticated/painel.fiscal*.tsx`, `src/components/fiscal/*`

### P0.2 Pedidos — isolamento de itens por tenant

**Problema:** `validateAndPriceOrderItems` sem `tenantId` permitia misturar `produto_id` de outro restaurante em delivery/balcão/mesas/omnichannel.

**Correção:**
- Passar `tenantId` em todas as chamadas a `validateAndPriceOrderItems`.
- Filtrar `produto_variacoes`, `produto_adicionais` e `produto_promocoes` por tenant quando `tenantId` informado.
- Remover validação frágil “só primeiro produto” no balcão.

**Arquivos:** `src/lib/api/pedidos/order-validation.server.ts`, `orders.functions.ts`, `balcao.functions.ts`, `mesas.functions.ts`, `omnichannel-order.functions.ts`, `mesa-order.functions.ts`

### P0.3 Taxa de entrega (`getDeliveryFeeServer`)

**Problema:** RPC pública sem `tenantSlug`; `resolveDeliveryFeeFromDb` retornava primeiro bairro global.

**Correção:** Exigir `tenantSlug` no validator; resolver `tenantId` e passar para `resolveDeliveryFeeFromDb`.

**Arquivos:** `src/lib/api/delivery/delivery-pricing.functions.ts`

### P0.4 Auth cliente — anti-enumeração

**Problema:** `resolveCustomerEmailByIdentifier` e `generateCustomerPasswordRecoveryCode` expunham e-mail e permitiam enumeração sem rate limit.

**Correção:**
- `auth-rate-limit.server.ts` com limite por IP/ação.
- `signInCustomerServer`: login por identificador+senha no servidor (e-mail não volta ao client).
- `startCustomerPasswordResetServer` / `verifyCustomerPasswordResetOtpServer`: fluxo de recovery sem vazar e-mail.
- Respostas genéricas; rate limit em cadastro e recovery.

**Arquivos:** `src/lib/signup/auth-rate-limit.server.ts`, `src/lib/api/auth/customer-auth.functions.ts`, `src/lib/auth/customer-auth.ts`

---

## P1 — Curto prazo

### P1.1 Atendimento / WhatsApp / WABA

- Adicionar `tenantSlug` em todas as RPC de `atendimento.functions.ts` e `whatsapp.functions.ts`.
- Isolar inbox, tokens Meta e automações por tenant no provider.

### P1.2 Mercado Pago panel

- `fetchMercadoPagoPanelServer` hoje retorna saldo/movimentações da conta **global** da plataforma para qualquer staff.
- Escopar por tenant (OAuth por loja) ou restringir a `owner`/`financeiro`.

### P1.3 `getIntegrationStatus`

- Não retornar `gatewayUrl`, `webhookUrl`, `apiUrl` internos para staff comum.
- Restringir a `owner`/`admin` do tenant ou remover URLs do payload.

### P1.4 `fetchTenantBySlugServer`

- Trocar `select("*")` por campos públicos (nome, slug, cores, logo).
- Não expor `document_number`, `legal_name`, endereço completo sem auth.

### P1.5 Pedido mesa QR

- Tokens imprevisíveis (UUID), não `{slug}-mesa-{n}`.
- Rate limit em `createMesaQrOrder`.

---

## P2 — Endurecimento

| Item | Ação |
|------|------|
| `validateCouponServer` | Rate limit; validar subtotal server-side com carrinho |
| `/api/health` | Remover `maxTenants` ou exigir auth interna |
| `/api/mercado-pago/webhook` GET | Remover `getWebhookAuthorizationSummary` público |
| Cron dev | Exigir `CRON_SECRET` sempre |
| `getGreeting` (example) | Remover ou proteger em produção |
| Relatórios | Checar role `financeiro` / `gerente` |
| Demo admin bypass | Desabilitar `isServerDemoAdminMode` em hosts públicos |
| Colaboradores | `tenantId` do slug resolvido, não do payload client |
| Roles legados `user_roles` | Auditar bypass global `admin`/`gerente` |

---

## Mapa de superfície (referência)

### Rotas HTTP públicas

| Rota | Risco |
|------|-------|
| `/api/health` | Metadados de capacidade |
| `/api/signup-client-meta` | IP do cliente |
| `/api/entregador/expo-go-url` | URL Metro (dev) |
| `/api/mercado-pago/webhook` GET | Config MP |
| Webhooks POST | OK com assinatura |
| `/api/cron/*` | OK com secret (atenção em dev) |

### RPC públicas (sem auth)

`fetchTenantBySlugServer`, `fetchTenantSettingsServer`, `fetchCatalogExtrasServer`, `fetchOperationalStatusServer`, `fetchBairrosPublicServer`, `getDeliveryFeeServer` (após P0 exige slug), `validateCouponServer`, `createMesaQrOrder`, `createCustomerAccount`, `suggestRestaurantSlugServer`, `getTenantAccessStatusServer`, `resolveActivationTokenServer`

### Módulos sensíveis

| Módulo | Auth atual | Isolamento tenant |
|--------|------------|-------------------|
| Platform admin | `requirePlatformAdmin` | N/A (global) |
| Reseller | `requireResellerStaff` | Por reseller |
| Painel pedidos/KDS | Staff + slug | OK (pós-P0) |
| Fiscal | Staff | **P0** |
| Financeiro MP | Staff | **P1** |
| Atendimento | Staff | **P1** |
| Colaboradores | Manager | Parcial |
| Relatórios | Staff | Por slug |

---

## Checklist de validação pós-P0

- [x] Código: staff do tenant A não lista notas/config fiscal do tenant B (exige migration + tenantSlug nas RPC)
- [x] Código: pedido com `produto_id` de outro tenant falha (`tenantId` em `validateAndPriceOrderItems`)
- [x] Código: `getDeliveryFeeServer` exige `tenantSlug`
- [x] Código: recovery de senha não retorna e-mail completo
- [x] Código: login por telefone não expõe e-mail na rede (`signInCustomerServer`)
- [ ] Rate limit bloqueia brute force de recovery (teste manual em staging)
- [ ] Migration `20260706230000_fiscal_tenant_scope.sql` aplicada no Supabase de produção

## Referências

- [ARCHITECTURE.md](./ARCHITECTURE.md) — camadas e domínios
- Auditoria original: conversa de segurança 2026-07-06

**Status P0 (código):** implementado em 2026-07-06. Aplicar migration fiscal no Supabase antes de deploy.
