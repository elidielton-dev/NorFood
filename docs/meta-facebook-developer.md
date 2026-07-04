# E-mail e dados para o app no Facebook Developer (Meta)

Use estes dados ao criar ou editar o app em [developers.facebook.com](https://developers.facebook.com).

## E-mail corporativo do app

| Campo | Valor |
|-------|--------|
| **Contact email (obrigatório)** | `meta@norfood.com.br` |
| **Alternativa** | `contato@norfood.com.br` (se `meta@` ainda não receber e-mail) |

O domínio `norfood.com.br` já está verificado no **Resend** para **envio**. Para **receber** e-mails da Meta (alertas, revisão do app, etc.), configure encaminhamento no Registro.br ou no provedor de e-mail (veja abaixo).

---

## Copiar e colar no Facebook Developer

### Informações básicas do app

| Campo | Valor sugerido |
|-------|----------------|
| **App name** | NorFood |
| **App contact email** | `meta@norfood.com.br` |
| **App purpose** | Business / Yourself or your own business |

### Configurações → Básico

| Campo | Valor |
|-------|--------|
| **Display name** | NorFood |
| **Namespace** | norfood |
| **Contact email** | `meta@norfood.com.br` |
| **App domains** | `norfood.com.br` |
| **Privacy Policy URL** | `https://norfood.com.br` *(atualize quando tiver página `/privacidade`)* |
| **Terms of Service URL** | `https://norfood.com.br` *(opcional até publicar termos)* |
| **Category** | Business |
| **Data deletion instructions URL** | `mailto:meta@norfood.com.br?subject=Exclus%C3%A3o%20de%20dados%20NorFood` |

### WhatsApp → Configuration (webhook NorFood)

| Campo | Valor |
|-------|--------|
| **Callback URL** | `https://norfood.com.br/api/waba/webhook` |
| **Verify token** | `norfood-waba-2026` (ou valor de `WABA_VERIFY_TOKEN` no `.env` da VPS) |
| **Webhook fields** | `messages` (e campos de coexistência se usar WhatsApp Business app) |

Variáveis no servidor (`deploy/.env`):

```env
META_APP_ID=
META_APP_SECRET=
WABA_VERIFY_TOKEN=norfood-waba-2026
WABA_WEBHOOK_URL=https://norfood.com.br/api/waba/webhook
META_APP_CONTACT_EMAIL=meta@norfood.com.br
```

---

## Receber e-mail em `meta@norfood.com.br`

A Meta envia notificações para o **Contact email**. Você precisa conseguir **ler** essa caixa.

### Opção A — Encaminhamento no Registro.br (recomendado)

1. Acesse [registro.br](https://registro.br) → seu domínio → **E-mail**
2. Crie alias ou encaminhamento: `meta@norfood.com.br` → seu e-mail pessoal (Gmail, etc.)
3. Teste enviando um e-mail para `meta@norfood.com.br`

### Opção B — Google Workspace / Zoho

Crie a caixa `meta@norfood.com.br` no painel do provedor e aponte os MX do domínio conforme a documentação deles.

### Opção C — Enquanto não configurar

Use temporariamente **`contato@norfood.com.br`** no Facebook Developer se essa caixa já recebe e-mail.

---

## Envio transacional (Resend)

Para e-mails **enviados** pelo sistema (cadastro, suporte), continue usando:

| Uso | Remetente |
|-----|-----------|
| Cadastro | `cadastro@norfood.com.br` |
| Contato / suporte | `contato@norfood.com.br` |
| Meta / integrações (opcional) | `meta@norfood.com.br` |

No `.env` da VPS, se quiser remetente dedicado Meta:

```env
PLATFORM_EMAIL_META_FROM=Norfood <meta@norfood.com.br>
```

---

## App Meta novo (NorFood)

Se você criou um app **novo** no Facebook Developer (substituindo o app legado Abelha & Mel):

1. **Configurações → Básico:** contact email `meta@norfood.com.br`, domínio `norfood.com.br`
2. Adicione o produto **WhatsApp**
3. Copie **App ID** e **App Secret** para `deploy/.env` na VPS:
   ```env
   META_APP_ID=
   META_APP_SECRET=
   WABA_VERIFY_TOKEN=norfood-waba-2026
   WABA_WEBHOOK_URL=https://norfood.com.br/api/waba/webhook
   ```
4. Reinicie o container (`docker compose up -d --build` em `/opt/norfood/deploy`)
5. **WhatsApp → Webhook:** URL + verify token `norfood-waba-2026` → **Verificar e salvar**
   - O Norfood aceita o token do `.env` **ou** do painel (Atendimento → Configurações) **ou** o padrão `norfood-waba-2026`
6. Gere **Access Token** e **Phone Number ID** no API Setup do app **novo**
7. Salve em **Atendimento → Configurações** no painel Norfood

---

## Checklist antes de submeter o app

- [ ] Contact email recebe mensagens (teste manual)
- [ ] `META_APP_ID` e `META_APP_SECRET` no `deploy/.env`
- [ ] Webhook verificado (GET challenge da Meta)
- [ ] `META_APP_SECRET` configurado (assinatura de webhook)
- [ ] Privacy Policy URL acessível (Meta exige em produção)
- [ ] Ícone do app 1024×1024 (logo NorFood)

---

## Suporte Meta

- [Documentação WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Webhooks — verificação](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
