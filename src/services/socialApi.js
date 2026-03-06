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

function isMissingColumnError(error, columnName) {
  if (!error) {
    return false
  }

  if (error.code === '42703') {
    return true
  }

  const message = String(error.message || '').toLowerCase()
  return columnName ? message.includes(`column "${columnName}"`) : message.includes('column')
}

function followsSetupError() {
  return new Error('Tabela user_follows nao encontrada. Rode novamente supabase/schema.sql para ativar follows.')
}

const SPOTIFY_TYPES = new Set(['track', 'playlist', 'album', 'artist', 'episode', 'show'])

function parseSpotifyData(rawUrl, rawType = '') {
  const input = String(rawUrl || '').trim()
  if (!input) {
    return null
  }

  const uriMatch = input.match(/spotify:(track|playlist|album|artist|episode|show):([A-Za-z0-9]+)/i)
  if (uriMatch) {
    const [, type, id] = uriMatch
    return {
      type: type.toLowerCase(),
      id,
      url: `https://open.spotify.com/${type.toLowerCase()}/${id}`,
      embedUrl: `https://open.spotify.com/embed/${type.toLowerCase()}/${id}`,
    }
  }

  const value = input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  const host = parsed.hostname.toLowerCase()
  const isSpotifyHost = host.includes('spotify.com') || host.includes('spotify.link')
  if (!isSpotifyHost) {
    return null
  }

  const path = parsed.pathname || ''
  const pathMatch = path.match(/(?:^|\/)(track|playlist|album|artist|episode|show)\/([A-Za-z0-9]+)(?:$|\/|\?)/i)
  let type = pathMatch?.[1]?.toLowerCase() || ''
  let id = pathMatch?.[2] || ''

  if (!type || !id) {
    const normalizedType = String(rawType || '').trim().toLowerCase()
    if (!SPOTIFY_TYPES.has(normalizedType)) {
      return {
        type: normalizedType || null,
        id: null,
        url: value,
        embedUrl: null,
      }
    }

    type = normalizedType
  }

  if (type && id) {
    return {
      type,
      id,
      url: `https://open.spotify.com/${type}/${id}`,
      embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
    }
  }

  return {
    type: type || null,
    id: null,
    url: value,
    embedUrl: null,
  }
}

function slugifyCommunityName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function normalizeThemeColor(value) {
  const raw = String(value || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase()
  }

  return '#3b82f6'
}

const COMMUNITY_VISIBILITY_OPTIONS = new Set(['public', 'private'])
const COMMUNITY_JOIN_REQUEST_STATUS = new Set(['pending', 'approved', 'rejected'])
const COMMUNITY_MEMBER_ROLES = new Set(['owner', 'admin', 'moderator', 'member'])

function normalizeCommunityVisibility(value) {
  const raw = String(value || '').trim().toLowerCase()
  return COMMUNITY_VISIBILITY_OPTIONS.has(raw) ? raw : 'public'
}

function normalizeCommunityJoinRequestStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  return COMMUNITY_JOIN_REQUEST_STATUS.has(raw) ? raw : ''
}

function normalizeCommunityRole(value) {
  const raw = String(value || '').trim().toLowerCase()
  return COMMUNITY_MEMBER_ROLES.has(raw) ? raw : 'member'
}

function isCommunityManagerRole(role) {
  return role === 'owner' || role === 'admin'
}

function directSetupError() {
  return new Error(
    'Tabelas de direct nao encontradas. Rode novamente supabase/schema.sql para ativar mensagens privadas.',
  )
}

function storiesSetupError() {
  return new Error('Tabelas de stories nao encontradas. Rode novamente supabase/schema.sql para ativar stories.')
}

function communitiesSetupError() {
  return new Error('Tabelas de comunidades nao encontradas. Rode novamente supabase/schema.sql.')
}

function playlistsSetupError() {
  return new Error('Tabelas de playlists nao encontradas. Rode novamente supabase/schema.sql.')
}

function spotifyCapsuleSetupError() {
  return new Error('Tabelas da capsula Spotify nao encontradas. Rode novamente supabase/schema.sql.')
}

function risingArtistsSetupError() {
  return new Error('Tabelas de artistas em ascensao nao encontradas. Rode novamente supabase/schema.sql.')
}

function isMissingDirectRelation(error) {
  return (
    isMissingRelationError(error, 'direct_threads') ||
    isMissingRelationError(error, 'direct_thread_participants') ||
    isMissingRelationError(error, 'direct_messages')
  )
}

function isMissingStoriesRelation(error) {
  return isMissingRelationError(error, 'stories') || isMissingRelationError(error, 'story_views')
}

function isMissingCommunityRelation(error) {
  return (
    isMissingRelationError(error, 'communities') ||
    isMissingRelationError(error, 'community_memberships') ||
    isMissingRelationError(error, 'community_join_requests')
  )
}

function isMissingCommunityVisualColumns(error) {
  return (
    isMissingColumnError(error, 'genre') ||
    isMissingColumnError(error, 'avatar_url') ||
    isMissingColumnError(error, 'cover_url') ||
    isMissingColumnError(error, 'visibility') ||
    isMissingColumnError(error, 'requires_approval')
  )
}

function isMissingPlaylistRelation(error) {
  return isMissingRelationError(error, 'spotify_playlists') || isMissingRelationError(error, 'playlist_saves')
}

function isMissingSpotifyCapsuleRelation(error) {
  return isMissingRelationError(error, 'spotify_connections') || isMissingRelationError(error, 'spotify_capsule_snapshots')
}

function isMissingRisingArtistsRelation(error) {
  return (
    isMissingRelationError(error, 'rising_artists') ||
    isMissingRelationError(error, 'rising_artist_supports')
  )
}

const FEED_POST_SELECT = `
  id,
  user_id,
  content,
  mood,
  track_title,
  track_artist,
  spotify_url,
  spotify_type,
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
  const spotify = parseSpotifyData(row.spotify_url, row.spotify_type)

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
    spotify,
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
    const message = String(error.message || '').toLowerCase()
    const isInvalidRefreshToken =
      message.includes('invalid refresh token') ||
      message.includes('refresh token not found') ||
      message.includes('refresh_token_not_found')

    if (isInvalidRefreshToken) {
      // Limpa sessao local corrompida/expirada sem bloquear o app.
      await client.auth.signOut({ scope: 'local' }).catch(() => {})
      return null
    }

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

export function subscribeStories({ userId, onChange, onError }) {
  const client = requireSupabase()

  if (!userId) {
    return () => {}
  }

  const channel = client
    .channel(`stories-${userId}-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'stories',
      },
      (payload) => {
        onChange?.({
          type: 'story_insert',
          row: payload.new || null,
        })
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'story_views',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onChange?.({
          type: 'story_view',
          row: payload.new || null,
        })
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('Falha ao sincronizar stories em tempo real.'))
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

export async function signInWithGoogle({ redirectTo } = {}) {
  const client = requireSupabase()
  const fallbackRedirect =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo || fallbackRedirect,
      queryParams: {
        prompt: 'select_account',
      },
      skipBrowserRedirect: true,
    },
  })

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

