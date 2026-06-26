# Relatório de Validação WhatsApp — Abelha & Mel

**Data:** 2026-06-17  
**Commit base:** 205190f → correções desta missão (pendente deploy)

## Resumo executivo

| Script | Checks OK | Falhas | Avisos |
|--------|-----------|--------|--------|
| `validate:whatsapp:full` | 26/27 | 0 | 1 |
| `validate:whatsapp:e2e` (pré-fix deploy) | 7/13 | 1 | 5 |
| `npm run build` | OK | — | — |

O script `validate:whatsapp:full` **passa** mas **não detecta** os bugs reportados no painel. O novo `validate:whatsapp:e2e` expôs problemas reais de dados e identidade.

---

## Gaps do `validate:whatsapp:full`

| Gap | Impacto |
|-----|---------|
| Testa só 1 contato (Maykon) | Não detecta envio cruzado A→B |
| Não testa `@lid` / `remoteJidAlt` | Nataly e similares passam despercebidos |
| Não chama server functions autenticadas | Merge silencioso de chatId invisível |
| Não audita poluição Supabase | 499+ chats fantasma na aba Conversas |
| Não verifica duplicatas/homonimos | Threads duplicados por nome |
| Não valida filtro estrito 7 dias | Conversas antigas/importadas aparecem |

---

## Resultados E2E — Evolution (identidade)

| Contato | JID aberto | Telefone resolvido | Status |
|---------|------------|-------------------|--------|
| Maykon (A) | `558781541408@s.whatsapp.net` | `558781541408` (direct) | OK |
| Nataly (B) | `204728323547223@lid` | **sem `remoteJidAlt` nas mensagens** | WARN → fallback `sendViaLid` |
| C (558781541408) | `558781541408@s.whatsapp.net` | `558781541408` (direct) | OK |

**Evidência Nataly:** Evolution retorna contato `@lid` mas `findMessages` não traz `key.remoteJidAlt` com `@s.whatsapp.net`. Envio deve usar `@lid` até haver mensagem inbound com alt JID.

---

## Resultados E2E — Supabase (hygiene)

| Cenário | Resultado pré-fix | Root cause |
|---------|-------------------|------------|
| Conversas com `last_message_at` mas sem texto | **499 chats** | Import/sync gravou timestamp sem mensagem |
| Agenda-only com `first_contact_at` recente | **680 contatos** | `agendaImport` setava `first_contact_at=now()` |
| `@lid` sem phone salvo | **200/200** | Resolução não persistia phone in-place |
| Sync mantendo chats antigos via `updated_at` | 0 | OK |
| Duplicatas por telefone | 0 | OK |
| Homonimos (mesmo nome, JIDs diferentes) | milena, gabriel, etc. | Merge por nome exato (removido) |

---

## Root causes confirmadas

### 1. Envio/resposta na conversa errada
- **Causa:** `resolveCustomerIdentity` para `@lid` usava `findContactByNameExact` → homônimos redirecionavam para outro telefone.
- **Causa:** `resolveCanonicalChatId` fazia `consolidateChatsIntoTarget` ao abrir mensagens → UI trocava `chatId`.
- **Causa:** `ensureChatReadyForSend` fazia merge destrutivo durante envio.
- **Fix:** `resolveRealPhoneJid()` unificado; sem merge em read/send; UI não auto-troca chat.

### 2. Número real não usado
- **Causa:** `resolveEvolutionSendTarget` enviava direto para `@lid` sem tentar `remoteJidAlt`.
- **Fix:** Prioridade: `remoteJidAlt` (Evolution messages) → phone em mensagens Supabase → phone salvo → `sendViaLid`.

### 3. Conversas antigas/poluídas
- **Causa:** Query `OR(last_message_at, first_contact_at)` incluía agenda importada.
- **Causa:** `chatWithinRetention` usava `updated_at`.
- **Causa:** `agendaImport` setava `first_contact_at=now()`.
- **Fix:** Conversas = `last_message_at >= 7d AND last_message NOT NULL`; cleanup de poluição no sync full.

---

## Correções implementadas

| Arquivo | Mudança |
|---------|---------|
| `whatsapp-identity.server.ts` | `resolveRealPhoneJid()`; @lid sem match por nome |
| `whatsapp-evolution.server.ts` | Resolve phone antes de `sendViaLid`; logs estruturados |
| `whatsapp.server.ts` | Send sem merge; sync @lid via `resolveRealPhoneJid` |
| `whatsapp-store.server.ts` | Filtro conversas estrito; retention; dedupe por phone; cleanup poluição |
| `whatsapp-inbox.tsx` | Sem auto-switch chatId; header com JID; send captura chatId |
| `validate-whatsapp-e2e.mjs` | Novo script de validação |
| `package.json` | `validate:whatsapp:e2e` |

---

## Critérios de aceite

| Critério | Status |
|----------|--------|
| Zero envio cruzado (≥2 contatos) | Fix código OK — testar pós-deploy |
| Telefone real da Evolution quando disponível | OK Maykon; Nataly = sendViaLid (sem alt JID na API) |
| Conversas sem threads antigas/vazias | Fix filtro + cleanup — rodar **Atualizar** no painel |
| Histórico 7 dias | OK |
| Script E2E detecta bugs | OK (falhou 1 check pré-cleanup) |
| Build OK | OK |

---

## Teste manual pós-deploy

1. **Maykon** → enviar "teste maykon" → chegar em `558781541408`
2. **Nataly** → enviar "teste nataly" → chegar nela (via `@lid` se sem alt JID)
3. Digitar em A, trocar para B, enviar → B recebe; rascunho A preservado
4. Aba **Conversas** → só threads com mensagem nos últimos 7 dias
5. Clicar **Atualizar** → cleanup remove poluição Supabase
6. Rodar: `npm run validate:whatsapp:full && npm run validate:whatsapp:e2e`

---

## Comandos

```bash
npm run validate:whatsapp:full
npm run validate:whatsapp:e2e
npm run build
```

Variáveis opcionais E2E:
- `WHATSAPP_TEST_CONTACT_A=maykon`
- `WHATSAPP_TEST_CONTACT_B=nataly`
- `WHATSAPP_TEST_CONTACT_C=558781541408`
- `SKIP_SEND=1` (desliga envio real)
