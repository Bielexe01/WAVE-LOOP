# WaveLoop - Rede social de musica (React + Supabase)

Aplicacao React para publicar faixas, comentar, curtir, repostar, seguir perfis, enviar direct e fazer upload de imagem/audio.

## Stack

- React 19 + Vite
- Supabase Auth (email/senha)
- Supabase Postgres (posts, comentarios, likes, reposts, follows, direct e perfis)
- Supabase Storage (bucket `media` para imagem/audio)

## Funcionalidades

- Login e cadastro com email/senha
- Feed persistido no banco
- Publicacao com texto, mood, faixa/artista e upload de midia
- Comentarios por post
- Like e repost persistidos
- Seguir/deixar de seguir perfis
- Perfil publico por handle (com posts e contadores)
- Edicao de perfil (nome, bio e avatar)
- Direct persistido (threads + mensagens)
- Fallback para modo demo quando variaveis do Supabase nao existem

## Configuracao do backend (Supabase)

1. Crie um projeto no Supabase.
2. No painel SQL Editor, rode o arquivo [supabase/schema.sql](./supabase/schema.sql).
  Se seu projeto ja existia, rode novamente para garantir `user_follows`, `direct_threads`,
  `direct_thread_participants` e `direct_messages` com as politicas novas.
3. Copie `.env.example` para `.env` e preencha:

```bash
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
VITE_SUPABASE_MEDIA_BUCKET=media
```

4. Execute o projeto:

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev`: roda em desenvolvimento
- `npm run build`: build de producao
- `npm run preview`: visualiza build local
- `npm run lint`: executa ESLint
- `npm run seed`: cria usuarios/perfis/posts/comentarios/likes/reposts/follows/direct de teste no Supabase

## Observacoes

- Se o email confirmation estiver ativo no Supabase Auth, o usuario precisa confirmar o email antes do login.
- O bucket `media` foi definido como publico no `schema.sql` para simplificar exibicao no frontend.
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend/deploy publico.

## Deploy online (producao)

### Vercel (recomendado)

1. Suba o projeto para GitHub.
2. No Vercel, `Add New Project` e selecione o repo.
3. Em `Environment Variables`, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_MEDIA_BUCKET` (ex.: `media`)
4. Deploy.

O arquivo [vercel.json](./vercel.json) ja esta preparado para build SPA.

### Netlify

1. No Netlify, conecte o repo.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Adicione as mesmas variaveis `VITE_*` acima.

O arquivo [netlify.toml](./netlify.toml) ja esta preparado para build + redirect SPA.

### Ajustes obrigatorios no Supabase Auth

Depois de publicar, abra Supabase > Authentication > URL Configuration:

1. `Site URL`: sua URL de producao (ex.: `https://seu-app.vercel.app`)
2. `Redirect URLs`: inclua:
   - URL de producao
   - URL de preview (se usar)
   - `http://localhost:5173` (dev local)

## Popular usuarios de teste agora

1. Copie `.env.seed.example` para `.env.local` e preencha:

```bash
SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
SEED_USER_PASSWORD=Music1234!
SEED_RESET_PASSWORD=true
```

2. Rode:

```bash
npm run seed
```

3. Usuarios criados para login (mesma senha `SEED_USER_PASSWORD`):
- `luna.demo@waveloop.dev`
- `kai.demo@waveloop.dev`
- `helena.demo@waveloop.dev`
- `rafa.demo@waveloop.dev`
- `nina.demo@waveloop.dev`