export async function searchProfiles({ query, limit = 8, viewerUserId = '' }) {
  const client = requireSupabase()
  const normalized = String(query || '').trim()

  if (!normalized) {
    return []
  }

  const safeLimit = Math.max(1, Math.min(20, limit))
  const { data, error } = await client
    .from('profiles')
    .select('id, name, handle, bio, avatar_url, created_at')
    .or(`name.ilike.%${normalized}%,handle.ilike.%${normalizeHandle(normalized)}%`)
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) {
    throw error
  }

  return (data || [])
    .filter((row) => row.id !== viewerUserId)
    .map((row) => ({
      id: row.id,
      name: safeProfileName(row),
      handle: safeHandle(row),
      bio: safeBio(row),
      avatarUrl: safeAvatar(row),
      createdAt: row.created_at,
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

export async function fetchRisingArtists({ userId = '', limit = 60, genre = '', query = '' } = {}) {
  const client = requireSupabase()
  const safeLimit = Math.max(1, Math.min(120, Number(limit) || 60))
  const cleanGenre = String(genre || '').trim()
  const cleanQuery = String(query || '')
    .trim()
    .replace(/[(),]/g, ' ')
    .slice(0, 80)

  let request = client
    .from('rising_artists')
    .select(
      `
      id,
      user_id,
      stage_name,
      bio,
      genre,
      city,
      is_band,
      spotify_url,
      soundcloud_url,
      instagram_url,
      cover_url,
      is_active,
      created_at,
      updated_at,
      profiles:user_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(safeLimit)

  if (cleanGenre) {
    request = request.ilike('genre', cleanGenre)
  }

  if (cleanQuery) {
    request = request.or(`stage_name.ilike.%${cleanQuery}%,bio.ilike.%${cleanQuery}%,genre.ilike.%${cleanQuery}%,city.ilike.%${cleanQuery}%`)
  }

  const { data: artistRows, error: artistsError } = await request

  if (artistsError) {
    if (isMissingRisingArtistsRelation(artistsError)) {
      return []
    }
    throw artistsError
  }

  const rows = artistRows || []
  if (!rows.length) {
    return []
  }

  const artistIds = rows.map((row) => row.id)
  const { data: supportRows, error: supportsError } = await client
    .from('rising_artist_supports')
    .select('artist_id, user_id')
    .in('artist_id', artistIds)

  if (supportsError) {
    if (isMissingRisingArtistsRelation(supportsError)) {
      return rows.map((row) => mapRisingArtistRow(row, 0, false))
    }
    throw supportsError
  }

  const supportCountByArtist = new Map()
  const supportedByViewer = new Set()

  for (const row of supportRows || []) {
    supportCountByArtist.set(row.artist_id, (supportCountByArtist.get(row.artist_id) || 0) + 1)
    if (userId && row.user_id === userId) {
      supportedByViewer.add(row.artist_id)
    }
  }

  return rows
    .map((row) => mapRisingArtistRow(row, supportCountByArtist.get(row.id) || 0, supportedByViewer.has(row.id)))
    .sort((a, b) => {
      const diff = Number(b.supports || 0) - Number(a.supports || 0)
      if (diff !== 0) {
        return diff
      }
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    })
}

export async function upsertRisingArtist({
  userId,
  stageName,
  bio = '',
  genre = '',
  city = '',
  isBand = false,
  spotifyUrl = '',
  soundcloudUrl = '',
  instagramUrl = '',
  coverFile = null,
  coverUrl = '',
  isActive = true,
}) {
  const client = requireSupabase()
  const cleanStageName = String(stageName || '').trim()

  if (cleanStageName.length < 2) {
    throw new Error('Nome artistico precisa ter pelo menos 2 caracteres.')
  }

  let cleanCoverUrl = String(coverUrl || '').trim()
  if (coverFile) {
    const uploadedCover = await uploadMedia(userId, coverFile, 'rising-artists/cover')
    if (!uploadedCover || uploadedCover.type !== 'image') {
      throw new Error('A capa precisa ser uma imagem valida.')
    }
    cleanCoverUrl = uploadedCover.url
  }

  const payload = {
    user_id: userId,
    stage_name: cleanStageName.slice(0, 120),
    bio: String(bio || '').trim().slice(0, 500),
    genre: String(genre || '').trim().slice(0, 80),
    city: String(city || '').trim().slice(0, 80),
    is_band: Boolean(isBand),
    spotify_url: String(spotifyUrl || '').trim().slice(0, 500) || null,
    soundcloud_url: String(soundcloudUrl || '').trim().slice(0, 500) || null,
    instagram_url: String(instagramUrl || '').trim().slice(0, 500) || null,
    cover_url: cleanCoverUrl || null,
    is_active: Boolean(isActive),
    updated_at: new Date().toISOString(),
  }

  const { data: row, error } = await client
    .from('rising_artists')
    .upsert(payload, { onConflict: 'user_id' })
    .select(
      `
      id,
      user_id,
      stage_name,
      bio,
      genre,
      city,
      is_band,
      spotify_url,
      soundcloud_url,
      instagram_url,
      cover_url,
      is_active,
      created_at,
      updated_at,
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
    if (isMissingRisingArtistsRelation(error)) {
      throw risingArtistsSetupError()
    }
    throw error
  }

  const supports = await countByField('rising_artist_supports', 'artist_id', row.id, { fallbackZeroOnMissing: true })
  return mapRisingArtistRow(row, supports, false)
}

export async function toggleRisingArtistSupport({ artistId, userId }) {
  const client = requireSupabase()

  const { data: artistRow, error: artistError } = await client
    .from('rising_artists')
    .select('id, user_id, is_active')
    .eq('id', artistId)
    .maybeSingle()

  if (artistError) {
    if (isMissingRisingArtistsRelation(artistError)) {
      throw risingArtistsSetupError()
    }
    throw artistError
  }

  if (!artistRow || artistRow.is_active === false) {
    throw new Error('Artista nao encontrado.')
  }

  if (artistRow.user_id === userId) {
    const ownCount = await countByField('rising_artist_supports', 'artist_id', artistId, { fallbackZeroOnMissing: true })
    return { active: false, count: ownCount }
  }

  const { data: existing, error: existingError } = await client
    .from('rising_artist_supports')
    .select('artist_id, user_id')
    .eq('artist_id', artistId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingError) {
    if (isMissingRisingArtistsRelation(existingError)) {
      throw risingArtistsSetupError()
    }
    throw existingError
  }

  if (existing) {
    const { error: deleteError } = await client
      .from('rising_artist_supports')
      .delete()
      .eq('artist_id', artistId)
      .eq('user_id', userId)

    if (deleteError) {
      if (isMissingRisingArtistsRelation(deleteError)) {
        throw risingArtistsSetupError()
      }
      throw deleteError
    }
  } else {
    const { error: insertError } = await client.from('rising_artist_supports').insert({
      artist_id: artistId,
      user_id: userId,
    })

    if (insertError) {
      if (isMissingRisingArtistsRelation(insertError)) {
        throw risingArtistsSetupError()
      }
      throw insertError
    }
  }

  const count = await countByField('rising_artist_supports', 'artist_id', artistId, { fallbackZeroOnMissing: true })
  return { active: !existing, count }
}

function mapCommunityRow(row, members = 0, joined = false, myRole = '', joinRequestStatus = '') {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    themeColor: row.theme_color || '#3b82f6',
    genre: row.genre || '',
    avatarUrl: row.avatar_url || '',
    coverUrl: row.cover_url || '',
    visibility: normalizeCommunityVisibility(row.visibility),
    requiresApproval: Boolean(row.requires_approval),
    creatorId: row.creator_id,
    creatorName: safeProfileName(row.profiles),
    creatorHandle: safeHandle(row.profiles),
    members,
    joined,
    myRole: joined ? normalizeCommunityRole(myRole || 'member') : '',
    joinRequestStatus: joined ? '' : normalizeCommunityJoinRequestStatus(joinRequestStatus),
    createdAt: row.created_at,
  }
}

function mapSpotifyPlaylistRow(row, saves = 0, saved = false) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    spotifyUrl: row.spotify_url,
    spotifyType: row.spotify_type || 'playlist',
    creatorId: row.creator_id,
    creatorName: safeProfileName(row.profiles),
    creatorHandle: safeHandle(row.profiles),
    saves,
    saved,
    createdAt: row.created_at,
    sampleTrack: null,
  }
}

