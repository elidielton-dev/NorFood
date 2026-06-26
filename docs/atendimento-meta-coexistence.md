# Coexistence — Celular + Painel Abelha (Meta API)

Permite usar o **WhatsApp Business no celular** da loja e, ao mesmo tempo, receber/enviar **mensagens novas** no painel Abelha via Cloud API.

## Pré-requisitos

- WhatsApp **Business** no celular (versão **2.24.17+**)
- Número real da loja (não sandbox de teste)
- Meta Business verificado
- App Meta com webhook em `https://abelhaemel.vercel.app/api/waba/webhook`
- Migration `20260620120000_waba_coexistence.sql` aplicada no Supabase

## Passo a passo — Abelha & Mel

### 1. Meta for Developers

1. Abra o app Meta (ID `1478691093569068`)
2. WhatsApp → **API Setup** ou fluxo **Conectar seu app WhatsApp Business existente**
3. Escolha **conectar conta existente do WhatsApp Business** (Coexistence)
4. Escaneie o QR Code **no celular da loja** (mantenha o app instalado)

### 2. Webhook (campos extras)

No terminal, na pasta do projeto:

```bash
WABA_WEBHOOK_FIELDS=messages,history,smb_app_state_sync,smb_message_echoes node scripts/configure-waba-webhook.mjs
```

Campos necessários:

| Campo | Função |
|-------|--------|
| `messages` | Cliente → painel |
| `smb_message_echoes` | Celular da loja → painel |
| `smb_app_state_sync` | Contatos do app |
| `history` | Histórico (opcional, uma vez) |

### 3. Painel Abelha

1. **Atendimento → Configurações**
2. Marque **Ativar modo Coexistence**
3. Cole **Access Token** (System User com WABA)
4. **Não preencha PIN** em modo Coexistence
5. **Salvar** — o sistema inscreve webhooks e inicia sync
6. Clique **Sincronizar contatos e histórico** (dentro de 24h após vínculo Meta)

### 4. Verificar

- Status deve mostrar: `is_on_biz_app: true` e `platform_type: CLOUD_API`
- Envie mensagem **do celular** → aparece no painel (echo)
- Cliente responde → aparece no celular e no painel

## O que NÃO fazer

- **Não** chamar `/register` com PIN depois do Coexistence (desconecta o celular)
- **Não** desinstalar o WhatsApp Business do celular
- Abrir o app no celular pelo menos a cada **14 dias** (evita desconexão por inatividade)

## Histórico antigo

- Só importa se o usuário **aceitar compartilhar** no fluxo Meta
- Sync de histórico só pode ser feito **uma vez** por vínculo
- Mensagens **novas** após o vínculo sincronizam automaticamente

## Referência Meta

https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/
