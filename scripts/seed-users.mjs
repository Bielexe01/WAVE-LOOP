import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SEED_USERS = [
  {
    key: 'luna',
    name: 'Luna Costa',
    handle: 'demo_lunacosta',
    bio: 'Indie pop e synthwave brasileira.',
    email: 'luna.demo@waveloop.dev',
  },
  {
    key: 'kai',
    name: 'Kai Martins',
    handle: 'demo_kaibeats',
    bio: 'Produtor de house latino e club edits.',
    email: 'kai.demo@waveloop.dev',
  },
  {
    key: 'helena',
    name: 'Helena Rocha',
    handle: 'demo_helenarocha',
    bio: 'Colecionadora de vinil e R&B classico.',
    email: 'helena.demo@waveloop.dev',
  },
  {
    key: 'rafa',
    name: 'Rafa Melo',
    handle: 'demo_rafamelo',
    bio: 'Lo-fi, beats para foco e estudos.',
    email: 'rafa.demo@waveloop.dev',
  },
  {
    key: 'nina',
    name: 'Nina Prado',
    handle: 'demo_ninaprado',
    bio: 'Cantora indie com pegada dream-pop.',
    email: 'nina.demo@waveloop.dev',
  },
]

const SEED_POSTS = [
  {
    key: 'p1',
    authorKey: 'luna',
    content: 'Acabei de fechar uma sequencia de pop BR para estrada. Quem quer playlist?',
    mood: 'Alta energia',
    track: { title: 'Brisa da Cidade', artist: 'Maya e Atlas' },
    minutesAgo: 11,
  },
  {
    key: 'p2',
    authorKey: 'kai',
    content: 'Drop novo de house latino. Gravei teaser no estudio e quero feedback.',
    mood: 'Noite',
    track: { title: 'Ritmo Noturno', artist: 'Kai Martins' },
    minutesAgo: 27,
  },
  {
    key: 'p3',
    authorKey: 'helena',
    content: 'Hoje so escutando classicos de R&B no vinil. Qual faixa antiga voce nunca pula?',
    mood: 'Nostalgia',
    track: { title: 'Velvet Tape', artist: 'The Downtown Souls' },
    minutesAgo: 41,
  },
  {
    key: 'p4',
    authorKey: 'rafa',
    content: 'Subi uma playlist de lo-fi para estudo com 45 minutos sem interrupcao.',
    mood: 'Calmo',
    track: { title: 'Quiet Circuit', artist: 'Rafa Melo' },
    minutesAgo: 63,
  },
  {
    key: 'p5',
    authorKey: 'nina',
    content: 'Demo nova pronta. Quero feedback de refrão e textura dos synths.',
    mood: 'Treino',
    track: { title: 'Neon Letters', artist: 'Nina Prado' },
    minutesAgo: 88,
  },
]

const SEED_COMMENTS = [
  { postKey: 'p1', authorKey: 'kai', content: 'Curti. Essa cabe num set de abertura.' },
  { postKey: 'p1', authorKey: 'nina', content: 'Manda o link dessa playlist.' },
  { postKey: 'p2', authorKey: 'helena', content: 'Kick muito limpo, ficou profissional.' },
  { postKey: 'p3', authorKey: 'luna', content: 'Velvet Tape e perfeita para fim de tarde.' },
  { postKey: 'p4', authorKey: 'rafa', content: 'Acabei de publicar versao extendida tambem.' },
  { postKey: 'p5', authorKey: 'kai', content: 'Gostei da textura, so subiria o vocal no refrão.' },
]

const SEED_LIKES = [
  ['p1', ['kai', 'helena', 'rafa']],
  ['p2', ['luna', 'nina', 'helena']],
  ['p3', ['luna', 'kai']],
  ['p4', ['nina', 'luna']],
  ['p5', ['kai', 'rafa', 'helena']],
]