function mapSpotifyConnectionRow(row) {
  if (!row) {
    return null
  }

  return {
    userId: row.user_id,
    spotifyUserId: row.spotify_user_id,
    displayName: row.display_name || '',
    avatarUrl: row.avatar_url || null,
    country: row.country || '',
    product: row.product || '',
    connectedAt: row.connected_at || null,
    updatedAt: row.updated_at || null,
    lastSyncedAt: row.last_synced_at || null,
  }
}

function mapSpotifyCapsuleSnapshot(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    period: row.period || '4_weeks',
    score: Number(row.score || 0),
    topTracks: Array.isArray(row.top_tracks) ? row.top_tracks : [],
    topArtists: Array.isArray(row.top_artists) ? row.top_artists : [],
    recentPlays: Number(row.recent_plays || 0),
    minutesEstimate: Number(row.minutes_estimate || 0),
    createdAt: row.created_at || null,
    user: row.profiles
      ? {
          id: row.profiles.id || row.user_id,
          name: safeProfileName(row.profiles),
          handle: safeHandle(row.profiles),
          avatarUrl: safeAvatar(row.profiles),
        }
      : null,
  }
}

function mapRisingArtistRow(row, supports = 0, supported = false) {
  return {
    id: row.id,
    userId: row.user_id,
    stageName: row.stage_name || safeProfileName(row.profiles),
    bio: row.bio || '',
    genre: row.genre || '',
    city: row.city || '',
    isBand: Boolean(row.is_band),
    spotifyUrl: row.spotify_url || '',
    soundcloudUrl: row.soundcloud_url || '',
    instagramUrl: row.instagram_url || '',
    coverUrl: row.cover_url || '',
    isActive: row.is_active !== false,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    supports: Number(supports || 0),
    supported: Boolean(supported),
    user: row.profiles
      ? {
          id: row.profiles.id || row.user_id,
          name: safeProfileName(row.profiles),
          handle: safeHandle(row.profiles),
          avatarUrl: safeAvatar(row.profiles),
        }
      : null,
  }
}

async function countCommunityMembers(communityId) {
  const client = requireSupabase()

  const { count, error } = await client
    .from('community_memberships')
    .select('*', { head: true, count: 'exact' })
    .eq('community_id', communityId)

  if (error) {
    if (isMissingCommunityRelation(error)) {
      throw communitiesSetupError()
    }
    throw error
  }

  return count || 0
}

export async function fetchCommunities({ userId = '', limit = 40 }) {
  const client = requireSupabase()
  const safeLimit = Math.max(1, Math.min(80, limit))

  let { data: communityRows, error: communitiesError } = await client
    .from('communities')
    .select(
      `
      id,
      creator_id,
      name,
      slug,
      description,
      theme_color,
      genre,
      avatar_url,
      cover_url,
      visibility,
      requires_approval,
      created_at,
      profiles:creator_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (communitiesError && isMissingCommunityVisualColumns(communitiesError)) {
    const fallback = await client
      .from('communities')
      .select(
        `
        id,
        creator_id,
        name,
        slug,
        description,
        theme_color,
        created_at,
        profiles:creator_id (
          id,
          name,
          handle,
          avatar_url
        )
      `,
      )
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    communityRows = fallback.data
    communitiesError = fallback.error
  }

  if (communitiesError) {
    if (isMissingCommunityRelation(communitiesError)) {
      return []
    }
    throw communitiesError
  }

  const rows = communityRows || []
  if (!rows.length) {
    return []
  }

  const communityIds = rows.map((row) => row.id)
  const { data: membershipRows, error: membershipsError } = await client
    .from('community_memberships')
    .select('community_id, user_id, role')
    .in('community_id', communityIds)

  if (membershipsError) {
    if (isMissingCommunityRelation(membershipsError)) {
      return rows.map((row) => mapCommunityRow(row, 0, false, '', ''))
    }
    throw membershipsError
  }

  const membersCountByCommunity = new Map()
  const joinedSet = new Set()
  const roleByCommunity = new Map()
  for (const row of membershipRows || []) {
    membersCountByCommunity.set(row.community_id, (membersCountByCommunity.get(row.community_id) || 0) + 1)
    if (userId && row.user_id === userId) {
      joinedSet.add(row.community_id)
      roleByCommunity.set(row.community_id, normalizeCommunityRole(row.role))
    }
  }

  const requestStatusByCommunity = new Map()
  if (userId) {
    const { data: joinRequestRows, error: joinRequestsError } = await client
      .from('community_join_requests')
      .select('community_id, status')
      .eq('user_id', userId)
      .in('community_id', communityIds)

    if (joinRequestsError && !isMissingCommunityRelation(joinRequestsError)) {
      throw joinRequestsError
    }

    for (const row of joinRequestRows || []) {
      requestStatusByCommunity.set(row.community_id, normalizeCommunityJoinRequestStatus(row.status))
    }
  }

  return rows.map((row) =>
    mapCommunityRow(
      row,
      membersCountByCommunity.get(row.id) || 0,
      joinedSet.has(row.id),
      roleByCommunity.get(row.id) || '',
      requestStatusByCommunity.get(row.id) || '',
    ),
  )
}

export async function createCommunity({
  userId,
  name,
  description = '',
  themeColor = '#3b82f6',
  visibility = 'public',
  requiresApproval = false,
}) {
  const client = requireSupabase()
  const cleanName = String(name || '').trim()
  const cleanDescription = String(description || '').trim().slice(0, 500)
  const normalizedVisibility = normalizeCommunityVisibility(visibility)
  const normalizedRequiresApproval = Boolean(requiresApproval)

  if (cleanName.length < 3) {
    throw new Error('Nome da comunidade precisa ter ao menos 3 caracteres.')
  }

  const baseSlug = slugifyCommunityName(cleanName) || `comunidade-${Math.floor(Math.random() * 10000)}`
  let insertedRow = null

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${Math.floor(Math.random() * 900 + 100)}`
    const slug = `${baseSlug}${suffix}`.slice(0, 60)

    const { data, error } = await client
      .from('communities')
      .insert({
        creator_id: userId,
        name: cleanName,
        slug,
        description: cleanDescription,
        theme_color: normalizeThemeColor(themeColor),
        visibility: normalizedVisibility,
        requires_approval: normalizedRequiresApproval,
      })
      .select(
        `
        id,
        creator_id,
        name,
        slug,
        description,
        theme_color,
        visibility,
        requires_approval,
        created_at,
        profiles:creator_id (
          id,
          name,
          handle,
          avatar_url
        )
      `,
      )
      .single()

    if (!error) {
      insertedRow = data
      break
    }

    if (isMissingColumnError(error, 'visibility') || isMissingColumnError(error, 'requires_approval')) {
      const legacyInsert = await client
        .from('communities')
        .insert({
          creator_id: userId,
          name: cleanName,
          slug,
          description: cleanDescription,
          theme_color: normalizeThemeColor(themeColor),
        })
        .select(
          `
          id,
          creator_id,
          name,
          slug,
          description,
          theme_color,
          created_at,
          profiles:creator_id (
            id,
            name,
            handle,
            avatar_url
          )
        `,
        )
        .single()

      if (!legacyInsert.error) {
        insertedRow = legacyInsert.data
        break
      }

      if (legacyInsert.error?.code === '23505') {
        continue
      }

      throw legacyInsert.error
    }

    if (isMissingCommunityRelation(error)) {
      throw communitiesSetupError()
    }

    if (error.code === '23505') {
      continue
    }

    throw error
  }

  if (!insertedRow) {
    throw new Error('Nao foi possivel criar comunidade com esse nome agora.')
  }

  const { error: ownerError } = await client.from('community_memberships').insert({
    community_id: insertedRow.id,
    user_id: userId,
    role: 'owner',
  })

  if (ownerError && ownerError.code !== '23505') {
    if (isMissingCommunityRelation(ownerError)) {
      throw communitiesSetupError()
    }
    throw ownerError
  }

  return mapCommunityRow(insertedRow, 1, true, 'owner', '')
}

