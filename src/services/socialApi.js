import { normalizeHandle } from '../lib/formatters'
import { supabase, SUPABASE_MEDIA_BUCKET } from '../lib/supabase'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase nao configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }

  return supabase
}

function sanitizeName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
}

function toHandle(value) {
  const cleanValue = sanitizeName(value).toLowerCase().replace(/\s+/g, '')
  const normalized = cleanValue.replace(/[^a-z0-9_]/g, '').slice(0, 24)
  return normalized || `user${Math.floor(Math.random() * 10000)}`
}

function safeProfileName(profile) {
  return profile?.name || 'Usuario'
}

function safeHandle(profile) {
  return normalizeHandle(profile?.handle || 'usuario')
}

function safeBio(profile) {
  return profile?.bio || ''
}

function safeAvatar(profile) {
  return profile?.avatar_url || null
}

function isMissingRelationError(error, relationName) {
  if (!error) {
    return false
  }

  if (error.code === '42P01') {
    return true
  }

  const message = String(error.message || '').toLowerCase()
  return relationName ? message.includes(`relation "${relationName}"`) : message.includes('relation')
}

function followsSetupError() {
  return new Error('Tabela user_follows nao encontrada. Rode novamente supabase/schema.sql para ativar follows.')
}

function directSetupError() {
  return new Error(
    'Tabelas de direct nao encontradas. Rode novamente supabase/schema.sql para ativar mensagens privadas.',
  )
}

function isMissingDirectRelation(error) {
  return (
    isMissingRelationError(error, 'direct_threads') ||
    isMissingRelationError(error, 'direct_thread_participants') ||
    isMissingRelationError(error, 'direct_messages')
  )
}

const FEED_POST_SELECT = `
  id,
  user_id,
  content,
  mood,
  track_title,
  track_artist,
  media_url,
  media_type,
  likes_count,
  reposts_count,
  created_at,
  profiles:user_id (
    id,
    name,
    handle,
    bio,
    avatar_url
  ),
  comments (
    id,
    content,
    created_at,
    profiles:user_id (
      id,
      name,
      handle,
      avatar_url
    )
  ),
  post_likes (
    user_id
  ),
  post_reposts (
    user_id
  )
`

function mapComment(row) {
  return {
    id: row.id,
    authorName: safeProfileName(row.profiles),
    authorHandle: safeHandle(row.profiles),
    authorAvatarUrl: safeAvatar(row.profiles),
    text: row.content,
    createdAt: row.created_at,
  }
}

function mapPost(row, currentUserId) {
  const likes = row.post_likes || []
  const reposts = row.post_reposts || []

  return {
    id: row.id,
    user: {
      id: row.profiles?.id || row.user_id,
      name: safeProfileName(row.profiles),
      handle: safeHandle(row.profiles),
      bio: safeBio(row.profiles),
      avatarUrl: safeAvatar(row.profiles),
    },
    createdAt: row.created_at,
    mood: row.mood || 'Sem mood',
    text: row.content,
    track: row.track_title && row.track_artist ? { title: row.track_title, artist: row.track_artist } : null,
    media: row.media_url
      ? {
          url: row.media_url,
          type: row.media_type || 'image',
        }
      : null,
    likes: Number.isInteger(row.likes_count) ? row.likes_count : likes.length,
    reposts: Number.isInteger(row.reposts_count) ? row.reposts_count : reposts.length,
    liked: likes.some((entry) => entry.user_id === currentUserId),
    reposted: reposts.some((entry) => entry.user_id === currentUserId),
    comments: (row.comments || [])
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(mapComment),
  }
}

async function fetchPostById(postId, currentUserId) {
  const client = requireSupabase()

  const { data, error } = await client
    .from('posts')
    .select(FEED_POST_SELECT)
    .eq('id', postId)
    .single()

  if (error) {
    throw error
  }

  return mapPost(data, currentUserId)
}

export async function getSession() {
  const client = requireSupabase()
  const { data, error } = await client.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}

export function listenAuthStateChange(callback) {
  const client = requireSupabase()
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => callback(session))

  return () => {
    subscription.unsubscribe()
  }
}

