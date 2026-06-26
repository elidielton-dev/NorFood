# Atendimento — WhatsApp Meta API

Módulo integrado ao painel Abelha & Mel (seção **Atendimento** no menu).

## Rotas

| Menu | URL |
|------|-----|
| Conversas | `/painel/atendimento/conversas` |
| Contatos | `/painel/atendimento/contatos` |
| Automações | `/painel/atendimento/automacoes` |
| Configurações | `/painel/atendimento/configuracoes` |

## Banco de dados

Aplique a migration `supabase/migrations/20260618000000_meta_atendimento.sql` no projeto Supabase.

Tabelas `waba_*` — separadas do inbox Evolution (`whatsapp_chats`).

## Variáveis de ambiente

```env
ENCRYPTION_KEY=<64 hex chars>
META_APP_SECRET=<Meta App Secret>
```

Opcional: `WABA_WEBHOOK_URL` para documentação.

## Webhook Meta

URL de produção: `https://abelhaemel.vercel.app/api/waba/webhook`

1. Meta for Developers → seu app → WhatsApp → Configuration
2. Callback URL: URL acima
3. Verify Token: mesmo valor salvo em Atendimento → Configurações
4. Assine o campo `messages`

## Configuração no painel

1. **Atendimento → Configurações**
2. Phone Number ID, Access Token, Verify Token
3. PIN 2FA (primeira vez)
4. Salvar — testa conexão com a Meta

O inbox Evolution em `/painel/whatsapp` redireciona para **Conversas**.