export async function updateCommunity({
  communityId,
  userId,
  name,
  description = '',
  themeColor = '#3b82f6',
  genre = '',
  avatarFile = null,
  coverFile = null,
  avatarUrl = '',
  coverUrl = '',
  visibility = 'public',
  requiresApproval = false,
}) {
  const client = requireSupabase()
  const cleanName = String(name || '').trim()
  const cleanDescription = String(description || '').trim().slice(0, 500)
  const cleanGenre = String(genre || '').trim().slice(0, 80)
  let cleanAvatarUrl = String(avatarUrl || '').trim()
  let cleanCoverUrl = String(coverUrl || '').trim()
  const normalizedVisibility = normalizeCommunityVisibility(visibility)
  const normalizedRequiresApproval = Boolean(requiresApproval)

  if (cleanName.length < 3) {
    throw new Error('Nome da comunidade precisa ter ao menos 3 caracteres.')
  }

  if (avatarFile) {
    const uploadedAvatar = await uploadMedia(userId, avatarFile, 'communities/avatar')
    if (!uploadedAvatar || uploadedAvatar.type !== 'image') {
      throw new Error('Foto da comunidade precisa ser uma imagem valida.')
    }
    cleanAvatarUrl = uploadedAvatar.url
  }

  if (coverFile) {
    const uploadedCover = await uploadMedia(userId, coverFile, 'communities/cover')
    if (!uploadedCover || uploadedCover.type !== 'image') {
      throw new Error('Capa da comunidade precisa ser uma imagem valida.')
    }
    cleanCoverUrl = uploadedCover.url
  }

  let { data, error } = await client
    .from('communities')
    .update({
      name: cleanName,
      description: cleanDescription,
      theme_color: normalizeThemeColor(themeColor),
      genre: cleanGenre || null,
      avatar_url: cleanAvatarUrl || null,
      cover_url: cleanCoverUrl || null,
      visibility: normalizedVisibility,
      requires_approval: normalizedRequiresApproval,
    })
    .eq('id', communityId)
    .eq('creator_id', userId)
    .select(
      `
      id,
      creator_id,
      name,
      slug,
      description,
      theme_color,
      genre,
      avatar_url,
      cover_url,
      visibility,
      requires_approval,
      created_at,
      profiles:creator_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .single()

  if (error && isMissingCommunityVisualColumns(error)) {
    const fallback = await client
      .from('communities')
      .update({
        name: cleanName,
        description: cleanDescription,
        theme_color: normalizeThemeColor(themeColor),
      })
      .eq('id', communityId)
      .eq('creator_id', userId)
      .select(
        `
        id,
        creator_id,
        name,
        slug,
        description,
        theme_color,
        created_at,
        profiles:creator_id (
          id,
          name,
          handle,
          avatar_url
        )
      `,
      )
      .single()

    data = fallback.data
    error = fallback.error
  }

  if (error) {
    if (isMissingCommunityRelation(error)) {
      throw communitiesSetupError()
    }
    throw error
  }

  return mapCommunityRow(data, 0, true, 'owner', '')
}

export async function toggleCommunityMembership({ communityId, userId }) {
  const client = requireSupabase()

  const { data: existing, error: existingError } = await client
    .from('community_memberships')
    .select('community_id, user_id, role')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingError) {
    if (isMissingCommunityRelation(existingError)) {
      throw communitiesSetupError()
    }
    throw existingError
  }

  if (existing?.role === 'owner') {
    return {
      joined: true,
      members: await countCommunityMembers(communityId),
      myRole: 'owner',
      joinRequestStatus: '',
    }
  }

  if (existing) {
    const { error: deleteError } = await client
      .from('community_memberships')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', userId)

    if (deleteError) {
      if (isMissingCommunityRelation(deleteError)) {
        throw communitiesSetupError()
      }
      throw deleteError
    }
  } else {
    const { error: insertError } = await client.from('community_memberships').insert({
      community_id: communityId,
      user_id: userId,
      role: 'member',
    })

    if (insertError) {
      if (isMissingCommunityRelation(insertError)) {
        throw communitiesSetupError()
      }
      throw insertError
    }
  }

  const members = await countCommunityMembers(communityId)
  return {
    joined: !existing,
    members,
    myRole: existing ? '' : 'member',
    joinRequestStatus: '',
  }
}

export async function requestCommunityJoin({ communityId, userId }) {
  const client = requireSupabase()

  const { data: existingMembership, error: membershipError } = await client
    .from('community_memberships')
    .select('community_id, user_id')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipError) {
    if (isMissingCommunityRelation(membershipError)) {
      throw communitiesSetupError()
    }
    throw membershipError
  }

  if (existingMembership) {
    return {
      joined: true,
      status: 'approved',
      members: await countCommunityMembers(communityId),
    }
  }

  const { data: existingRequest, error: existingRequestError } = await client
    .from('community_join_requests')
    .select('id, status')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingRequestError) {
    if (isMissingCommunityRelation(existingRequestError)) {
      throw communitiesSetupError()
    }
    throw existingRequestError
  }

  if (existingRequest?.status === 'pending') {
    return {
      joined: false,
      status: 'pending',
    }
  }

  const payload = {
    community_id: communityId,
    user_id: userId,
    status: 'pending',
    reviewed_at: null,
    reviewed_by: null,
  }

  const { error: upsertError } = await client
    .from('community_join_requests')
    .upsert(payload, { onConflict: 'community_id,user_id' })

  if (upsertError) {
    if (isMissingCommunityRelation(upsertError)) {
      throw communitiesSetupError()
    }
    throw upsertError
  }

  return {
    joined: false,
    status: 'pending',
  }
}

export async function fetchCommunityMembers({ communityId }) {
  const client = requireSupabase()

  const { data: rows, error } = await client
    .from('community_memberships')
    .select(
      `
      community_id,
      user_id,
      role,
      created_at,
      profiles:user_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .eq('community_id', communityId)

  if (error) {
    if (isMissingCommunityRelation(error)) {
      return []
    }
    throw error
  }

  const roleWeight = { owner: 0, admin: 1, moderator: 2, member: 3 }

  return (rows || [])
    .map((row) => ({
      communityId: row.community_id,
      userId: row.user_id,
      role: normalizeCommunityRole(row.role),
      createdAt: row.created_at || null,
      user: {
        id: row.profiles?.id || row.user_id,
        name: safeProfileName(row.profiles),
        handle: safeHandle(row.profiles),
        avatarUrl: safeAvatar(row.profiles),
      },
    }))
    .sort((a, b) => {
      const diff = (roleWeight[a.role] ?? 99) - (roleWeight[b.role] ?? 99)
      if (diff !== 0) {
        return diff
      }
      return a.user.name.localeCompare(b.user.name)
    })
}

export async function updateCommunityMemberRole({
  communityId,
  actorUserId,
  targetUserId,
  role,
}) {
  const client = requireSupabase()
  const nextRole = normalizeCommunityRole(role)

  if (nextRole === 'owner') {
    throw new Error('Transferencia de ownership nao suportada por este fluxo.')
  }

  const { data: actorMembership, error: actorError } = await client
    .from('community_memberships')
    .select('community_id, user_id, role')
    .eq('community_id', communityId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (actorError) {
    if (isMissingCommunityRelation(actorError)) {
      throw communitiesSetupError()
    }
    throw actorError
  }

  const actorRole = normalizeCommunityRole(actorMembership?.role || '')
  if (!isCommunityManagerRole(actorRole)) {
    throw new Error('Sem permissao para alterar cargos nesta comunidade.')
  }

  const { data: targetMembership, error: targetError } = await client
    .from('community_memberships')
    .select('community_id, user_id, role')
    .eq('community_id', communityId)
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (targetError) {
    if (isMissingCommunityRelation(targetError)) {
      throw communitiesSetupError()
    }
    throw targetError
  }

  if (!targetMembership) {
    throw new Error('Membro nao encontrado nesta comunidade.')
  }

  const targetRole = normalizeCommunityRole(targetMembership.role)
  if (targetRole === 'owner') {
    throw new Error('O dono da comunidade nao pode ser alterado aqui.')
  }

  if (actorRole !== 'owner' && (targetRole === 'admin' || nextRole === 'admin')) {
    throw new Error('Apenas o owner pode promover/rebaixar administradores.')
  }

  const { error: updateError } = await client
    .from('community_memberships')
    .update({ role: nextRole })
    .eq('community_id', communityId)
    .eq('user_id', targetUserId)

  if (updateError) {
    if (isMissingCommunityRelation(updateError)) {
      throw communitiesSetupError()
    }
    throw updateError
  }

  return { role: nextRole }
}

export async function fetchCommunityJoinRequests({ communityId, userId }) {
  const client = requireSupabase()

  const { data: actorMembership, error: actorError } = await client
    .from('community_memberships')
    .select('community_id, user_id, role')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle()

  if (actorError) {
    if (isMissingCommunityRelation(actorError)) {
      throw communitiesSetupError()
    }
    throw actorError
  }

  const actorRole = normalizeCommunityRole(actorMembership?.role || '')
  if (!isCommunityManagerRole(actorRole)) {
    return []
  }

  const { data: rows, error } = await client
    .from('community_join_requests')
    .select(
      `
      id,
      community_id,
      user_id,
      status,
      created_at,
      reviewed_at,
      reviewed_by,
      profiles:user_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .eq('community_id', communityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingCommunityRelation(error)) {
      return []
    }
    throw error
  }

  return (rows || []).map((row) => ({
    id: row.id,
    communityId: row.community_id,
    userId: row.user_id,
    status: normalizeCommunityJoinRequestStatus(row.status) || 'pending',
    createdAt: row.created_at || null,
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    user: {
      id: row.profiles?.id || row.user_id,
      name: safeProfileName(row.profiles),
      handle: safeHandle(row.profiles),
      avatarUrl: safeAvatar(row.profiles),
    },
  }))
}

export async function reviewCommunityJoinRequest({
  requestId,
  communityId,
  reviewerUserId,
  decision,
}) {
  const client = requireSupabase()
  const normalizedDecision = normalizeCommunityJoinRequestStatus(decision)

  if (normalizedDecision !== 'approved' && normalizedDecision !== 'rejected') {
    throw new Error('Decisao invalida para solicitacao.')
  }

  const { data: actorMembership, error: actorError } = await client
    .from('community_memberships')
    .select('community_id, user_id, role')
    .eq('community_id', communityId)
    .eq('user_id', reviewerUserId)
    .maybeSingle()

  if (actorError) {
    if (isMissingCommunityRelation(actorError)) {
      throw communitiesSetupError()
    }
    throw actorError
  }

  const actorRole = normalizeCommunityRole(actorMembership?.role || '')
  if (!isCommunityManagerRole(actorRole)) {
    throw new Error('Sem permissao para revisar solicitacoes.')
  }

  const { data: requestRow, error: requestError } = await client
    .from('community_join_requests')
    .select('id, community_id, user_id, status')
    .eq('id', requestId)
    .eq('community_id', communityId)
    .maybeSingle()

  if (requestError) {
    if (isMissingCommunityRelation(requestError)) {
      throw communitiesSetupError()
    }
    throw requestError
  }

  if (!requestRow) {
    throw new Error('Solicitacao nao encontrada.')
  }

  if (normalizedDecision === 'approved') {
    const { error: insertMembershipError } = await client
      .from('community_memberships')
      .upsert(
        {
          community_id: communityId,
          user_id: requestRow.user_id,
          role: 'member',
        },
        { onConflict: 'community_id,user_id' },
      )

    if (insertMembershipError) {
      if (isMissingCommunityRelation(insertMembershipError)) {
        throw communitiesSetupError()
      }
      throw insertMembershipError
    }
  }

  const { error: updateRequestError } = await client
    .from('community_join_requests')
    .update({
      status: normalizedDecision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerUserId,
    })
    .eq('id', requestId)
    .eq('community_id', communityId)

  if (updateRequestError) {
    if (isMissingCommunityRelation(updateRequestError)) {
      throw communitiesSetupError()
    }
    throw updateRequestError
  }

  return {
    status: normalizedDecision,
    members: await countCommunityMembers(communityId),
    userId: requestRow.user_id,
  }
}

export async function fetchCommunitySpotifyLeaderboards({ communityIds = [], period = '4_weeks', limit = 3 }) {
  const client = requireSupabase()
  const safeCommunityIds = Array.from(new Set((communityIds || []).filter(Boolean))).slice(0, 80)
  const safeLimit = Math.max(1, Math.min(10, limit))
  const normalizedPeriod = normalizeCapsulePeriod(period)

  if (!safeCommunityIds.length) {
    return {}
  }

  const { data: membershipsRows, error: membershipsError } = await client
    .from('community_memberships')
    .select('community_id, user_id')
    .in('community_id', safeCommunityIds)

  if (membershipsError) {
    if (isMissingCommunityRelation(membershipsError)) {
      return {}
    }
    throw membershipsError
  }

  const memberRows = membershipsRows || []
  const usersByCommunity = new Map()
  for (const row of memberRows) {
    const current = usersByCommunity.get(row.community_id) || []
    current.push(row.user_id)
    usersByCommunity.set(row.community_id, current)
  }

  const allUserIds = Array.from(new Set(memberRows.map((row) => row.user_id)))
  if (!allUserIds.length) {
    return Object.fromEntries(safeCommunityIds.map((communityId) => [communityId, []]))
  }

  const { data: snapshotRows, error: snapshotsError } = await client
    .from('spotify_capsule_snapshots')
    .select(
      `
      id,
      user_id,
      period,
      score,
      top_tracks,
      top_artists,
      recent_plays,
      minutes_estimate,
      created_at,
      profiles:user_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .eq('period', normalizedPeriod)
    .in('user_id', allUserIds)
    .order('created_at', { ascending: false })
    .limit(Math.max(300, allUserIds.length * 4))

  if (snapshotsError) {
    if (isMissingSpotifyCapsuleRelation(snapshotsError)) {
      return Object.fromEntries(safeCommunityIds.map((communityId) => [communityId, []]))
    }
    throw snapshotsError
  }

  const latestByUser = new Map()
  for (const row of snapshotRows || []) {
    if (!latestByUser.has(row.user_id)) {
      latestByUser.set(row.user_id, row)
    }
  }

  const leaderboardByCommunity = {}
  for (const communityId of safeCommunityIds) {
    const userIds = usersByCommunity.get(communityId) || []
    const entries = userIds
      .map((userId) => latestByUser.get(userId))
      .filter(Boolean)
      .map((row) => mapSpotifyCapsuleSnapshot(row))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
      .slice(0, safeLimit)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }))

    leaderboardByCommunity[communityId] = entries
  }

  return leaderboardByCommunity
}

