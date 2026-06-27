# NorFood Entregador

App mobile em `React Native + Expo + TypeScript + React Navigation + AsyncStorage + NativeWind`.

## Rodar no Expo Go

```bash
cd mobile
npm install
npx expo start
```

## Configuração do Supabase

O app tenta ler o Supabase nesta ordem:

1. Variáveis `EXPO_PUBLIC_SUPABASE_*`
2. `extra.supabase` do Expo
3. `.env` da raiz do projeto via [app.config.js](./app.config.js)

Isso permite usar o mesmo projeto Supabase do painel web sem duplicar credenciais no app mobile durante o desenvolvimento local.

Depois:

1. Abra o aplicativo `Expo Go` no celular.
2. Escaneie o QR Code exibido no terminal/navegador.

## Plataformas suportadas

- `Web`: `npx expo start --web`
- `Android`: `npx expo start --android`
- `iPhone / iOS`: abrir no `Expo Go` no iPhone escaneando o QR Code gerado por `npx expo start`

## Comandos pela raiz do projeto

Sem entrar na pasta `mobile`:

```bash
npm run mobile
npm run mobile:tunnel
npm run mobile:web
npm run mobile:ios
npm run mobile:android
npm run mobile:open
```

## Build instalavel (APK Android)

Para gerar um APK que o entregador instala sem Expo Go:

```bash
npm run setup:eas-secrets   # uma vez — envia Supabase para o EAS
npx eas-cli login           # uma vez — conta Expo
npm run mobile:build:apk    # gera APK na nuvem (perfil preview)
```

O link de download aparece no terminal e no painel [expo.dev](https://expo.dev).

Perfil `preview` gera APK interno. Perfil `production` gera AAB para Play Store.

## Observação sobre iPhone

Para desenvolvimento:

- usuários de iPhone podem abrir no `Expo Go`
- o computador e o iPhone precisam estar na mesma rede Wi‑Fi

Para publicar como app real na App Store depois, o próximo passo será gerar build iOS com `EAS Build` e publicar via `TestFlight/App Store`.

## Estrutura

- `App.tsx`
- `src/screens`
- `src/components`
- `src/navigation`
- `src/data`
- `src/styles`
- `src/types`