const SEED_REPOSTS = [
  ['p1', ['nina']],
  ['p2', ['rafa', 'luna']],
  ['p3', ['kai']],
  ['p5', ['luna']],
]

const SEED_FOLLOWS = [
  ['luna', ['kai', 'helena', 'nina']],
  ['kai', ['luna', 'rafa', 'nina']],
  ['helena', ['luna', 'nina']],
  ['rafa', ['kai', 'luna']],
  ['nina', ['luna', 'kai', 'helena']],
]

const SEED_DIRECT_THREADS = [
  {
    participants: ['luna', 'kai'],
    messages: [
      { from: 'luna', content: 'Escuta esse teaser e me fala da mix.', minutesAgo: 62 },
      { from: 'kai', content: 'Ouvi agora, groove ficou forte.', minutesAgo: 55 },
      { from: 'luna', content: 'Boa! Vou subir a versao final hoje.', minutesAgo: 18 },
    ],
  },
  {
    participants: ['helena', 'nina'],
    messages: [
      { from: 'helena', content: 'Tenho umas referencias de voz para seu single.', minutesAgo: 80 },
      { from: 'nina', content: 'Manda sim, estou fechando arranjo agora.', minutesAgo: 73 },
    ],
  },
  {
    participants: ['rafa', 'luna'],
    messages: [
      { from: 'rafa', content: 'Vamos fechar collab lo-fi pra sexta?', minutesAgo: 47 },
      { from: 'luna', content: 'Partiu. Te mando stems no fim da tarde.', minutesAgo: 40 },
    ],
  },
]

function parseDotEnv(content) {
  const result = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const index = trimmed.indexOf('=')
    if (index <= 0) {
      continue
    }

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  return parseDotEnv(raw)
}

function readEnv() {
  const cwd = process.cwd()
  const env = {
    ...loadEnvFile(path.join(cwd, '.env')),
    ...loadEnvFile(path.join(cwd, '.env.local')),
    ...process.env,
  }

  return env
}

function boolFlag(value, defaultValue) {
  if (value === undefined) {
    return defaultValue
  }

  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase())
}

function isoMinutesAgo(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString()
}

async function listAllAuthUsers(supabase) {
  const users = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw error
    }

    const batch = data.users || []
    users.push(...batch)

    if (batch.length < perPage) {
      break
    }

    page += 1
  }

  return users
}

async function ensureAuthUsers(supabase, password, shouldResetPassword) {
  const existing = await listAllAuthUsers(supabase)
  const byEmail = new Map(existing.map((user) => [String(user.email || '').toLowerCase(), user]))

  const out = []

  for (const seedUser of SEED_USERS) {
    const key = seedUser.email.toLowerCase()
    let user = byEmail.get(key)

    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: seedUser.email,
        password,
        email_confirm: true,
        user_metadata: { name: seedUser.name },
      })

      if (error) {
        throw error
      }

      user = data.user
      byEmail.set(key, user)
      console.log(`+ usuario criado: ${seedUser.email}`)
    } else {
      const payload = {
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata || {}),
          name: seedUser.name,
        },
      }

      if (shouldResetPassword) {
        payload.password = password
      }

      const { error } = await supabase.auth.admin.updateUserById(user.id, payload)
      if (error) {
        throw error
      }

      console.log(`= usuario reaproveitado: ${seedUser.email}`)
    }

    out.push({ ...seedUser, id: user.id })
  }

  return out
}