export async function fetchSpotifyPlaylists({ userId = '', limit = 40 }) {
  const client = requireSupabase()
  const safeLimit = Math.max(1, Math.min(80, limit))

  const { data: playlistRows, error: playlistsError } = await client
    .from('spotify_playlists')
    .select(
      `
      id,
      creator_id,
      title,
      description,
      spotify_url,
      spotify_type,
      created_at,
      profiles:creator_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (playlistsError) {
    if (isMissingPlaylistRelation(playlistsError)) {
      return []
    }
    throw playlistsError
  }

  const rows = playlistRows || []
  if (!rows.length) {
    return []
  }

  const playlistIds = rows.map((row) => row.id)
  const { data: saveRows, error: savesError } = await client
    .from('playlist_saves')
    .select('playlist_id, user_id')
    .in('playlist_id', playlistIds)

  if (savesError) {
    if (isMissingPlaylistRelation(savesError)) {
      return rows.map((row) => mapSpotifyPlaylistRow(row, 0, false))
    }
    throw savesError
  }

  const savesCountByPlaylist = new Map()
  const savedSet = new Set()
  for (const row of saveRows || []) {
    savesCountByPlaylist.set(row.playlist_id, (savesCountByPlaylist.get(row.playlist_id) || 0) + 1)
    if (userId && row.user_id === userId) {
      savedSet.add(row.playlist_id)
    }
  }

  return rows.map((row) => mapSpotifyPlaylistRow(row, savesCountByPlaylist.get(row.id) || 0, savedSet.has(row.id)))
}

export async function createSpotifyPlaylist({ userId, title, description = '', spotifyUrl }) {
  const client = requireSupabase()
  const spotify = parseSpotifyData(spotifyUrl)

  if (!spotify || spotify.type !== 'playlist') {
    throw new Error('Use um link valido de playlist do Spotify.')
  }

  const cleanTitle = String(title || '').trim().slice(0, 120) || 'Playlist personalizada'
  const cleanDescription = String(description || '').trim().slice(0, 500)

  const { data: playlistRow, error: playlistError } = await client
    .from('spotify_playlists')
    .insert({
      creator_id: userId,
      title: cleanTitle,
      description: cleanDescription,
      spotify_url: spotify.url,
      spotify_type: 'playlist',
    })
    .select(
      `
      id,
      creator_id,
      title,
      description,
      spotify_url,
      spotify_type,
      created_at,
      profiles:creator_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .single()

  if (playlistError) {
    if (isMissingPlaylistRelation(playlistError)) {
      throw playlistsSetupError()
    }
    throw playlistError
  }

  const { error: saveError } = await client.from('playlist_saves').insert({
    playlist_id: playlistRow.id,
    user_id: userId,
  })

  if (saveError && saveError.code !== '23505') {
    if (isMissingPlaylistRelation(saveError)) {
      throw playlistsSetupError()
    }
    throw saveError
  }

  return mapSpotifyPlaylistRow(playlistRow, 1, true)
}

export async function toggleSaveSpotifyPlaylist({ playlistId, userId }) {
  const client = requireSupabase()

  const { data: existing, error: existingError } = await client
    .from('playlist_saves')
    .select('playlist_id, user_id')
    .eq('playlist_id', playlistId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingError) {
    if (isMissingPlaylistRelation(existingError)) {
      throw playlistsSetupError()
    }
    throw existingError
  }

  if (existing) {
    const { error: deleteError } = await client
      .from('playlist_saves')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('user_id', userId)

    if (deleteError) {
      if (isMissingPlaylistRelation(deleteError)) {
        throw playlistsSetupError()
      }
      throw deleteError
    }
  } else {
    const { error: insertError } = await client.from('playlist_saves').insert({
      playlist_id: playlistId,
      user_id: userId,
    })

    if (insertError) {
      if (isMissingPlaylistRelation(insertError)) {
        throw playlistsSetupError()
      }
      throw insertError
    }
  }

  const { count, error: countError } = await client
    .from('playlist_saves')
    .select('*', { head: true, count: 'exact' })
    .eq('playlist_id', playlistId)

  if (countError) {
    if (isMissingPlaylistRelation(countError)) {
      throw playlistsSetupError()
    }
    throw countError
  }

  return {
    saved: !existing,
    saves: count || 0,
  }
}

const SPOTIFY_CAPSULE_PERIODS = new Set(['4_weeks', '6_months', 'all_time'])

function normalizeCapsulePeriod(value) {
  const period = String(value || '').trim()
  if (SPOTIFY_CAPSULE_PERIODS.has(period)) {
    return period
  }

  return '4_weeks'
}

function sanitizeCapsuleRows(items, limit = 10) {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .slice(0, Math.max(1, Math.min(20, limit)))
    .map((item) => {
      const row = item && typeof item === 'object' ? item : {}
      return {
        id: String(row.id || ''),
        name: String(row.name || '').slice(0, 160),
        artist: String(row.artist || '').slice(0, 160),
        imageUrl: row.imageUrl ? String(row.imageUrl) : '',
        externalUrl: row.externalUrl ? String(row.externalUrl) : '',
        popularity: Number.isFinite(Number(row.popularity)) ? Math.max(0, Math.min(100, Number(row.popularity))) : 0,
      }
    })
}

export async function fetchSpotifyConnection({ userId }) {
  if (!userId) {
    return null
  }

  const client = requireSupabase()
  const { data, error } = await client
    .from('spotify_connections')
    .select('user_id, spotify_user_id, display_name, avatar_url, country, product, connected_at, updated_at, last_synced_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingSpotifyCapsuleRelation(error)) {
      return null
    }
    throw error
  }

  return mapSpotifyConnectionRow(data)
}