export function subscribeDirectInbox({ userId, onChange, onError }) {
  const client = requireSupabase()

  if (!userId) {
    return () => {}
  }

  const channel = client
    .channel(`direct-inbox-${userId}-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
      },
      (payload) => {
        onChange?.({
          type: 'message_insert',
          row: payload.new || null,
        })
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_thread_participants',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onChange?.({
          type: 'participant_insert',
          row: payload.new || null,
        })
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('Falha ao sincronizar direct em tempo real.'))
      }
    })

  return () => {
    void client.removeChannel(channel)
  }
}

export async function signIn({ email, password }) {
  const client = requireSupabase()
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error) {
    throw error
  }

  return data
}

export async function signUp({ name, email, password }) {
  const client = requireSupabase()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  })

  if (error) {
    throw error
  }

  return data
}

export async function signOut() {
  const client = requireSupabase()
  const { error } = await client.auth.signOut()

  if (error) {
    throw error
  }
}

export async function ensureProfile(user) {
  const client = requireSupabase()

  const { data: existingProfile, error: existingError } = await client
    .from('profiles')
    .select('id, name, handle, bio, avatar_url, created_at')
    .eq('id', user.id)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existingProfile) {
    return existingProfile
  }

  const nameFromMetadata = user.user_metadata?.name || user.email?.split('@')[0] || 'Novo usuario'
  const safeName = sanitizeName(nameFromMetadata) || 'Novo usuario'
  const baseHandle = toHandle(nameFromMetadata)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = attempt === 0 ? '' : `${Math.floor(Math.random() * 900 + 100)}`
    const handle = `${baseHandle}${suffix}`

    const { data: created, error: createError } = await client
      .from('profiles')
      .insert({
        id: user.id,
        name: safeName,
        handle,
        bio: '',
      })
      .select('id, name, handle, bio, avatar_url, created_at')
      .single()

    if (!createError) {
      return created
    }

    if (createError.code !== '23505') {
      throw createError
    }
  }

  throw new Error('Nao foi possivel criar um perfil com handle unico.')
}

export async function fetchFeed(currentUserId) {
  const client = requireSupabase()

  const { data, error } = await client
    .from('posts')
    .select(FEED_POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw error
  }

  return (data || []).map((row) => mapPost(row, currentUserId))
}

async function countByField(tableName, fieldName, value, options = {}) {
  const { fallbackZeroOnMissing = false } = options
  const client = requireSupabase()
  const { count, error } = await client
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .eq(fieldName, value)

  if (error) {
    if (fallbackZeroOnMissing && isMissingRelationError(error, tableName)) {
      return 0
    }

    throw error
  }

  return count || 0
}

export async function fetchFollowStats(userId) {
  const [followers, following] = await Promise.all([
    countByField('user_follows', 'following_id', userId, { fallbackZeroOnMissing: true }),
    countByField('user_follows', 'follower_id', userId, { fallbackZeroOnMissing: true }),
  ])

  return {
    followers,
    following,
  }
}

export async function fetchPeopleToFollow({ userId, limit = 6 }) {
  const client = requireSupabase()

  const { data: profiles, error: profilesError } = await client
    .from('profiles')
    .select('id, name, handle, bio, avatar_url, created_at')
    .neq('id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.max(limit * 2, limit))

  if (profilesError) {
    throw profilesError
  }

  const rows = profiles || []
  if (!rows.length) {
    return []
  }

  const profileIds = rows.map((row) => row.id)

  const [{ data: followRows, error: followRowsError }, { data: followingRows, error: followingRowsError }] =
    await Promise.all([
      client.from('user_follows').select('following_id').in('following_id', profileIds),
      client
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', userId)
        .in('following_id', profileIds),
    ])

  if (followRowsError) {
    if (!isMissingRelationError(followRowsError, 'user_follows')) {
      throw followRowsError
    }
  }

  if (followingRowsError) {
    if (!isMissingRelationError(followingRowsError, 'user_follows')) {
      throw followingRowsError
    }
  }

  const followersCountMap = new Map()
  for (const row of followRows || []) {
    followersCountMap.set(row.following_id, (followersCountMap.get(row.following_id) || 0) + 1)
  }

  const followingSet = new Set((followingRows || []).map((row) => row.following_id))

  return rows.slice(0, limit).map((profileRow) => ({
    id: profileRow.id,
    name: profileRow.name,
    handle: safeHandle(profileRow),
    role: profileRow.bio || 'Membro da comunidade',
    avatarUrl: safeAvatar(profileRow),
    followers: followersCountMap.get(profileRow.id) || 0,
    followed: followingSet.has(profileRow.id),
  }))
}

export async function toggleFollowUser({ followerId, followingId }) {
  if (followerId === followingId) {
    throw new Error('Voce nao pode seguir o proprio perfil.')
  }

  const client = requireSupabase()

  const { data: existing, error: existingError } = await client
    .from('user_follows')
    .select('follower_id, following_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle()

  if (existingError) {
    if (isMissingRelationError(existingError, 'user_follows')) {
      throw followsSetupError()
    }

    throw existingError
  }

  if (existing) {
    const { error: deleteError } = await client
      .from('user_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId)

    if (deleteError) {
      throw deleteError
    }
  } else {
    const { error: insertError } = await client.from('user_follows').insert({
      follower_id: followerId,
      following_id: followingId,
    })

    if (insertError) {
      if (isMissingRelationError(insertError, 'user_follows')) {
        throw followsSetupError()
      }

      throw insertError
    }
  }

  const [targetFollowersCount, ownFollowingCount] = await Promise.all([
    countByField('user_follows', 'following_id', followingId, { fallbackZeroOnMissing: true }),
    countByField('user_follows', 'follower_id', followerId, { fallbackZeroOnMissing: true }),
  ])

  return {
    following: !existing,
    targetFollowersCount,
    ownFollowingCount,
  }
}

export async function fetchPublicProfileByHandle({ handle, viewerUserId }) {
  const client = requireSupabase()
  const normalized = normalizeHandle(handle).toLowerCase()

  const { data: profileRow, error: profileError } = await client
    .from('profiles')
    .select('id, name, handle, bio, avatar_url, created_at')
    .ilike('handle', normalized)
    .maybeSingle()

  if (profileError) {
    throw profileError
  }

  if (!profileRow) {
    throw new Error('Perfil nao encontrado.')
  }

  const [followers, following, posts, followState] = await Promise.all([
    countByField('user_follows', 'following_id', profileRow.id, { fallbackZeroOnMissing: true }),
    countByField('user_follows', 'follower_id', profileRow.id, { fallbackZeroOnMissing: true }),
    (async () => {
      const { data, error } = await client
        .from('posts')
        .select(FEED_POST_SELECT)
        .eq('user_id', profileRow.id)
        .order('created_at', { ascending: false })
        .limit(30)

      if (error) {
        throw error
      }

      return (data || []).map((row) => mapPost(row, viewerUserId))
    })(),
    viewerUserId
      ? (async () => {
          const result = await client
            .from('user_follows')
            .select('follower_id')
            .eq('follower_id', viewerUserId)
            .eq('following_id', profileRow.id)
            .maybeSingle()

          if (result.error && isMissingRelationError(result.error, 'user_follows')) {
            return {
              data: null,
              error: null,
            }
          }

          return result
        })()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (followState.error) {
    throw followState.error
  }

  return {
    profile: {
      id: profileRow.id,
      name: safeProfileName(profileRow),
      handle: safeHandle(profileRow),
      bio: safeBio(profileRow),
      avatarUrl: safeAvatar(profileRow),
      createdAt: profileRow.created_at,
    },
    followers,
    following,
    isFollowing: Boolean(followState.data),
    posts,
  }
}

function mapDirectMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    text: row.content,
    createdAt: row.created_at,
  }
}

function toIsoOrMin(value) {
  return value || '1970-01-01T00:00:00.000Z'
}

export async function fetchDirectThreads({ userId }) {
  const client = requireSupabase()

  const { data: myParticipantRows, error: myParticipantsError } = await client
    .from('direct_thread_participants')
    .select(
      `
      thread_id,
      last_read_at,
      direct_threads:thread_id (
        id,
        created_at,
        updated_at
      )
    `,
    )
    .eq('user_id', userId)

  if (myParticipantsError) {
    if (isMissingDirectRelation(myParticipantsError)) {
      return []
    }

    throw myParticipantsError
  }

  const myRows = myParticipantRows || []
  if (!myRows.length) {
    return []
  }

  const threadIds = myRows.map((row) => row.thread_id)
  const myParticipantByThread = new Map(
    myRows.map((row) => [
      row.thread_id,
      {
        lastReadAt: row.last_read_at,
        thread: row.direct_threads,
      },
    ]),
  )

  const [{ data: participantsRows, error: participantsError }, { data: messagesRows, error: messagesError }] =
    await Promise.all([
      client
        .from('direct_thread_participants')
        .select(
          `
          thread_id,
          user_id,
          last_read_at,
          profiles:user_id (
            id,
            name,
            handle,
            avatar_url
          )
        `,
        )
        .in('thread_id', threadIds),
      client
        .from('direct_messages')
        .select('id, thread_id, sender_id, content, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: true }),
    ])

  if (participantsError) {
    if (isMissingDirectRelation(participantsError)) {
      return []
    }

    throw participantsError
  }

  if (messagesError) {
    if (isMissingDirectRelation(messagesError)) {
      return []
    }

    throw messagesError
  }

  const participantsByThread = new Map()
  for (const row of participantsRows || []) {
    const current = participantsByThread.get(row.thread_id) || []
    current.push(row)
    participantsByThread.set(row.thread_id, current)
  }

  const messagesByThread = new Map()
  for (const row of messagesRows || []) {
    const current = messagesByThread.get(row.thread_id) || []
    current.push(mapDirectMessage(row))
    messagesByThread.set(row.thread_id, current)
  }

  const threads = threadIds.map((threadId) => {
    const participants = participantsByThread.get(threadId) || []
    const messages = messagesByThread.get(threadId) || []
    const myParticipant = myParticipantByThread.get(threadId)
    const otherParticipantRow =
      participants.find((row) => row.user_id !== userId) ||
      participants.find((row) => row.user_id === userId) ||
      null

    const participantProfile = otherParticipantRow?.profiles || null
    const unread = messages.filter(
      (message) =>
        message.senderId !== userId &&
        new Date(message.createdAt) > new Date(toIsoOrMin(myParticipant?.lastReadAt)),
    ).length

    const latestMessageAt = messages.length ? messages[messages.length - 1].createdAt : null
    const updatedAt =
      latestMessageAt || myParticipant?.thread?.updated_at || myParticipant?.thread?.created_at || new Date().toISOString()

    return {
      id: threadId,
      participant: {
        id: participantProfile?.id || otherParticipantRow?.user_id || 'unknown-user',
        name: safeProfileName(participantProfile),
        handle: safeHandle(participantProfile),
        avatarUrl: safeAvatar(participantProfile),
        online: false,
      },
      unread,
      updatedAt,
      messages,
    }
  })

  return threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

export async function markDirectThreadRead({ threadId, userId }) {
  const client = requireSupabase()

  const { error } = await client
    .from('direct_thread_participants')
    .update({
      last_read_at: new Date().toISOString(),
    })
    .eq('thread_id', threadId)
    .eq('user_id', userId)

  if (error) {
    if (isMissingDirectRelation(error)) {
      throw directSetupError()
    }

    throw error
  }
}

export async function createOrGetDirectThread({ userId, targetUserId }) {
  if (userId === targetUserId) {
    throw new Error('Nao e possivel abrir direct com o proprio usuario.')
  }

  const client = requireSupabase()

  const [{ data: myRows, error: myRowsError }, { data: targetRows, error: targetRowsError }] = await Promise.all([
    client.from('direct_thread_participants').select('thread_id').eq('user_id', userId),
    client.from('direct_thread_participants').select('thread_id').eq('user_id', targetUserId),
  ])

  if (myRowsError) {
    if (isMissingDirectRelation(myRowsError)) {
      throw directSetupError()
    }

    throw myRowsError
  }

  if (targetRowsError) {
    if (isMissingDirectRelation(targetRowsError)) {
      throw directSetupError()
    }

    throw targetRowsError
  }

  const targetThreadSet = new Set((targetRows || []).map((row) => row.thread_id))
  const existingThread = (myRows || []).find((row) => targetThreadSet.has(row.thread_id))
  if (existingThread) {
    return existingThread.thread_id
  }

  const threadId = crypto.randomUUID()

  const { error: createThreadError } = await client
    .from('direct_threads')
    .insert({
      id: threadId,
    })

  if (createThreadError) {
    if (isMissingDirectRelation(createThreadError)) {
      throw directSetupError()
    }

    throw createThreadError
  }
  const nowIso = new Date().toISOString()

  const { error: addSelfError } = await client.from('direct_thread_participants').insert({
    thread_id: threadId,
    user_id: userId,
    last_read_at: nowIso,
  })

  if (addSelfError) {
    if (isMissingDirectRelation(addSelfError)) {
      throw directSetupError()
    }

    throw addSelfError
  }

  const { error: addTargetError } = await client.from('direct_thread_participants').insert({
    thread_id: threadId,
    user_id: targetUserId,
    last_read_at: nowIso,
  })

  if (addTargetError) {
    if (isMissingDirectRelation(addTargetError)) {
      throw directSetupError()
    }

    throw addTargetError
  }

  return threadId
}

export async function sendDirectMessage({ threadId, senderId, content }) {
  const client = requireSupabase()
  const text = String(content || '').trim()

  if (!text) {
    throw new Error('Mensagem vazia.')
  }

  const { data, error } = await client
    .from('direct_messages')
    .insert({
      thread_id: threadId,
      sender_id: senderId,
      content: text.slice(0, 2000),
    })
    .select('id, thread_id, sender_id, content, created_at')
    .single()

  if (error) {
    if (isMissingDirectRelation(error)) {
      throw directSetupError()
    }

    throw error
  }

  await markDirectThreadRead({ threadId, userId: senderId })

  return mapDirectMessage(data)
}

function normalizeFileName(fileName) {
  return fileName.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-')
}

async function uploadMedia(userId, file, category = 'posts') {
  if (!file) {
    return null
  }

  const client = requireSupabase()
  const extension = (file.name.split('.').pop() || 'file').toLowerCase()
  const baseName = file.name.replace(/\.[^/.]+$/, '')
  const safeName = normalizeFileName(baseName || 'upload')
  const path = `${userId}/${category}/${Date.now()}-${safeName}.${extension}`

  const { error: uploadError } = await client.storage.from(SUPABASE_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) {
    throw uploadError
  }

  const { data } = client.storage.from(SUPABASE_MEDIA_BUCKET).getPublicUrl(path)

  return {
    url: data.publicUrl,
    type: file.type.startsWith('audio/') ? 'audio' : 'image',
  }
}

export async function updateOwnProfile({ userId, name, bio, avatarFile }) {
  const client = requireSupabase()
  const payload = {
    name: sanitizeName(name) || 'Usuario',
    bio: (bio || '').trim().slice(0, 280),
  }

  if (avatarFile) {
    const uploaded = await uploadMedia(userId, avatarFile, 'avatars')
    payload.avatar_url = uploaded?.url || null
  }

  const { data, error } = await client
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id, name, handle, bio, avatar_url, created_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function createPost({
  userId,
  currentUserId,
  content,
  mood,
  trackTitle,
  trackArtist,
  mediaFile,
}) {
  const client = requireSupabase()
  const media = await uploadMedia(userId, mediaFile, 'posts')

  const { data, error } = await client
    .from('posts')
    .insert({
      user_id: userId,
      content,
      mood,
      track_title: trackTitle || null,
      track_artist: trackArtist || null,
      media_url: media?.url || null,
      media_type: media?.type || null,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return fetchPostById(data.id, currentUserId)
}

export async function addComment({ postId, userId, content }) {
  const client = requireSupabase()

  const { data, error } = await client
    .from('comments')
    .insert({
      post_id: postId,
      user_id: userId,
      content,
    })
    .select(
      `
      id,
      content,
      created_at,
      profiles:user_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .single()

  if (error) {
    throw error
  }

  return mapComment(data)
}

async function toggleInteraction({ postId, userId, tableName }) {
  const client = requireSupabase()

  const { data: existing, error: existingError } = await client
    .from(tableName)
    .select('post_id, user_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    const { error: deleteError } = await client
      .from(tableName)
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)

    if (deleteError) {
      throw deleteError
    }
  } else {
    const { error: insertError } = await client.from(tableName).insert({
      post_id: postId,
      user_id: userId,
    })

    if (insertError) {
      throw insertError
    }
  }

  const { count, error: countError } = await client
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)

  if (countError) {
    throw countError
  }

  const nextCount = count || 0

  return {
    active: !existing,
    count: nextCount,
  }
}

export async function toggleLike({ postId, userId }) {
  return toggleInteraction({
    postId,
    userId,
    tableName: 'post_likes',
  })
}

export async function toggleRepost({ postId, userId }) {
  return toggleInteraction({
    postId,
    userId,
    tableName: 'post_reposts',
  })
}