async function seed() {
  const env = readEnv()
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const userPassword = env.SEED_USER_PASSWORD || 'Music1234!'
  const shouldResetPassword = boolFlag(env.SEED_RESET_PASSWORD, true)

  if (!supabaseUrl) {
    throw new Error('Defina SUPABASE_URL ou VITE_SUPABASE_URL no ambiente.')
  }

  if (!serviceRoleKey) {
    throw new Error('Defina SUPABASE_SERVICE_ROLE_KEY no ambiente para rodar o seed.')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const seededUsers = await ensureAuthUsers(supabase, userPassword, shouldResetPassword)
  const userIds = seededUsers.map((user) => user.id)
  const userByKey = new Map(seededUsers.map((user) => [user.key, user]))

  const profilesPayload = seededUsers.map((user) => ({
    id: user.id,
    name: user.name,
    handle: user.handle,
    bio: user.bio,
  }))

  const { error: profilesError } = await supabase
    .from('profiles')
    .upsert(profilesPayload, { onConflict: 'id' })

  if (profilesError) {
    throw profilesError
  }

  const { error: cleanLikesError } = await supabase.from('post_likes').delete().in('user_id', userIds)
  if (cleanLikesError) {
    throw cleanLikesError
  }

  const { error: cleanRepostsError } = await supabase.from('post_reposts').delete().in('user_id', userIds)
  if (cleanRepostsError) {
    throw cleanRepostsError
  }

  const { error: cleanCommentsError } = await supabase.from('comments').delete().in('user_id', userIds)
  if (cleanCommentsError) {
    throw cleanCommentsError
  }

  const { error: cleanPostsError } = await supabase.from('posts').delete().in('user_id', userIds)
  if (cleanPostsError) {
    throw cleanPostsError
  }

  const { error: cleanFollowsByFollowerError } = await supabase
    .from('user_follows')
    .delete()
    .in('follower_id', userIds)
  if (cleanFollowsByFollowerError) {
    throw cleanFollowsByFollowerError
  }

  const { error: cleanFollowsByFollowingError } = await supabase
    .from('user_follows')
    .delete()
    .in('following_id', userIds)
  if (cleanFollowsByFollowingError) {
    throw cleanFollowsByFollowingError
  }

  const { data: directParticipantRows, error: directParticipantRowsError } = await supabase
    .from('direct_thread_participants')
    .select('thread_id')
    .in('user_id', userIds)

  if (directParticipantRowsError && directParticipantRowsError.code !== '42P01') {
    throw directParticipantRowsError
  }

  const directThreadIds = [...new Set((directParticipantRows || []).map((row) => row.thread_id))]

  if (directThreadIds.length) {
    const { error: cleanDirectMessagesError } = await supabase
      .from('direct_messages')
      .delete()
      .in('thread_id', directThreadIds)
    if (cleanDirectMessagesError) {
      throw cleanDirectMessagesError
    }

    const { error: cleanDirectParticipantsError } = await supabase
      .from('direct_thread_participants')
      .delete()
      .in('thread_id', directThreadIds)
    if (cleanDirectParticipantsError) {
      throw cleanDirectParticipantsError
    }

    const { error: cleanDirectThreadsError } = await supabase
      .from('direct_threads')
      .delete()
      .in('id', directThreadIds)
    if (cleanDirectThreadsError) {
      throw cleanDirectThreadsError
    }
  }

  const postIdsByKey = new Map()

  for (const seedPost of SEED_POSTS) {
    const author = userByKey.get(seedPost.authorKey)
    if (!author) {
      throw new Error(`Autor nao encontrado para post ${seedPost.key}`)
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: author.id,
        content: seedPost.content,
        mood: seedPost.mood,
        track_title: seedPost.track.title,
        track_artist: seedPost.track.artist,
        created_at: isoMinutesAgo(seedPost.minutesAgo),
      })
      .select('id')
      .single()

    if (error) {
      throw error
    }

    postIdsByKey.set(seedPost.key, data.id)
  }

  for (const seedComment of SEED_COMMENTS) {
    const author = userByKey.get(seedComment.authorKey)
    const postId = postIdsByKey.get(seedComment.postKey)

    if (!author || !postId) {
      throw new Error(`Comentario invalido para post=${seedComment.postKey} autor=${seedComment.authorKey}`)
    }

    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: author.id,
      content: seedComment.content,
    })

    if (error) {
      throw error
    }
  }

  const likesPayload = []
  for (const [postKey, authorKeys] of SEED_LIKES) {
    const postId = postIdsByKey.get(postKey)
    for (const authorKey of authorKeys) {
      const author = userByKey.get(authorKey)
      if (postId && author) {
        likesPayload.push({ post_id: postId, user_id: author.id })
      }
    }
  }

  if (likesPayload.length) {
    const { error } = await supabase
      .from('post_likes')
      .upsert(likesPayload, { onConflict: 'post_id,user_id' })

    if (error) {
      throw error
    }
  }

  const repostsPayload = []
  for (const [postKey, authorKeys] of SEED_REPOSTS) {
    const postId = postIdsByKey.get(postKey)
    for (const authorKey of authorKeys) {
      const author = userByKey.get(authorKey)
      if (postId && author) {
        repostsPayload.push({ post_id: postId, user_id: author.id })
      }
    }
  }

  if (repostsPayload.length) {
    const { error } = await supabase
      .from('post_reposts')
      .upsert(repostsPayload, { onConflict: 'post_id,user_id' })

    if (error) {
      throw error
    }
  }

  const followsPayload = []
  for (const [followerKey, followingKeys] of SEED_FOLLOWS) {
    const follower = userByKey.get(followerKey)
    if (!follower) {
      continue
    }

    for (const followingKey of followingKeys) {
      const following = userByKey.get(followingKey)
      if (!following || following.id === follower.id) {
        continue
      }

      followsPayload.push({
        follower_id: follower.id,
        following_id: following.id,
      })
    }
  }

  if (followsPayload.length) {
    const { error } = await supabase
      .from('user_follows')
      .upsert(followsPayload, { onConflict: 'follower_id,following_id' })

    if (error) {
      throw error
    }
  }

  for (const seedThread of SEED_DIRECT_THREADS) {
    const [firstUserKey, secondUserKey] = seedThread.participants
    const firstUser = userByKey.get(firstUserKey)
    const secondUser = userByKey.get(secondUserKey)

    if (!firstUser || !secondUser) {
      continue
    }

    const { data: threadRow, error: createThreadError } = await supabase
      .from('direct_threads')
      .insert({
        created_at: isoMinutesAgo(Math.max(...seedThread.messages.map((message) => message.minutesAgo), 120)),
      })
      .select('id')
      .single()

    if (createThreadError) {
      if (createThreadError.code === '42P01') {
        throw new Error(
          'Tabelas de direct nao encontradas. Rode supabase/schema.sql novamente para habilitar o Direct.',
        )
      }

      throw createThreadError
    }

    const threadId = threadRow.id

    const { error: participantsError } = await supabase.from('direct_thread_participants').insert([
      {
        thread_id: threadId,
        user_id: firstUser.id,
        last_read_at: isoMinutesAgo(12),
      },
      {
        thread_id: threadId,
        user_id: secondUser.id,
        last_read_at: isoMinutesAgo(50),
      },
    ])

    if (participantsError) {
      throw participantsError
    }

    const messagesPayload = seedThread.messages
      .slice()
      .sort((a, b) => b.minutesAgo - a.minutesAgo)
      .map((message) => {
        const sender = userByKey.get(message.from)
        return {
          thread_id: threadId,
          sender_id: sender?.id,
          content: message.content,
          created_at: isoMinutesAgo(message.minutesAgo),
        }
      })
      .filter((message) => message.sender_id)

    if (messagesPayload.length) {
      const { error: messagesError } = await supabase.from('direct_messages').insert(messagesPayload)
      if (messagesError) {
        throw messagesError
      }
    }
  }

  console.log('')
  console.log('Seed concluido com sucesso.')
  console.log('Usuarios de teste:')
  for (const user of SEED_USERS) {
    console.log(`- ${user.name}: ${user.email} | senha: ${userPassword}`)
  }
}

seed().catch((error) => {
  console.error('Falha no seed:', error.message || error)
  process.exit(1)
})