export async function upsertSpotifyConnection({
  userId,
  spotifyUserId,
  displayName = '',
  avatarUrl = '',
  country = '',
  product = '',
  lastSyncedAt = null,
}) {
  const client = requireSupabase()

  if (!userId || !spotifyUserId) {
    throw new Error('Conta Spotify invalida.')
  }

  const payload = {
    user_id: userId,
    spotify_user_id: String(spotifyUserId).trim(),
    display_name: String(displayName || '').trim().slice(0, 180) || null,
    avatar_url: String(avatarUrl || '').trim() || null,
    country: String(country || '').trim().slice(0, 8) || null,
    product: String(product || '').trim().slice(0, 24) || null,
    updated_at: new Date().toISOString(),
    last_synced_at: lastSyncedAt || null,
  }

  const { data, error } = await client
    .from('spotify_connections')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, spotify_user_id, display_name, avatar_url, country, product, connected_at, updated_at, last_synced_at')
    .single()

  if (error) {
    if (isMissingSpotifyCapsuleRelation(error)) {
      throw spotifyCapsuleSetupError()
    }
    throw error
  }

  return mapSpotifyConnectionRow(data)
}

export async function createSpotifyCapsuleSnapshot({
  userId,
  period = '4_weeks',
  score = 0,
  topTracks = [],
  topArtists = [],
  recentPlays = 0,
  minutesEstimate = 0,
}) {
  const client = requireSupabase()
  const normalizedPeriod = normalizeCapsulePeriod(period)

  const { data, error } = await client
    .from('spotify_capsule_snapshots')
    .insert({
      user_id: userId,
      period: normalizedPeriod,
      score: Math.max(0, Math.round(Number(score) || 0)),
      top_tracks: sanitizeCapsuleRows(topTracks, 12),
      top_artists: sanitizeCapsuleRows(topArtists, 12),
      recent_plays: Math.max(0, Math.round(Number(recentPlays) || 0)),
      minutes_estimate: Math.max(0, Math.round(Number(minutesEstimate) || 0)),
    })
    .select(
      `
      id,
      user_id,
      period,
      score,
      top_tracks,
      top_artists,
      recent_plays,
      minutes_estimate,
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
    if (isMissingSpotifyCapsuleRelation(error)) {
      throw spotifyCapsuleSetupError()
    }
    throw error
  }

  return mapSpotifyCapsuleSnapshot(data)
}

export async function fetchLatestSpotifyCapsule({ userId, period = '4_weeks' }) {
  if (!userId) {
    return null
  }

  const client = requireSupabase()
  const normalizedPeriod = normalizeCapsulePeriod(period)
  const { data, error } = await client
    .from('spotify_capsule_snapshots')
    .select(
      `
      id,
      user_id,
      period,
      score,
      top_tracks,
      top_artists,
      recent_plays,
      minutes_estimate,
      created_at,
      profiles:user_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .eq('user_id', userId)
    .eq('period', normalizedPeriod)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingSpotifyCapsuleRelation(error)) {
      return null
    }
    throw error
  }

  return mapSpotifyCapsuleSnapshot(data)
}

export async function fetchSpotifyCapsuleLeaderboard({ period = '4_weeks', limit = 20 }) {
  const client = requireSupabase()
  const normalizedPeriod = normalizeCapsulePeriod(period)
  const safeLimit = Math.max(1, Math.min(50, limit))

  const { data, error } = await client
    .from('spotify_capsule_snapshots')
    .select(
      `
      id,
      user_id,
      period,
      score,
      top_tracks,
      top_artists,
      recent_plays,
      minutes_estimate,
      created_at,
      profiles:user_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .eq('period', normalizedPeriod)
    .order('created_at', { ascending: false })
    .limit(350)

  if (error) {
    if (isMissingSpotifyCapsuleRelation(error)) {
      return []
    }
    throw error
  }

  const latestByUser = new Map()
  for (const row of data || []) {
    if (!latestByUser.has(row.user_id)) {
      latestByUser.set(row.user_id, row)
    }
  }

  return Array.from(latestByUser.values())
    .map((row) => mapSpotifyCapsuleSnapshot(row))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
    .slice(0, safeLimit)
}

export async function deleteSpotifyConnection({ userId }) {
  if (!userId) {
    return
  }

  const client = requireSupabase()
  const { error } = await client.from('spotify_connections').delete().eq('user_id', userId)

  if (error) {
    if (isMissingSpotifyCapsuleRelation(error)) {
      throw spotifyCapsuleSetupError()
    }
    throw error
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

function mapStory(row, viewedSet = new Set(), viewerUserId = '') {
  return {
    id: row.id,
    userId: row.user_id,
    user: {
      id: row.profiles?.id || row.user_id,
      name: safeProfileName(row.profiles),
      handle: safeHandle(row.profiles),
      avatarUrl: safeAvatar(row.profiles),
    },
    text: row.content || '',
    track: row.track_title && row.track_artist ? { title: row.track_title, artist: row.track_artist } : null,
    media: row.media_url
      ? {
          url: row.media_url,
          type: row.media_type || 'image',
        }
      : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    viewed: row.user_id === viewerUserId ? true : viewedSet.has(row.id),
    own: row.user_id === viewerUserId,
  }
}

function sortStoryGroups(groups) {
  return [...groups].sort((a, b) => {
    if (a.own !== b.own) {
      return a.own ? -1 : 1
    }

    if (a.hasUnviewed !== b.hasUnviewed) {
      return a.hasUnviewed ? -1 : 1
    }

    return new Date(b.latestAt) - new Date(a.latestAt)
  })
}

export async function fetchActiveStories({ viewerUserId }) {
  const client = requireSupabase()

  const { data: storyRows, error: storiesError } = await client
    .from('stories')
    .select(
      `
      id,
      user_id,
      content,
      track_title,
      track_artist,
      media_url,
      media_type,
      created_at,
      expires_at,
      profiles:user_id (
        id,
        name,
        handle,
        avatar_url
      )
    `,
    )
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(250)

  if (storiesError) {
    if (isMissingStoriesRelation(storiesError)) {
      return []
    }

    throw storiesError
  }

  const rows = storyRows || []
  if (!rows.length) {
    return []
  }

  const storyIds = rows.map((row) => row.id)
  let viewedSet = new Set()

  if (viewerUserId) {
    const { data: viewRows, error: viewsError } = await client
      .from('story_views')
      .select('story_id')
      .eq('user_id', viewerUserId)
      .in('story_id', storyIds)

    if (viewsError && !isMissingStoriesRelation(viewsError)) {
      throw viewsError
    }

    viewedSet = new Set((viewRows || []).map((row) => row.story_id))
  }

  const groupMap = new Map()
  for (const row of rows) {
    const mapped = mapStory(row, viewedSet, viewerUserId)
    const existing = groupMap.get(mapped.userId)

    if (existing) {
      existing.items.push(mapped)
      if (new Date(mapped.createdAt) > new Date(existing.latestAt)) {
        existing.latestAt = mapped.createdAt
      }
      existing.hasUnviewed = existing.hasUnviewed || !mapped.viewed
    } else {
      groupMap.set(mapped.userId, {
        userId: mapped.userId,
        user: mapped.user,
        own: mapped.own,
        latestAt: mapped.createdAt,
        hasUnviewed: !mapped.viewed,
        items: [mapped],
      })
    }
  }

  return sortStoryGroups(Array.from(groupMap.values()))
}

export async function markStoryViewed({ storyId, userId }) {
  const client = requireSupabase()

  const { error } = await client.from('story_views').upsert(
    {
      story_id: storyId,
      user_id: userId,
    },
    { onConflict: 'story_id,user_id', ignoreDuplicates: true },
  )

  if (error) {
    if (isMissingStoriesRelation(error)) {
      throw storiesSetupError()
    }

    throw error
  }
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

const audioExtensions = new Set(['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac', 'flac', 'webm', 'opus'])
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif'])

function getFileExtension(file) {
  const fileName = String(file?.name || '').toLowerCase()
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.pop() || '' : ''
}

function inferMediaKind(file) {
  if (!file) {
    return null
  }

  const mime = String(file.type || '').toLowerCase()
  if (mime.startsWith('image/')) {
    return 'image'
  }

  if (mime.startsWith('audio/')) {
    return 'audio'
  }

  const extension = getFileExtension(file)
  if (imageExtensions.has(extension)) {
    return 'image'
  }

  if (audioExtensions.has(extension)) {
    return 'audio'
  }

  return null
}

function inferContentType(file) {
  const mime = String(file?.type || '').toLowerCase()
  if (mime) {
    return mime
  }

  const extension = getFileExtension(file)
  const mimeByExtension = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    aac: 'audio/aac',
    flac: 'audio/flac',
    webm: 'audio/webm',
    opus: 'audio/ogg',
  }

  return mimeByExtension[extension] || 'application/octet-stream'
}

async function uploadMedia(userId, file, category = 'posts') {
  if (!file) {
    return null
  }

  const client = requireSupabase()
  const mediaKind = inferMediaKind(file)
  if (!mediaKind) {
    throw new Error('Formato de arquivo nao suportado. Use imagem ou audio valido.')
  }

  const extension = (file.name.split('.').pop() || 'file').toLowerCase()
  const baseName = file.name.replace(/\.[^/.]+$/, '')
  const safeName = normalizeFileName(baseName || 'upload')
  const path = `${userId}/${category}/${Date.now()}-${safeName}.${extension}`
  const contentType = inferContentType(file)

  const { error: uploadError } = await client.storage.from(SUPABASE_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  })

  if (uploadError) {
    const rawMessage = String(uploadError.message || '')
    if (rawMessage.toLowerCase().includes('mime')) {
      throw new Error('O bucket media bloqueou este tipo de audio. Libere MIME de audio nas configuracoes do Storage.')
    }
    throw new Error(rawMessage || 'Falha no upload de midia.')
  }

  const { data } = client.storage.from(SUPABASE_MEDIA_BUCKET).getPublicUrl(path)

  return {
    url: data.publicUrl,
    type: mediaKind,
  }
}

export async function createStory({ userId, content, trackTitle, trackArtist, mediaFile }) {
  const client = requireSupabase()
  const text = String(content || '').trim()
  const title = String(trackTitle || '').trim()
  const artist = String(trackArtist || '').trim()

  if ((title && !artist) || (!title && artist)) {
    throw new Error('Preencha titulo e artista juntos no story.')
  }

  if (!text && !mediaFile && !title) {
    throw new Error('Story vazio. Escreva algo, adicione faixa ou envie midia.')
  }

  const media = await uploadMedia(userId, mediaFile, 'stories')

  const { data, error } = await client
    .from('stories')
    .insert({
      user_id: userId,
      content: text || '',
      track_title: title || null,
      track_artist: artist || null,
      media_url: media?.url || null,
      media_type: media?.type || null,
    })
    .select(
      `
      id,
      user_id,
      content,
      track_title,
      track_artist,
      media_url,
      media_type,
      created_at,
      expires_at,
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
    if (isMissingStoriesRelation(error)) {
      throw storiesSetupError()
    }

    throw error
  }

  return mapStory(data, new Set(), userId)
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
  spotifyUrl,
  mediaFile,
}) {
  const client = requireSupabase()
  const media = await uploadMedia(userId, mediaFile, 'posts')
  const spotify = parseSpotifyData(spotifyUrl)

  const payload = {
    user_id: userId,
    content,
    mood,
    track_title: trackTitle || null,
    track_artist: trackArtist || null,
    media_url: media?.url || null,
    media_type: media?.type || null,
    spotify_url: spotify?.url || null,
    spotify_type: spotify?.type || null,
  }

  let insertResult = await client.from('posts').insert(payload).select('id').single()

  if (insertResult.error && (isMissingColumnError(insertResult.error, 'spotify_url') || isMissingColumnError(insertResult.error, 'spotify_type'))) {
    const fallbackPayload = {
      user_id: userId,
      content,
      mood,
      track_title: trackTitle || null,
      track_artist: trackArtist || null,
      media_url: media?.url || null,
      media_type: media?.type || null,
    }

    insertResult = await client.from('posts').insert(fallbackPayload).select('id').single()
  }

  const { data, error } = insertResult

  if (error) {
    throw error
  }

  return fetchPostById(data.id, currentUserId)
}

export async function updatePost({
  postId,
  userId,
  currentUserId,
  content,
  mood,
}) {
  const client = requireSupabase()
  const cleanContent = String(content || '').trim()
  const cleanMood = String(mood || '').trim() || 'Alta energia'

  if (!cleanContent) {
    throw new Error('Post precisa de conteudo.')
  }

  const { error } = await client
    .from('posts')
    .update({
      content: cleanContent,
      mood: cleanMood,
    })
    .eq('id', postId)
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  return fetchPostById(postId, currentUserId)
}

export async function deletePost({ postId, userId }) {
  const client = requireSupabase()

  const { error } = await client
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  return true
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
