import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { compact, gradientFromSeed, initials, normalizeHandle, timeAgo } from './lib/formatters'
import {
  demoPosts,
  demoUser,
  events,
  moods,
  navItems,
  suggestedPeople,
  trendingTracks,
} from './lib/mockData'
import { isSupabaseConfigured } from './lib/supabase'
import {
  addComment,
  createStory,
  createOrGetDirectThread,
  createPost,
  createSpotifyCapsuleSnapshot,
  createCommunity,
  createSpotifyPlaylist,
  deleteSpotifyConnection,
  ensureProfile,
  fetchActiveStories,
  fetchLatestSpotifyCapsule,
  fetchSpotifyCapsuleLeaderboard,
  fetchCommunitySpotifyLeaderboards,
  fetchSpotifyConnection,
  fetchCommunities,
  fetchDirectThreads,
  fetchFollowStats,
  fetchFeed,
  fetchPeopleToFollow,
  fetchSpotifyPlaylists,
  searchProfiles,
  fetchPublicProfileByHandle,
  getSession,
  markStoryViewed,
  markDirectThreadRead,
  listenAuthStateChange,
  subscribeDirectInbox,
  subscribeStories,
  sendDirectMessage as sendDirectMessageToThread,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  toggleFollowUser,
  toggleLike,
  toggleSaveSpotifyPlaylist,
  toggleRepost,
  toggleCommunityMembership,
  upsertSpotifyConnection,
  updateOwnProfile,
} from './services/socialApi'

function AmbientBackdrop() {
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <span className="ambient-orb orb-a" />
      <span className="ambient-orb orb-b" />
      <span className="ambient-orb orb-c" />
      <span className="ambient-grid" />
    </div>
  )
}

function toMessage(error, fallback = 'Ocorreu um erro. Tente novamente.') {
  if (!error) {
    return fallback
  }

  return error.message || fallback
}

const audioExtensions = new Set(['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac', 'flac', 'webm', 'opus'])
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif'])

function getFileExtension(file) {
  const name = String(file?.name || '').toLowerCase()
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop() || '' : ''
}

function inferMediaKindFromFile(file) {
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

function isAllowedFile(file) {
  return inferMediaKindFromFile(file) !== null
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      resolve(String(reader.result))
    }

    reader.onerror = () => {
      reject(new Error('Nao foi possivel carregar o arquivo selecionado.'))
    }

    reader.readAsDataURL(file)
  })
}

const spotifyKinds = new Set(['track', 'playlist', 'album', 'artist', 'episode', 'show'])

function parseSpotifyUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }

  const uriMatch = raw.match(/spotify:(track|playlist|album|artist|episode|show):([A-Za-z0-9]+)/i)
  if (uriMatch) {
    const [, type, id] = uriMatch
    return {
      type: type.toLowerCase(),
      url: `https://open.spotify.com/${type.toLowerCase()}/${id}`,
      embedUrl: `https://open.spotify.com/embed/${type.toLowerCase()}/${id}`,
    }
  }

  const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
  let url

  try {
    url = new URL(normalized)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (!host.includes('spotify.com') && !host.includes('spotify.link')) {
    return null
  }

  const pathMatch = url.pathname.match(/(?:^|\/)(track|playlist|album|artist|episode|show)\/([A-Za-z0-9]+)(?:$|\/|\?)/i)
  if (!pathMatch) {
    return {
      type: 'link',
      url: normalized,
      embedUrl: '',
    }
  }

  const [, type, id] = pathMatch
  const normalizedType = String(type || '').toLowerCase()
  if (!spotifyKinds.has(normalizedType)) {
    return {
      type: 'link',
      url: normalized,
      embedUrl: '',
    }
  }

  return {
    type: normalizedType,
    url: `https://open.spotify.com/${normalizedType}/${id}`,
    embedUrl: `https://open.spotify.com/embed/${normalizedType}/${id}`,
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function postMatchesQuery(post, query) {
  const haystack = [
    post.user?.name,
    post.user?.handle,
    post.text,
    post.mood,
    post.track?.title,
    post.track?.artist,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

function toRoleText(text) {
  if (!text) {
    return 'Membro da comunidade'
  }

  return text.length > 56 ? `${text.slice(0, 53)}...` : text
}

function buildLocalPeople() {
  return suggestedPeople.map((person) => ({
    id: person.id,
    name: person.name,
    handle: person.handle || normalizeHandle(person.name.replace(/\s+/g, '').toLowerCase()),
    role: person.role,
    avatarUrl: null,
    followers: 100 + Math.floor(Math.random() * 900),
    followed: false,
  }))
}

function minutesAgoIso(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

const directReplyLibrary = [
  'Fechou. Te respondo com o audio final.',
  'Boa! Curti essa ideia.',
  'Manda o preview aqui quando subir.',
  'Top, ja coloquei na fila pra ouvir.',
]

function sortDirectThreads(threads) {
  return [...threads].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

function buildInitialDirectThreads() {
  return sortDirectThreads([
    {
      id: 'dm-luna',
      participant: {
        id: 'peer-luna',
        name: 'Luna Costa',
        handle: 'lunacosta',
        online: true,
      },
      unread: 2,
      updatedAt: minutesAgoIso(6),
      messages: [
        {
          id: 'dm-luna-1',
          senderId: 'peer-luna',
          text: 'Escutei seu ultimo post. Curti muito o refrão.',
          createdAt: minutesAgoIso(22),
        },
        {
          id: 'dm-luna-2',
          senderId: 'peer-luna',
          text: 'Se quiser, te mando referencia de synth parecido.',
          createdAt: minutesAgoIso(6),
        },
      ],
    },
    {
      id: 'dm-kai',
      participant: {
        id: 'peer-kai',
        name: 'Kai Martins',
        handle: 'kaibeats',
        online: false,
      },
      unread: 1,
      updatedAt: minutesAgoIso(31),
      messages: [
        {
          id: 'dm-kai-1',
          senderId: 'peer-kai',
          text: 'Partiu collab de house BR no fim de semana?',
          createdAt: minutesAgoIso(31),
        },
      ],
    },
    {
      id: 'dm-helena',
      participant: {
        id: 'peer-helena',
        name: 'Helena Rocha',
        handle: 'helenarocha',
        online: true,
      },
      unread: 0,
      updatedAt: minutesAgoIso(90),
      messages: [
        {
          id: 'dm-helena-1',
          senderId: 'peer-helena',
          text: 'Tenho uma selecao de vinil pra te mostrar depois.',
          createdAt: minutesAgoIso(90),
        },
      ],
    },
  ])
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

function buildLocalStoryGroups({ currentUser, posts, peopleToFollow }) {
  const groupsMap = new Map()

  for (const post of posts.slice(0, 24)) {
    const userId = post.user.id
    const existing = groupsMap.get(userId)
    const mappedStory = {
      id: `local-story-${post.id}`,
      userId,
      user: {
        id: userId,
        name: post.user.name,
        handle: normalizeHandle(post.user.handle),
        avatarUrl: post.user.avatarUrl || null,
      },
      text: post.text || '',
      media: post.media || null,
      track: post.track || null,
      createdAt: post.createdAt || new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      viewed: currentUser ? userId === currentUser.id : false,
      own: currentUser ? userId === currentUser.id : false,
    }

    if (existing) {
      if (existing.items.length < 3) {
        existing.items.push(mappedStory)
      }
      existing.latestAt = new Date(existing.latestAt) > new Date(mappedStory.createdAt) ? existing.latestAt : mappedStory.createdAt
      existing.hasUnviewed = existing.hasUnviewed || !mappedStory.viewed
    } else {
      groupsMap.set(userId, {
        userId,
        user: mappedStory.user,
        own: mappedStory.own,
        latestAt: mappedStory.createdAt,
        hasUnviewed: !mappedStory.viewed,
        items: [mappedStory],
      })
    }
  }

  if (currentUser && !groupsMap.has(currentUser.id)) {
    const nowIso = new Date().toISOString()
    groupsMap.set(currentUser.id, {
      userId: currentUser.id,
      user: {
        id: currentUser.id,
        name: currentUser.name,
        handle: normalizeHandle(currentUser.handle),
        avatarUrl: currentUser.avatarUrl || null,
      },
      own: true,
      latestAt: nowIso,
      hasUnviewed: false,
      items: [],
    })
  }

  if (groupsMap.size < 6) {
    for (const person of peopleToFollow.slice(0, 8)) {
      if (groupsMap.has(person.id)) {
        continue
      }

      const createdAt = new Date(Date.now() - Math.floor(Math.random() * 9 + 1) * 60 * 60 * 1000).toISOString()
      groupsMap.set(person.id, {
        userId: person.id,
        user: {
          id: person.id,
          name: person.name,
          handle: normalizeHandle(person.handle),
          avatarUrl: person.avatarUrl || null,
        },
        own: false,
        latestAt: createdAt,
        hasUnviewed: true,
        items: [
          {
            id: `local-story-person-${person.id}`,
            userId: person.id,
            user: {
              id: person.id,
              name: person.name,
              handle: normalizeHandle(person.handle),
              avatarUrl: person.avatarUrl || null,
            },
            text: person.role || 'No estudio hoje.',
            media: null,
            track: null,
            createdAt,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            viewed: false,
            own: false,
          },
        ],
      })

      if (groupsMap.size >= 10) {
        break
      }
    }
  }

  return sortStoryGroups(Array.from(groupsMap.values()))
}

const communityCards = [
  {
    id: 'comm-1',
    name: 'Produtores BR',
    description: 'Feedback de beats, mix e master em tempo real.',
    members: 1240,
  },
  {
    id: 'comm-2',
    name: 'Vocal Sessions',
    description: 'Composicao, topline e colaboracoes por genero.',
    members: 860,
  },
  {
    id: 'comm-3',
    name: 'Indie Radar',
    description: 'Descoberta de artistas novos e curadoria semanal.',
    members: 2110,
  },
]

const playlistCards = [
  {
    id: 'mix-1',
    title: 'Night Drive BR',
    curator: 'WaveLoop Curators',
    tracks: 24,
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    sampleTrack: { title: 'Luz de Neon', artist: 'Mila C.' },
  },
  {
    id: 'mix-2',
    title: 'Lo-fi Focus',
    curator: 'Rafa Melo',
    tracks: 32,
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6',
    sampleTrack: { title: 'Quiet Circuit', artist: 'Rafa Melo' },
  },
  {
    id: 'mix-3',
    title: 'Synth City',
    curator: 'Luna Costa',
    tracks: 18,
    spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
    sampleTrack: { title: 'Brisa da Cidade', artist: 'Maya e Atlas' },
  },
]

function buildLocalCommunityCards() {
  return communityCards.map((community) => ({
    ...community,
    creatorId: 'wave-system',
    creatorName: 'WaveLoop',
    creatorHandle: 'waveloop',
    joined: false,
  }))
}

function buildLocalPlaylistCards() {
  return playlistCards.map((playlist) => ({
    id: playlist.id,
    title: playlist.title,
    description: '',
    spotifyUrl: playlist.spotifyUrl,
    spotifyType: 'playlist',
    creatorId: 'wave-system',
    creatorName: playlist.curator,
    creatorHandle: normalizeHandle(playlist.curator.replace(/\s+/g, '').toLowerCase()),
    saves: Math.floor(playlist.tracks * 3.2),
    saved: false,
    sampleTrack: playlist.sampleTrack,
  }))
}

const communityGenreOptions = ['Rock', 'Gospel', 'Trap', 'Lo-fi', 'Musica eletronica', 'Musica crista']

const communityPostTypeOptions = [
  { id: 'music', label: 'Compartilhar musica' },
  { id: 'playlist', label: 'Recomendar playlist' },
  { id: 'album_opinion', label: 'Opiniao de album' },
  { id: 'show_clip', label: 'Trecho de show' },
  { id: 'studio_photo', label: 'Foto de estudio' },
  { id: 'rating', label: 'Avaliacao de musica' },
]

function seededIndex(seed, size) {
  const value = String(seed || '')
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)

  return size > 0 ? value % size : 0
}

function detectCommunityGenre(community) {
  const name = String(community?.name || '').toLowerCase()
  const description = String(community?.description || '').toLowerCase()
  const text = `${name} ${description}`

  if (text.includes('rock') || text.includes('guitarra') || text.includes('metal')) {
    return 'Rock'
  }

  if (text.includes('gospel') || text.includes('louvor') || text.includes('crista')) {
    return 'Gospel'
  }

  if (text.includes('trap') || text.includes('808') || text.includes('drill')) {
    return 'Trap'
  }

  if (text.includes('lofi') || text.includes('lo-fi') || text.includes('chill')) {
    return 'Lo-fi'
  }

  if (text.includes('eletronica') || text.includes('edm') || text.includes('house') || text.includes('techno')) {
    return 'Musica eletronica'
  }

  if (text.includes('adora') || text.includes('igreja')) {
    return 'Musica crista'
  }

  return communityGenreOptions[seededIndex(community?.id || community?.name, communityGenreOptions.length)]
}

function buildCommunityFeedSeed(community, currentUser) {
  const genre = detectCommunityGenre(community)
  const authorName = community?.creatorName || 'Moderador'
  const authorHandle = normalizeHandle(community?.creatorHandle || 'moderador')

  return [
    {
      id: `seed-feed-${community.id}-music`,
      type: 'music',
      title: `Drop da semana (${genre})`,
      text: 'Compartilha aqui a faixa que voce mais ouviu hoje.',
      spotifyUrl: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
      mediaUrl: '',
      albumName: '',
      rating: 0,
      author: { id: community?.creatorId || 'seed-author', name: authorName, handle: authorHandle },
      createdAt: new Date().toISOString(),
      likes: 6,
      shares: 2,
      saves: 3,
      liked: false,
      saved: false,
      comments: [
        {
          id: `seed-comment-${community.id}-1`,
          text: 'Esse som ficou absurdo.',
          createdAt: new Date().toISOString(),
          author: { id: 'seed-user-a', name: 'Luna', handle: 'lunacosta' },
        },
      ],
    },
    {
      id: `seed-feed-${community.id}-playlist`,
      type: 'playlist',
      title: `${genre} essentials`,
      text: 'Playlist colaborativa da comunidade.',
      spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      mediaUrl: '',
      albumName: '',
      rating: 0,
      author: {
        id: currentUser?.id || 'seed-user',
        name: currentUser?.name || 'Voce',
        handle: normalizeHandle(currentUser?.handle || 'voce'),
      },
      createdAt: new Date(Date.now() - 1000 * 60 * 36).toISOString(),
      likes: 3,
      shares: 1,
      saves: 2,
      liked: false,
      saved: false,
      comments: [],
    },
  ]
}

function buildCommunityTopicsSeed(community) {
  return [
    {
      id: `seed-topic-${community.id}-1`,
      title: 'Melhores solos de guitarra',
      body: 'Poste seu solo favorito com contexto.',
      pinned: true,
      createdAt: new Date().toISOString(),
      author: { id: community?.creatorId || 'seed-author', name: community?.creatorName || 'Moderador', handle: normalizeHandle(community?.creatorHandle || 'moderador') },
      replies: [
        {
          id: `seed-reply-${community.id}-1`,
          text: 'Comfortably Numb ao vivo sempre vence.',
          votes: 5,
          isBest: false,
          author: { id: 'seed-user-1', name: 'Nina', handle: 'demo_ninaprado' },
          createdAt: new Date().toISOString(),
        },
      ],
      bestReplyId: '',
    },
  ]
}

function buildCommunityCollabSeed(community) {
  return [
    {
      id: `seed-collab-${community.id}-1`,
      title: 'Procuro vocal para refrão',
      roleNeeded: 'Vocal',
      details: 'Faixa em 95bpm, vibe pop rock.',
      createdAt: new Date().toISOString(),
      status: 'open',
      applicants: 2,
      author: { id: community?.creatorId || 'seed-author', name: community?.creatorName || 'Moderador', handle: normalizeHandle(community?.creatorHandle || 'moderador') },
    },
  ]
}

function buildCommunityChallengesSeed(community) {
  return [
    {
      id: `seed-challenge-${community.id}-1`,
      title: 'Desafio cover da semana',
      kind: 'cover',
      details: 'Cover livre de 45s.',
      deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      participants: [
        { userId: 'seed-user-1', name: 'Nina', score: 82 },
        { userId: 'seed-user-2', name: 'Vitor', score: 74 },
      ],
      createdAt: new Date().toISOString(),
      author: { id: community?.creatorId || 'seed-author', name: community?.creatorName || 'Moderador', handle: normalizeHandle(community?.creatorHandle || 'moderador') },
    },
  ]
}

const spotifyPickerLibrary = [
  {
    id: 'sp-track-1',
    title: 'Blinding Lights',
    subtitle: 'The Weeknd',
    url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
  },
  {
    id: 'sp-track-2',
    title: 'As It Was',
    subtitle: 'Harry Styles',
    url: 'https://open.spotify.com/track/4LRPiXqCikLlN15c3yImP7',
  },
  {
    id: 'sp-track-3',
    title: 'good 4 u',
    subtitle: 'Olivia Rodrigo',
    url: 'https://open.spotify.com/track/4ZtFanR9U6ndgddUvNcjcG',
  },
  {
    id: 'sp-track-4',
    title: 'Dance The Night',
    subtitle: 'Dua Lipa',
    url: 'https://open.spotify.com/track/11C4y2Yz1XbHmaQ3m0KnRO',
  },
  {
    id: 'sp-album-1',
    title: 'SOS',
    subtitle: 'SZA',
    url: 'https://open.spotify.com/album/1nrVofqDRs7cpWXJ49qTnP',
  },
  {
    id: 'sp-album-2',
    title: 'After Hours',
    subtitle: 'The Weeknd',
    url: 'https://open.spotify.com/album/4yP0hdKOZPNshxUOjY0cZj',
  },
  {
    id: 'sp-playlist-1',
    title: 'Today’s Top Hits',
    subtitle: 'Spotify',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
  },
  {
    id: 'sp-playlist-2',
    title: 'RapCaviar',
    subtitle: 'Spotify',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
  },
  {
    id: 'sp-playlist-3',
    title: 'Chill Hits',
    subtitle: 'Spotify',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6',
  },
  {
    id: 'sp-playlist-4',
    title: 'lofi beats',
    subtitle: 'Spotify',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn',
  },
]

const heroCountLabels = {
  Feed: 'posts no feed',
  Descobrir: 'posts em destaque',
  Direct: 'conversas no direct',
  Comunidades: 'posts da comunidade',
  Eventos: 'posts relacionados',
  Playlists: 'posts com faixa',
  Perfil: 'posts do seu perfil',
}

const spotifyCapsuleClientId = String(
  import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('waveloop:spotify-client-id') : '') ||
    '',
).trim()
const spotifyCapsuleRedirectUri =
  String(import.meta.env.VITE_SPOTIFY_REDIRECT_URI || '').trim() ||
  (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '')

const spotifyCapsulePeriods = [
  { id: '4_weeks', label: '4 semanas', range: 'short_term' },
  { id: '6_months', label: '6 meses', range: 'medium_term' },
  { id: 'all_time', label: 'Sempre', range: 'long_term' },
]

const spotifyCapsuleScopes = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
]

function capsulePeriodLabel(period) {
  return spotifyCapsulePeriods.find((item) => item.id === period)?.label || '4 semanas'
}

function capsulePeriodRange(period) {
  return spotifyCapsulePeriods.find((item) => item.id === period)?.range || 'short_term'
}

function capsulePeriodStartTimestamp(period) {
  const now = Date.now()

  if (period === '4_weeks') {
    return now - 28 * 24 * 60 * 60 * 1000
  }

  if (period === '6_months') {
    return now - 183 * 24 * 60 * 60 * 1000
  }

  return null
}

async function fetchSpotifyRecentHistory(accessToken, period) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  }

  const periodStart = capsulePeriodStartTimestamp(period)
  const maxPagesByPeriod = {
    '4_weeks': 84, // ate 4.200 plays
    '6_months': 320, // ate 16.000 plays
    all_time: 420, // limite tecnico (recently-played nao e historico completo)
  }
  const maxPages = maxPagesByPeriod[period] || 84
  let beforeCursor = ''
  const allItems = []

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL('https://api.spotify.com/v1/me/player/recently-played')
    url.searchParams.set('limit', '50')
    if (beforeCursor) {
      url.searchParams.set('before', beforeCursor)
    }

    const response = await fetch(url.toString(), { headers })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error?.message || 'Falha ao carregar historico recente do Spotify.')
    }

    const items = Array.isArray(data.items) ? data.items : []
    if (!items.length) {
      break
    }

    allItems.push(...items)

    const oldestPlayedAt = new Date(items[items.length - 1]?.played_at || '').getTime()
    if (periodStart && Number.isFinite(oldestPlayedAt) && oldestPlayedAt < periodStart) {
      break
    }

    const nextBefore = data?.cursors?.before ? String(data.cursors.before) : ''
    if (!nextBefore) {
      break
    }

    beforeCursor = nextBefore
  }

  const periodFiltered = periodStart
    ? allItems.filter((item) => {
        const playedAt = new Date(item?.played_at || '').getTime()
        return Number.isFinite(playedAt) && playedAt >= periodStart
      })
    : allItems

  const seen = new Set()
  const deduped = []
  for (const item of periodFiltered) {
    const trackId = item?.track?.id || item?.track?.uri || item?.track?.name || 'track'
    const playedAt = item?.played_at || ''
    const key = `${trackId}:${playedAt}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(item)
  }

  return deduped
}

function randomSpotifyPkceString(length = 96) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let output = ''

  for (const byte of bytes) {
    output += alphabet[byte % alphabet.length]
  }

  return output
}

function encodeBase64Url(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function makeSpotifyCodeChallenge(verifier) {
  const bytes = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return encodeBase64Url(digest)
}

function spotifyPkceStorageKey() {
  return 'waveloop:spotify:pkce'
}

function spotifyTokenStorageKey(userId) {
  return `waveloop:spotify:token:${userId || 'anon'}`
}

function parseJsonSafe(value, fallback = null) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function cleanupSpotifyAuthParams() {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  const hadCode = url.searchParams.has('code')
  const hadState = url.searchParams.has('state')
  const hadError = url.searchParams.has('error')
  const hadErrorDescription = url.searchParams.has('error_description')
  if (!hadCode && !hadState && !hadError && !hadErrorDescription) {
    return
  }

  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('error')
  url.searchParams.delete('error_description')
  const nextPath = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', nextPath)
}

function buildLocalSpotifyCapsuleLeaderboard(currentUser) {
  const base = [
    {
      id: 'local-capsule-1',
      userId: 'local-nina',
      user: { id: 'local-nina', name: 'Nina Prado', handle: 'demo_ninaprado', avatarUrl: null },
      period: '4_weeks',
      score: 972,
      topTracks: [
        { id: 'track-1', name: 'Nightcall', artist: 'Kavinsky' },
        { id: 'track-2', name: 'Midnight City', artist: 'M83' },
      ],
      topArtists: [{ id: 'artist-1', name: 'The Weeknd' }],
      recentPlays: 38,
      minutesEstimate: 1310,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'local-capsule-2',
      userId: 'local-vitor',
      user: { id: 'local-vitor', name: 'Vitor', handle: 'vitor', avatarUrl: null },
      period: '4_weeks',
      score: 904,
      topTracks: [
        { id: 'track-3', name: 'B.Y.O.B', artist: 'System Of A Down' },
        { id: 'track-4', name: 'Toxicity', artist: 'System Of A Down' },
      ],
      topArtists: [{ id: 'artist-2', name: 'System Of A Down' }],
      recentPlays: 34,
      minutesEstimate: 1205,
      createdAt: new Date().toISOString(),
    },
  ]

  if (!currentUser?.id) {
    return base
  }

  return [
    {
      id: 'local-capsule-self',
      userId: currentUser.id,
      user: {
        id: currentUser.id,
        name: currentUser.name,
        handle: normalizeHandle(currentUser.handle),
        avatarUrl: currentUser.avatarUrl || null,
      },
      period: '4_weeks',
      score: 950,
      topTracks: [{ id: 'track-self-1', name: 'As It Was', artist: 'Harry Styles' }],
      topArtists: [{ id: 'artist-self-1', name: 'Drake' }],
      recentPlays: 36,
      minutesEstimate: 1250,
      createdAt: new Date().toISOString(),
    },
    ...base,
  ]
}

const localCommunityPeriodScoreBoost = {
  '4_weeks': 1,
  '6_months': 1.08,
  all_time: 1.15,
}

function buildLocalCommunityLeaderboards({ communities = [], currentUser, period = '4_weeks', limit = 3 }) {
  const baseEntries = buildLocalSpotifyCapsuleLeaderboard(currentUser).filter((entry) => entry.period === '4_weeks')
  const boost = localCommunityPeriodScoreBoost[period] || 1
  const safeLimit = Math.max(1, Math.min(8, Number(limit) || 3))

  return Object.fromEntries(
    (communities || []).map((community) => {
      const communitySeed = String(community?.id || '')
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0)

      const entries = baseEntries
        .map((entry, index) => {
          const spread = ((communitySeed + index * 11) % 27) - 13
          return {
            ...entry,
            period,
            score: Math.max(0, Math.round(entry.score * boost + spread)),
          }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, safeLimit)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }))

      return [community.id, entries]
    }),
  )
}

function NavIcon({ name, active = false }) {
  const strokeWidth = active ? 2.15 : 1.9
  const props = {
    width: 21,
    height: 21,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.5V20h14V9.5" />
        </svg>
      )
    case 'compass':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m10 10 7-3-3 7-7 3z" />
        </svg>
      )
    case 'direct':
      return (
        <svg {...props}>
          <path d="M4 5h16v11H9l-5 4V5z" />
        </svg>
      )
    case 'group':
      return (
        <svg {...props}>
          <circle cx="9" cy="8.2" r="2.8" />
          <circle cx="17" cy="9.3" r="2.2" />
          <path d="M3.5 19c.8-2.4 3.1-4 5.6-4 2.6 0 4.8 1.6 5.7 4" />
          <path d="M14.8 17.8c.5-1.4 1.8-2.5 3.3-3" />
        </svg>
      )
    case 'event':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2.4" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      )
    case 'music':
      return (
        <svg {...props}>
          <path d="M10 18V7l9-2v11" />
          <circle cx="8" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )
    case 'profile':
      return (
        <svg {...props}>
          <circle cx="12" cy="8.3" r="3.6" />
          <path d="M4 20c1.6-3.5 4.1-5 8-5s6.4 1.5 8 5" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      )
  }
}

function ThemeModeIcon({ mode }) {
  if (mode === 'dark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.9v2.2M12 18.9v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.9 12h2.2M18.9 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </svg>
  )
}

const navPresentation = {
  Feed: { label: 'Inicio', mobile: 'Inicio', icon: 'home' },
  Descobrir: { label: 'Explorar', mobile: 'Explorar', icon: 'compass' },
  Direct: { label: 'Mensagens', mobile: 'Direct', icon: 'direct' },
  Comunidades: { label: 'Comunidades', mobile: 'Grupos', icon: 'group' },
  Eventos: { label: 'Eventos', mobile: 'Eventos', icon: 'event' },
  Playlists: { label: 'Playlists', mobile: 'Mixes', icon: 'music' },
  Perfil: { label: 'Perfil', mobile: 'Perfil', icon: 'profile' },
}

const directMobileThemePresets = [
  { id: 'midnight', label: 'Noite', color: '#020817' },
  { id: 'ocean', label: 'Oceano', color: '#07233d' },
  { id: 'forest', label: 'Floresta', color: '#10261f' },
  { id: 'wine', label: 'Vinho', color: '#311223' },
  { id: 'graphite', label: 'Grafite', color: '#1a1f2b' },
]

function App() {
  const [activeNav, setActiveNav] = useState('Feed')
  const [posts, setPosts] = useState(isSupabaseConfigured ? [] : demoPosts)
  const [profile, setProfile] = useState(isSupabaseConfigured ? null : demoUser)
  const [session, setSession] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(isSupabaseConfigured)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [loadingUserSearch, setLoadingUserSearch] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    isSupabaseConfigured
      ? ''
      : 'Modo demo ativo. Configure Supabase para autenticar usuarios e salvar dados no banco.',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [authMode, setAuthMode] = useState('signin')
  const [authBusy, setAuthBusy] = useState(false)
  const [authGoogleBusy, setAuthGoogleBusy] = useState(false)
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [peopleToFollow, setPeopleToFollow] = useState(buildLocalPeople)
  const [followStats, setFollowStats] = useState({
    followers: demoUser.followers,
    following: demoUser.following,
  })
  const [publicProfile, setPublicProfile] = useState(null)
  const [loadingPublicProfile, setLoadingPublicProfile] = useState(false)
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileDraft, setProfileDraft] = useState({
    name: demoUser.name,
    bio: '',
  })
  const [profileAvatarFile, setProfileAvatarFile] = useState(null)
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('')
  const [communities, setCommunities] = useState(isSupabaseConfigured ? [] : buildLocalCommunityCards)
  const [loadingCommunities, setLoadingCommunities] = useState(false)
  const [creatingCommunity, setCreatingCommunity] = useState(false)
  const [communityRankPeriod, setCommunityRankPeriod] = useState('4_weeks')
  const [communityRankingsById, setCommunityRankingsById] = useState({})
  const [loadingCommunityRankings, setLoadingCommunityRankings] = useState(false)
  const [communityQuery, setCommunityQuery] = useState('')
  const [communityFilter, setCommunityFilter] = useState('all')
  const [communityGenreFilter, setCommunityGenreFilter] = useState('all')
  const [communityWorkspaceTab, setCommunityWorkspaceTab] = useState('feed')
  const [selectedCommunityId, setSelectedCommunityId] = useState('')
  const [communityFeedById, setCommunityFeedById] = useState({})
  const [communityPostDraft, setCommunityPostDraft] = useState({
    type: 'music',
    title: '',
    text: '',
    spotifyUrl: '',
    mediaUrl: '',
    albumName: '',
    rating: 4,
  })
  const [communityCommentDrafts, setCommunityCommentDrafts] = useState({})
  const [communityTopicsById, setCommunityTopicsById] = useState({})
  const [communityTopicDraft, setCommunityTopicDraft] = useState({ title: '', body: '' })
  const [communityReplyDrafts, setCommunityReplyDrafts] = useState({})
  const [communityCollabsById, setCommunityCollabsById] = useState({})
  const [communityCollabDraft, setCommunityCollabDraft] = useState({ title: '', roleNeeded: '', details: '' })
  const [communityChallengesById, setCommunityChallengesById] = useState({})
  const [communityChallengeDraft, setCommunityChallengeDraft] = useState({
    title: '',
    kind: 'cover',
    details: '',
    deadline: '',
  })
  const [communityDraft, setCommunityDraft] = useState({
    name: '',
    description: '',
    themeColor: '#3b82f6',
  })
  const [playlists, setPlaylists] = useState(isSupabaseConfigured ? [] : buildLocalPlaylistCards)
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)
  const [playlistDraft, setPlaylistDraft] = useState({
    title: '',
    description: '',
    spotifyUrl: '',
  })
  const [spotifyCapsulePeriod, setSpotifyCapsulePeriod] = useState('4_weeks')
  const [spotifyCapsuleConnection, setSpotifyCapsuleConnection] = useState(null)
  const [spotifyCapsuleMine, setSpotifyCapsuleMine] = useState(null)
  const [spotifyCapsuleLeaderboard, setSpotifyCapsuleLeaderboard] = useState([])
  const [loadingSpotifyCapsule, setLoadingSpotifyCapsule] = useState(false)
  const [syncingSpotifyCapsule, setSyncingSpotifyCapsule] = useState(false)
  const [disconnectingSpotifyCapsule, setDisconnectingSpotifyCapsule] = useState(false)
  const [savedEvents, setSavedEvents] = useState(() => Object.fromEntries(events.map((event) => [event.id, false])))
  const [directThreads, setDirectThreads] = useState(isSupabaseConfigured ? [] : buildInitialDirectThreads)
  const [activeDirectThreadId, setActiveDirectThreadId] = useState(isSupabaseConfigured ? '' : 'dm-luna')
  const [loadingDirect, setLoadingDirect] = useState(false)
  const [sendingDirect, setSendingDirect] = useState(false)
  const [directDraft, setDirectDraft] = useState('')
  const [directMobileView, setDirectMobileView] = useState('list')
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia('(max-width: 760px)').matches
  })
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === 'undefined') {
      return 'clean'
    }

    const saved = window.localStorage.getItem('waveloop:theme-mode')
    return saved === 'dark' ? 'dark' : 'clean'
  })
  const [directThemeOpen, setDirectThemeOpen] = useState(false)
  const [directMobileBg, setDirectMobileBg] = useState(directMobileThemePresets[0].color)
  const [profileTab, setProfileTab] = useState('posts')
  const [stories, setStories] = useState([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [storyComposerOpen, setStoryComposerOpen] = useState(false)
  const [publishingStory, setPublishingStory] = useState(false)
  const [storyDraft, setStoryDraft] = useState({
    text: '',
    track: '',
    artist: '',
  })
  const [storyMediaFile, setStoryMediaFile] = useState(null)
  const [storyMediaPreview, setStoryMediaPreview] = useState('')
  const [storyViewer, setStoryViewer] = useState({
    open: false,
    userId: '',
    itemIndex: 0,
  })

  const [composer, setComposer] = useState({
    text: '',
    track: '',
    artist: '',
    spotifyUrl: '',
    mood: moods[0],
  })
  const [spotifyPickerOpen, setSpotifyPickerOpen] = useState(false)
  const [spotifyPickerQuery, setSpotifyPickerQuery] = useState('')
  const [spotifyManualUrl, setSpotifyManualUrl] = useState('')
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState('')
  const [commentDrafts, setCommentDrafts] = useState({})
  const [busyActions, setBusyActions] = useState({})
  const [playingPostId, setPlayingPostId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [userSearchResults, setUserSearchResults] = useState([])
  const [likeBurstId, setLikeBurstId] = useState('')

  const fileInputRef = useRef(null)
  const profileAvatarInputRef = useRef(null)
  const likeBurstTimeoutRef = useRef(null)
  const directReplyTimeoutRef = useRef(null)
  const commentInputRefs = useRef({})
  const composerRef = useRef(null)
  const storyMediaInputRef = useRef(null)
  const storyAutoAdvanceRef = useRef(null)
  const spotifyAuthProcessingRef = useRef(false)

  const currentUser = useMemo(() => {
    if (!isSupabaseConfigured) {
      return {
        ...demoUser,
        ...(profile || {}),
        handle: normalizeHandle((profile && profile.handle) || demoUser.handle),
      }
    }

    if (!profile) {
      return null
    }

    return {
      id: profile.id,
      name: profile.name,
      handle: normalizeHandle(profile.handle),
      bio: profile.bio || '',
      avatarUrl: profile.avatar_url || null,
    }
  }, [profile])

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) {
      return posts
    }

    return posts.filter((post) => postMatchesQuery(post, query))
  }, [posts, searchQuery])

  const localUserSearchPool = useMemo(() => {
    const pool = []

    if (currentUser) {
      pool.push({
        id: currentUser.id,
        name: currentUser.name,
        handle: normalizeHandle(currentUser.handle),
        bio: currentUser.bio || '',
        avatarUrl: currentUser.avatarUrl || null,
      })
    }

    for (const person of peopleToFollow) {
      pool.push({
        id: person.id,
        name: person.name,
        handle: normalizeHandle(person.handle),
        bio: person.role || '',
        avatarUrl: person.avatarUrl || null,
      })
    }

    for (const post of posts) {
      pool.push({
        id: post.user.id,
        name: post.user.name,
        handle: normalizeHandle(post.user.handle),
        bio: post.user.bio || '',
        avatarUrl: post.user.avatarUrl || null,
      })
    }

    const seen = new Set()
    return pool.filter((item) => {
      if (!item.id || seen.has(item.id)) {
        return false
      }
      seen.add(item.id)
      return true
    })
  }, [currentUser, peopleToFollow, posts])

  const selectedSpotify = useMemo(() => {
    return parseSpotifyUrl(composer.spotifyUrl)
  }, [composer.spotifyUrl])

  const filteredSpotifyLibrary = useMemo(() => {
    const query = spotifyPickerQuery.trim().toLowerCase()
    if (!query) {
      return spotifyPickerLibrary
    }

    return spotifyPickerLibrary.filter((item) => {
      const haystack = `${item.title} ${item.subtitle}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [spotifyPickerQuery])

  const activeDirectThread = useMemo(() => {
    return (
      directThreads.find((thread) => thread.id === activeDirectThreadId) ||
      directThreads[0] ||
      null
    )
  }, [activeDirectThreadId, directThreads])

  const totalDirectUnread = useMemo(() => {
    return directThreads.reduce((acc, thread) => acc + (thread.unread || 0), 0)
  }, [directThreads])

  const activeStoryGroup = useMemo(() => {
    if (!storyViewer.open) {
      return null
    }

    return stories.find((group) => group.userId === storyViewer.userId) || null
  }, [stories, storyViewer])

  const activeStoryItem = useMemo(() => {
    if (!activeStoryGroup) {
      return null
    }

    return activeStoryGroup.items[storyViewer.itemIndex] || null
  }, [activeStoryGroup, storyViewer.itemIndex])

  const directThemeStorageKey = useMemo(() => {
    return `waveloop:direct-mobile-bg:${currentUser?.id || 'anon'}`
  }, [currentUser?.id])

  const showDirectListPane = !isMobileViewport || directMobileView === 'list'
  const showDirectChatPane = !isMobileViewport || directMobileView === 'chat'
  const isDirectInitialLoading = loadingDirect && directThreads.length === 0

  const postsForView = useMemo(() => {
    if (activeNav === 'Direct') {
      return []
    }

    if (activeNav === 'Perfil') {
      if (!currentUser) {
        return []
      }

      return filteredPosts.filter((post) => post.user.id === currentUser.id)
    }

    if (activeNav === 'Descobrir') {
      return [...filteredPosts].sort((a, b) => b.likes + b.reposts * 2 - (a.likes + a.reposts * 2))
    }

    if (activeNav === 'Comunidades') {
      return filteredPosts.filter((post) => ['Calmo', 'Nostalgia', 'Noite'].includes(post.mood))
    }

    if (activeNav === 'Playlists') {
      return filteredPosts.filter((post) => post.track)
    }

    if (activeNav === 'Eventos') {
      return [...filteredPosts].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    }

    return filteredPosts
  }, [activeNav, currentUser, filteredPosts])

  const displayedPosts = useMemo(() => {
    if (publicProfile) {
      return publicProfile.posts || []
    }

    return postsForView
  }, [postsForView, publicProfile])

  const profileStats = useMemo(() => {
    if (!currentUser) {
      return { followers: 0, following: 0, mixes: 0 }
    }

    if (!isSupabaseConfigured) {
      return {
        followers: demoUser.followers,
        following: demoUser.following,
        mixes: demoUser.mixes,
      }
    }

    const ownPosts = posts.filter((post) => post.user.id === currentUser.id)

    return {
      followers: followStats.followers,
      following: followStats.following,
      mixes: ownPosts.length,
    }
  }, [currentUser, followStats, posts])

  const ownProfilePosts = useMemo(() => {
    if (!currentUser) {
      return []
    }

    return posts.filter((post) => post.user.id === currentUser.id)
  }, [currentUser, posts])

  const ownProfileTrackPosts = useMemo(() => {
    return ownProfilePosts.filter((post) => post.track)
  }, [ownProfilePosts])

  const communityStats = useMemo(() => {
    const total = communities.length
    const joined = communities.filter((community) => community.joined).length
    const mine = currentUser ? communities.filter((community) => community.creatorId === currentUser.id).length : 0

    return { total, joined, mine }
  }, [communities, currentUser])

  const filteredCommunities = useMemo(() => {
    const query = communityQuery.trim().toLowerCase()

    return communities.filter((community) => {
      const communityGenre = detectCommunityGenre(community)

      if (communityFilter === 'joined' && !community.joined) {
        return false
      }

      if (communityFilter === 'mine' && (!currentUser || community.creatorId !== currentUser.id)) {
        return false
      }

      if (communityGenreFilter !== 'all' && communityGenre !== communityGenreFilter) {
        return false
      }

      if (!query) {
        return true
      }

      const haystack = [
        community.name,
        community.description,
        community.creatorName,
        community.creatorHandle,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [communities, communityFilter, communityGenreFilter, communityQuery, currentUser])

  const selectedCommunity = useMemo(() => {
    if (!selectedCommunityId) {
      return filteredCommunities[0] || null
    }

    return filteredCommunities.find((community) => community.id === selectedCommunityId) || filteredCommunities[0] || null
  }, [filteredCommunities, selectedCommunityId])

  const selectedCommunityGenre = useMemo(() => {
    return selectedCommunity ? detectCommunityGenre(selectedCommunity) : ''
  }, [selectedCommunity])

  const activeCommunityFeed = useMemo(() => {
    if (!selectedCommunity?.id) {
      return []
    }

    return [...(communityFeedById[selectedCommunity.id] || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [communityFeedById, selectedCommunity])

  const activeCommunityTopics = useMemo(() => {
    if (!selectedCommunity?.id) {
      return []
    }

    return [...(communityTopicsById[selectedCommunity.id] || [])].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1
      }
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  }, [communityTopicsById, selectedCommunity])

  const activeCommunityCollabs = useMemo(() => {
    if (!selectedCommunity?.id) {
      return []
    }

    return [...(communityCollabsById[selectedCommunity.id] || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [communityCollabsById, selectedCommunity])

  const activeCommunityChallenges = useMemo(() => {
    if (!selectedCommunity?.id) {
      return []
    }

    return [...(communityChallengesById[selectedCommunity.id] || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [communityChallengesById, selectedCommunity])

  const engagement = useMemo(() => {
    return posts.reduce(
      (acc, post) => {
        acc.likes += post.likes
        acc.reposts += post.reposts
        acc.comments += post.comments.length
        return acc
      },
      { likes: 0, reposts: 0, comments: 0 },
    )
  }, [posts])

  const loadFeed = useCallback(async (userId) => {
    if (!isSupabaseConfigured || !userId) {
      return
    }

    setLoadingFeed(true)

    try {
      const feed = await fetchFeed(userId)
      setPosts(feed)
    } catch (error) {
      setErrorMessage(toMessage(error, 'Falha ao carregar o feed.'))
    } finally {
      setLoadingFeed(false)
    }
  }, [])

  const loadFollowStats = useCallback(async (userId) => {
    if (!isSupabaseConfigured || !userId) {
      return
    }

    try {
      const stats = await fetchFollowStats(userId)
      setFollowStats(stats)
    } catch (error) {
      setErrorMessage(toMessage(error, 'Falha ao carregar estatisticas de seguidores.'))
    }
  }, [])

  const loadPeopleToFollow = useCallback(async (userId) => {
    if (!isSupabaseConfigured || !userId) {
      setPeopleToFollow(buildLocalPeople())
      return
    }

    try {
      const people = await fetchPeopleToFollow({ userId, limit: 6 })
      setPeopleToFollow(people)
    } catch (error) {
      setErrorMessage(toMessage(error, 'Falha ao carregar sugestoes de pessoas.'))
    }
  }, [])

  const loadCommunities = useCallback(async (userId) => {
    if (!isSupabaseConfigured) {
      setCommunities(buildLocalCommunityCards())
      return
    }

    if (!userId) {
      setCommunities([])
      return
    }

    setLoadingCommunities(true)

    try {
      const nextCommunities = await fetchCommunities({ userId, limit: 48 })
      setCommunities(nextCommunities)
    } catch (error) {
      setCommunities([])
      setErrorMessage(toMessage(error, 'Falha ao carregar comunidades.'))
    } finally {
      setLoadingCommunities(false)
    }
  }, [])

  const loadCommunityRankings = useCallback(
    async (userId, options = {}) => {
      const period = options.period || communityRankPeriod
      const sourceCommunities = Array.isArray(options.communities) ? options.communities : communities
      const safeCommunities = (sourceCommunities || []).filter((community) => Boolean(community?.id))
      const communityIds = safeCommunities.map((community) => community.id)

      if (!userId || communityIds.length === 0) {
        setCommunityRankingsById({})
        setLoadingCommunityRankings(false)
        return
      }

      if (!isSupabaseConfigured) {
        setCommunityRankingsById(
          buildLocalCommunityLeaderboards({
            communities: safeCommunities,
            currentUser,
            period,
            limit: 3,
          }),
        )
        setLoadingCommunityRankings(false)
        return
      }

      const remoteCommunityIds = communityIds.filter((communityId) => isUuid(communityId))
      if (remoteCommunityIds.length === 0) {
        setCommunityRankingsById({})
        setLoadingCommunityRankings(false)
        return
      }

      setLoadingCommunityRankings(true)
      try {
        const rankingByCommunity = await fetchCommunitySpotifyLeaderboards({
          communityIds: remoteCommunityIds,
          period,
          limit: 3,
        })
        setCommunityRankingsById(rankingByCommunity || {})
      } catch (error) {
        setErrorMessage(toMessage(error, 'Falha ao carregar ranking das comunidades.'))
      } finally {
        setLoadingCommunityRankings(false)
      }
    },
    [communities, communityRankPeriod, currentUser],
  )

  const loadPlaylists = useCallback(async (userId) => {
    if (!isSupabaseConfigured || !userId) {
      setPlaylists(buildLocalPlaylistCards())
      return
    }

    setLoadingPlaylists(true)

    try {
      const nextPlaylists = await fetchSpotifyPlaylists({ userId, limit: 48 })
      setPlaylists(nextPlaylists)
    } catch (error) {
      setErrorMessage(toMessage(error, 'Falha ao carregar playlists.'))
    } finally {
      setLoadingPlaylists(false)
    }
  }, [])

  const readSpotifyTokenCache = useCallback((userId) => {
    if (typeof window === 'undefined' || !userId) {
      return null
    }

    const raw = window.localStorage.getItem(spotifyTokenStorageKey(userId))
    return parseJsonSafe(raw, null)
  }, [])

  const writeSpotifyTokenCache = useCallback((userId, payload) => {
    if (typeof window === 'undefined' || !userId) {
      return
    }

    if (!payload) {
      window.localStorage.removeItem(spotifyTokenStorageKey(userId))
      return
    }

    window.localStorage.setItem(spotifyTokenStorageKey(userId), JSON.stringify(payload))
  }, [])

  const refreshSpotifyAccessToken = useCallback(
    async (userId, refreshToken) => {
      if (!refreshToken) {
        throw new Error('Conexao Spotify expirada. Conecte sua conta novamente.')
      }

      if (!spotifyCapsuleClientId) {
        throw new Error('Configure VITE_SPOTIFY_CLIENT_ID para sincronizar com Spotify.')
      }

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: spotifyCapsuleClientId,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.access_token) {
        throw new Error(data.error_description || 'Nao foi possivel renovar o token do Spotify.')
      }

      const nextPayload = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 3600) - 60) * 1000,
        scope: data.scope || '',
      }

      writeSpotifyTokenCache(userId, nextPayload)
      return nextPayload.accessToken
    },
    [writeSpotifyTokenCache],
  )

  const ensureSpotifyAccessToken = useCallback(
    async (userId) => {
      const tokenData = readSpotifyTokenCache(userId)
      if (!tokenData?.accessToken) {
        throw new Error('Conecte sua conta Spotify para sincronizar a capsula.')
      }

      const expiresAt = Number(tokenData.expiresAt || 0)
      if (!expiresAt || Date.now() < expiresAt) {
        return tokenData.accessToken
      }

      return refreshSpotifyAccessToken(userId, tokenData.refreshToken)
    },
    [readSpotifyTokenCache, refreshSpotifyAccessToken],
  )

  const loadSpotifyCapsule = useCallback(
    async (userId, period = '4_weeks') => {
      if (!userId) {
        setSpotifyCapsuleConnection(null)
        setSpotifyCapsuleMine(null)
        setSpotifyCapsuleLeaderboard([])
        return
      }

      if (!isSupabaseConfigured) {
        const localBoard = buildLocalSpotifyCapsuleLeaderboard(demoUser)
          .filter((entry) => entry.period === period)
          .sort((a, b) => b.score - a.score)
        setSpotifyCapsuleConnection({
          userId,
          spotifyUserId: 'demo-user',
          displayName: demoUser.name || 'Demo User',
          avatarUrl: demoUser.avatarUrl || null,
          country: 'BR',
          product: 'premium',
          connectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
        })
        setSpotifyCapsuleLeaderboard(localBoard)
        setSpotifyCapsuleMine(localBoard.find((entry) => entry.userId === userId) || localBoard[0] || null)
        return
      }

      setLoadingSpotifyCapsule(true)
      try {
        const [connection, mine, leaderboard] = await Promise.all([
          fetchSpotifyConnection({ userId }),
          fetchLatestSpotifyCapsule({ userId, period }),
          fetchSpotifyCapsuleLeaderboard({ period, limit: 24 }),
        ])

        setSpotifyCapsuleConnection(connection)
        setSpotifyCapsuleMine(mine)
        setSpotifyCapsuleLeaderboard(leaderboard)
      } catch (error) {
        setErrorMessage(toMessage(error, 'Falha ao carregar a capsula Spotify.'))
      } finally {
        setLoadingSpotifyCapsule(false)
      }
    },
    [],
  )

  const syncSpotifyCapsule = useCallback(
    async (userId, options = {}) => {
      const period = options.period || spotifyCapsulePeriod
      const silent = Boolean(options.silent)
      if (!userId) {
        return
      }

      if (!silent) {
        setSyncingSpotifyCapsule(true)
      }

      try {
        const accessToken = await ensureSpotifyAccessToken(userId)
        const headers = { Authorization: `Bearer ${accessToken}` }

        const [profileResponse, topTracksResponse, topArtistsResponse] = await Promise.all([
          fetch('https://api.spotify.com/v1/me', { headers }),
          fetch(
            `https://api.spotify.com/v1/me/top/tracks?time_range=${encodeURIComponent(capsulePeriodRange(period))}&limit=20`,
            { headers },
          ),
          fetch(
            `https://api.spotify.com/v1/me/top/artists?time_range=${encodeURIComponent(capsulePeriodRange(period))}&limit=20`,
            { headers },
          ),
        ])

        const [profileData, tracksData, artistsData] = await Promise.all([
          profileResponse.json().catch(() => ({})),
          topTracksResponse.json().catch(() => ({})),
          topArtistsResponse.json().catch(() => ({})),
        ])

        if (!profileResponse.ok) {
          throw new Error(profileData.error?.message || 'Falha ao carregar perfil Spotify.')
        }

        if (!topTracksResponse.ok) {
          throw new Error(tracksData.error?.message || 'Falha ao carregar top tracks do Spotify.')
        }

        if (!topArtistsResponse.ok) {
          throw new Error(artistsData.error?.message || 'Falha ao carregar top artists do Spotify.')
        }

        const recentItems = await fetchSpotifyRecentHistory(accessToken, period)

        const topTracks = (tracksData.items || []).map((item) => ({
          id: item.id || '',
          name: item.name || '',
          artist: Array.isArray(item.artists) ? item.artists.map((artist) => artist?.name).filter(Boolean).join(', ') : '',
          imageUrl: item.album?.images?.[0]?.url || '',
          externalUrl: item.external_urls?.spotify || '',
          popularity: Number(item.popularity || 0),
          durationMs: Number(item.duration_ms || 0),
        }))

        const topArtists = (artistsData.items || []).map((item) => ({
          id: item.id || '',
          name: item.name || '',
          artist: '',
          imageUrl: item.images?.[0]?.url || '',
          externalUrl: item.external_urls?.spotify || '',
          popularity: Number(item.popularity || 0),
        }))

        const recentMinutes = recentItems.reduce((acc, item) => acc + Number(item?.track?.duration_ms || 0), 0) / 60000
        const topMinutes = topTracks.reduce((acc, item) => acc + Number(item.durationMs || 0), 0) / 60000
        const minutesEstimate = Math.max(0, Math.round(recentMinutes || topMinutes))
        const recentPlays = recentItems.length
        const uniqueTracks = new Set(topTracks.map((item) => item.id).filter(Boolean)).size
        const uniqueArtists = new Set(topArtists.map((item) => item.id).filter(Boolean)).size
        const averagePopularity =
          topTracks.length > 0
            ? topTracks.reduce((acc, item) => acc + Number(item.popularity || 0), 0) / topTracks.length
            : 0
        const topTrackMomentum =
          topTracks.length > 0
            ? topTracks.slice(0, 10).reduce((acc, item, index) => acc + Math.max(6, 20 - index) + Number(item.popularity || 0) / 20, 0)
            : 0
        const score = Math.max(
          0,
          Math.round(minutesEstimate * 0.65 + recentPlays * 4 + uniqueTracks * 14 + uniqueArtists * 12 + averagePopularity + topTrackMomentum),
        )

        const syncedAt = new Date().toISOString()
        await Promise.all([
          upsertSpotifyConnection({
            userId,
            spotifyUserId: profileData.id,
            displayName: profileData.display_name || profileData.id,
            avatarUrl: profileData.images?.[0]?.url || '',
            country: profileData.country || '',
            product: profileData.product || '',
            lastSyncedAt: syncedAt,
          }),
          createSpotifyCapsuleSnapshot({
            userId,
            period,
            score,
            topTracks,
            topArtists,
            recentPlays,
            minutesEstimate,
          }),
        ])

        await loadSpotifyCapsule(userId, period)
        setStatusMessage(
          `Capsula Spotify sincronizada (${capsulePeriodLabel(period)}): ${compact(recentPlays)} plays, ${compact(minutesEstimate)} min.`,
        )
      } catch (error) {
        setErrorMessage(toMessage(error, 'Nao foi possivel sincronizar a capsula Spotify.'))
      } finally {
        if (!silent) {
          setSyncingSpotifyCapsule(false)
        }
      }
    },
    [ensureSpotifyAccessToken, loadSpotifyCapsule, spotifyCapsulePeriod],
  )

  const loadStories = useCallback(async (userId) => {
    if (!isSupabaseConfigured || !userId) {
      return
    }

    setLoadingStories(true)

    try {
      const nextStories = await fetchActiveStories({ viewerUserId: userId })
      setStories(nextStories)
    } catch (error) {
      setErrorMessage(toMessage(error, 'Falha ao carregar stories.'))
    } finally {
      setLoadingStories(false)
    }
  }, [])

  const loadDirectInbox = useCallback(async (userId, preferredThreadId = '', options = {}) => {
    if (!isSupabaseConfigured || !userId) {
      return
    }

    const { silent = false } = options

    if (!silent) {
      setLoadingDirect(true)
    }

    try {
      const threads = await fetchDirectThreads({ userId })
      setDirectThreads(threads)
      setActiveDirectThreadId((current) => {
        if (preferredThreadId && threads.some((thread) => thread.id === preferredThreadId)) {
          return preferredThreadId
        }

        if (current && threads.some((thread) => thread.id === current)) {
          return current
        }

        return threads[0]?.id || ''
      })
    } catch (error) {
      setErrorMessage(toMessage(error, 'Falha ao carregar o direct.'))
    } finally {
      if (!silent) {
        setLoadingDirect(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadingAuth(false)
      return undefined
    }

    let isMounted = true

    const hydrateSession = async (nextSession) => {
      if (!isMounted) {
        return
      }

      setSession(nextSession)

      if (!nextSession?.user) {
        setProfile(null)
        setPosts([])
        setPlayingPostId('')
        setPublicProfile(null)
        setStories([])
        setStoryViewer({
          open: false,
          userId: '',
          itemIndex: 0,
        })
        setDirectThreads([])
        setActiveDirectThreadId('')
        setPeopleToFollow(buildLocalPeople())
        setCommunities(buildLocalCommunityCards())
        setCommunityRankingsById({})
        setLoadingCommunityRankings(false)
        setCommunityQuery('')
        setCommunityFilter('all')
        setCommunityGenreFilter('all')
        setCommunityWorkspaceTab('feed')
        setSelectedCommunityId('')
        setCommunityFeedById({})
        setCommunityCommentDrafts({})
        setCommunityPostDraft({
          type: 'music',
          title: '',
          text: '',
          spotifyUrl: '',
          mediaUrl: '',
          albumName: '',
          rating: 4,
        })
        setCommunityTopicsById({})
        setCommunityTopicDraft({ title: '', body: '' })
        setCommunityReplyDrafts({})
        setCommunityCollabsById({})
        setCommunityCollabDraft({ title: '', roleNeeded: '', details: '' })
        setCommunityChallengesById({})
        setCommunityChallengeDraft({ title: '', kind: 'cover', details: '', deadline: '' })
        setPlaylists(buildLocalPlaylistCards())
        setSpotifyCapsuleConnection(null)
        setSpotifyCapsuleMine(null)
        setSpotifyCapsuleLeaderboard([])
        setFollowStats({
          followers: demoUser.followers,
          following: demoUser.following,
        })
        return
      }

      try {
        const userProfile = await ensureProfile(nextSession.user)

        if (!isMounted) {
          return
        }

        setProfile(userProfile)
        await Promise.all([
          loadFeed(nextSession.user.id),
          loadFollowStats(nextSession.user.id),
          loadPeopleToFollow(nextSession.user.id),
          loadCommunities(nextSession.user.id),
          loadPlaylists(nextSession.user.id),
          loadSpotifyCapsule(nextSession.user.id, '4_weeks'),
          loadStories(nextSession.user.id),
          loadDirectInbox(nextSession.user.id),
        ])
      } catch (error) {
        if (isMounted) {
          setErrorMessage(toMessage(error, 'Nao foi possivel carregar o perfil.'))
        }
      }
    }

    const start = async () => {
      setLoadingAuth(true)

      try {
        const nextSession = await getSession()
        await hydrateSession(nextSession)
      } catch (error) {
        if (isMounted) {
          setErrorMessage(toMessage(error, 'Falha na inicializacao da autenticacao.'))
        }
      } finally {
        if (isMounted) {
          setLoadingAuth(false)
        }
      }
    }

    void start()

    const unsubscribe = listenAuthStateChange((nextSession) => {
      void hydrateSession(nextSession)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [loadCommunities, loadDirectInbox, loadFeed, loadFollowStats, loadPeopleToFollow, loadPlaylists, loadSpotifyCapsule, loadStories])

  useEffect(() => {
    if (activeDirectThread) {
      return
    }

    if (directThreads.length > 0) {
      setActiveDirectThreadId(directThreads[0].id)
    }
  }, [activeDirectThread, directThreads])

  useEffect(() => {
    if (!currentUser?.id) {
      return
    }

    void loadSpotifyCapsule(currentUser.id, spotifyCapsulePeriod)
  }, [currentUser?.id, loadSpotifyCapsule, spotifyCapsulePeriod])

  useEffect(() => {
    if (!currentUser?.id) {
      setCommunityRankingsById({})
      setLoadingCommunityRankings(false)
      return
    }

    void loadCommunityRankings(currentUser.id, { period: communityRankPeriod })
  }, [communities, communityRankPeriod, currentUser?.id, loadCommunityRankings])

  useEffect(() => {
    if (filteredCommunities.length === 0) {
      if (selectedCommunityId) {
        setSelectedCommunityId('')
      }
      return
    }

    if (!selectedCommunityId || !filteredCommunities.some((community) => community.id === selectedCommunityId)) {
      setSelectedCommunityId(filteredCommunities[0].id)
    }
  }, [filteredCommunities, selectedCommunityId])

  useEffect(() => {
    if (!communities.length) {
      setCommunityFeedById({})
      setCommunityTopicsById({})
      setCommunityCollabsById({})
      setCommunityChallengesById({})
      return
    }

    setCommunityFeedById((current) => {
      const next = { ...current }
      let changed = false
      for (const community of communities) {
        if (!next[community.id]) {
          next[community.id] = buildCommunityFeedSeed(community, currentUser)
          changed = true
        }
      }

      return changed ? next : current
    })

    setCommunityTopicsById((current) => {
      const next = { ...current }
      let changed = false
      for (const community of communities) {
        if (!next[community.id]) {
          next[community.id] = buildCommunityTopicsSeed(community)
          changed = true
        }
      }

      return changed ? next : current
    })

    setCommunityCollabsById((current) => {
      const next = { ...current }
      let changed = false
      for (const community of communities) {
        if (!next[community.id]) {
          next[community.id] = buildCommunityCollabSeed(community)
          changed = true
        }
      }

      return changed ? next : current
    })

    setCommunityChallengesById((current) => {
      const next = { ...current }
      let changed = false
      for (const community of communities) {
        if (!next[community.id]) {
          next[community.id] = buildCommunityChallengesSeed(community)
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [communities, currentUser])

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser?.id || typeof window === 'undefined') {
      return
    }

    if (spotifyAuthProcessingRef.current) {
      return
    }

    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const oauthError = url.searchParams.get('error')

    if (!code && !oauthError) {
      return
    }

    const cached = parseJsonSafe(window.sessionStorage.getItem(spotifyPkceStorageKey()), null)

    if (oauthError) {
      cleanupSpotifyAuthParams()
      window.sessionStorage.removeItem(spotifyPkceStorageKey())
      const oauthErrorDescription = url.searchParams.get('error_description')
      setErrorMessage(oauthErrorDescription || 'Falha ao conectar com Spotify.')
      return
    }

    if (!spotifyCapsuleClientId) {
      cleanupSpotifyAuthParams()
      window.sessionStorage.removeItem(spotifyPkceStorageKey())
      setErrorMessage('Configure VITE_SPOTIFY_CLIENT_ID para conectar Spotify.')
      return
    }

    if (!code || !state || !cached?.verifier || cached.state !== state || cached.userId !== currentUser.id) {
      cleanupSpotifyAuthParams()
      window.sessionStorage.removeItem(spotifyPkceStorageKey())
      setErrorMessage('Sessao de conexao Spotify invalida. Tente conectar novamente.')
      return
    }

    spotifyAuthProcessingRef.current = true

    void (async () => {
      try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: spotifyCapsuleClientId,
            redirect_uri: spotifyCapsuleRedirectUri,
            code_verifier: cached.verifier,
          }),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.access_token) {
          throw new Error(data.error_description || 'Nao foi possivel autenticar com Spotify.')
        }

        writeSpotifyTokenCache(currentUser.id, {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || '',
          expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 3600) - 60) * 1000,
          scope: data.scope || '',
        })

        cleanupSpotifyAuthParams()
        window.sessionStorage.removeItem(spotifyPkceStorageKey())
        await syncSpotifyCapsule(currentUser.id, {
          period: cached.period || spotifyCapsulePeriod,
          silent: true,
        })
      } catch (error) {
        cleanupSpotifyAuthParams()
        window.sessionStorage.removeItem(spotifyPkceStorageKey())
        setErrorMessage(toMessage(error, 'Falha ao concluir a conexao com Spotify.'))
      } finally {
        spotifyAuthProcessingRef.current = false
      }
    })()
  }, [currentUser, spotifyCapsulePeriod, syncSpotifyCapsule, writeSpotifyTokenCache])

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser?.id) {
      return undefined
    }

    let refreshTimeout = null
    let queuedThreadId = ''

    const queueDirectReload = (threadId = '') => {
      if (threadId) {
        queuedThreadId = threadId
      }

      if (refreshTimeout) {
        return
      }

      refreshTimeout = setTimeout(() => {
        refreshTimeout = null
        const preferredThreadId = queuedThreadId
        queuedThreadId = ''
        void loadDirectInbox(currentUser.id, preferredThreadId, { silent: true })
      }, 280)
    }

    const unsubscribe = subscribeDirectInbox({
      userId: currentUser.id,
      onChange: (event) => {
        if (!event) {
          return
        }

        const threadId = event.row?.thread_id || ''
        const senderId = event.row?.sender_id

        // Evita recarga duplicada quando eu mesmo envio mensagem (ja recarrega no submit).
        if (event.type === 'message_insert' && senderId === currentUser.id) {
          return
        }

        queueDirectReload(threadId)
      },
      onError: (error) => {
        setErrorMessage(toMessage(error, 'Falha ao sincronizar mensagens do direct em tempo real.'))
      },
    })

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
      unsubscribe()
    }
  }, [currentUser, loadDirectInbox])

  useEffect(() => {
    if (isSupabaseConfigured) {
      return
    }

    setStories(
      buildLocalStoryGroups({
        currentUser,
        posts,
        peopleToFollow,
      }),
    )
  }, [currentUser, peopleToFollow, posts])

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser?.id) {
      return undefined
    }

    let refreshTimeout = null

    const queueStoriesReload = () => {
      if (refreshTimeout) {
        return
      }

      refreshTimeout = setTimeout(() => {
        refreshTimeout = null
        void loadStories(currentUser.id)
      }, 300)
    }

    const unsubscribe = subscribeStories({
      userId: currentUser.id,
      onChange: () => {
        queueStoriesReload()
      },
      onError: (error) => {
        console.warn('Falha ao sincronizar stories em tempo real.', error)
      },
    })

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
      unsubscribe()
    }
  }, [currentUser, loadStories])

  useEffect(() => {
    if (!storyViewer.open) {
      return
    }

    const exists = stories.some((group) => group.userId === storyViewer.userId)
    if (exists) {
      return
    }

    setStoryViewer({
      open: false,
      userId: '',
      itemIndex: 0,
    })
  }, [stories, storyViewer])

  useEffect(() => {
    return () => {
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview)
      }

      if (profileAvatarPreview) {
        URL.revokeObjectURL(profileAvatarPreview)
      }

      if (storyMediaPreview) {
        URL.revokeObjectURL(storyMediaPreview)
      }

      if (likeBurstTimeoutRef.current) {
        clearTimeout(likeBurstTimeoutRef.current)
      }

      if (directReplyTimeoutRef.current) {
        clearTimeout(directReplyTimeoutRef.current)
      }

      if (storyAutoAdvanceRef.current) {
        clearTimeout(storyAutoAdvanceRef.current)
      }
    }
  }, [mediaPreview, profileAvatarPreview, storyMediaPreview])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const mediaQuery = window.matchMedia('(max-width: 760px)')
    const apply = (event) => {
      setIsMobileViewport(event.matches)
    }

    setIsMobileViewport(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', apply)
      return () => mediaQuery.removeEventListener('change', apply)
    }

    mediaQuery.addListener(apply)
    return () => mediaQuery.removeListener(apply)
  }, [])

  useEffect(() => {
    if (!currentUser) {
      return
    }

    setProfileDraft({
      name: currentUser.name,
      bio: currentUser.bio || '',
    })
  }, [currentUser])

  const clearComposerMedia = useCallback(() => {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview)
    }

    setMediaFile(null)
    setMediaPreview('')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [mediaPreview])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem('waveloop:theme-mode', themeMode)
  }, [themeMode])

  const openSpotifyPicker = useCallback(() => {
    setSpotifyPickerOpen(true)
    setSpotifyPickerQuery('')
    setSpotifyManualUrl(composer.spotifyUrl || '')
  }, [composer.spotifyUrl])

  const closeSpotifyPicker = useCallback(() => {
    setSpotifyPickerOpen(false)
    setSpotifyPickerQuery('')
  }, [])

  const chooseSpotifyUrl = useCallback(
    (url) => {
      const parsed = parseSpotifyUrl(url)
      if (!parsed) {
        setErrorMessage('Link do Spotify invalido.')
        return
      }

      setComposer((current) => ({ ...current, spotifyUrl: parsed.url }))
      setSpotifyManualUrl(parsed.url)
      setSpotifyPickerOpen(false)
      setStatusMessage(`Spotify selecionado: ${parsed.type}.`)
    },
    [setComposer],
  )

  const mutatePostEverywhere = useCallback((postId, recipe) => {
    setPosts((current) => current.map((post) => (post.id === postId ? recipe(post) : post)))
    setPublicProfile((current) => {
      if (!current) {
        return current
      }

      let changed = false
      const nextPosts = (current.posts || []).map((post) => {
        if (post.id !== postId) {
          return post
        }

        changed = true
        return recipe(post)
      })

      if (!changed) {
        return current
      }

      return {
        ...current,
        posts: nextPosts,
      }
    })
  }, [])

  const activateNav = useCallback((nextNav) => {
    setActiveNav(nextNav)
    setPublicProfile(null)
  }, [])

  const openDirectThread = useCallback(
    async (threadId, options = {}) => {
      const { moveToDirect = false } = options
      if (!threadId) {
        return
      }

      setActiveDirectThreadId(threadId)
      if (isMobileViewport) {
        setDirectMobileView('chat')
      }
      setDirectThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                unread: 0,
              }
            : thread,
        ),
      )

      if (moveToDirect) {
        activateNav('Direct')
      }

      if (isSupabaseConfigured && currentUser?.id) {
        try {
          await markDirectThreadRead({
            threadId,
            userId: currentUser.id,
          })
          await loadDirectInbox(currentUser.id, threadId, { silent: true })
        } catch (error) {
          setErrorMessage(toMessage(error, 'Nao foi possivel abrir este direct agora.'))
        }
      }
    },
    [activateNav, currentUser, isMobileViewport, loadDirectInbox],
  )

  const sendDirectMessage = async (event) => {
    event.preventDefault()

    const text = directDraft.trim()
    if (!text || !activeDirectThread || !currentUser) {
      return
    }

    if (isSupabaseConfigured) {
      setSendingDirect(true)

      try {
        await sendDirectMessageToThread({
          threadId: activeDirectThread.id,
          senderId: currentUser.id,
          content: text,
        })
        setDirectDraft('')
        await loadDirectInbox(currentUser.id, activeDirectThread.id, { silent: true })
      } catch (error) {
        setErrorMessage(toMessage(error, 'Nao foi possivel enviar a mensagem no direct.'))
      } finally {
        setSendingDirect(false)
      }

      return
    }

    const createdAt = new Date().toISOString()
    const outgoingMessage = {
      id: `dm-${Date.now()}`,
      senderId: currentUser.id,
      text,
      createdAt,
    }

    setDirectThreads((current) =>
      sortDirectThreads(
        current.map((thread) =>
          thread.id === activeDirectThread.id
            ? {
                ...thread,
                unread: 0,
                updatedAt: createdAt,
                messages: [...thread.messages, outgoingMessage],
              }
            : thread,
        ),
      ),
    )

    setDirectDraft('')

    if (directReplyTimeoutRef.current) {
      clearTimeout(directReplyTimeoutRef.current)
    }

    directReplyTimeoutRef.current = setTimeout(() => {
      setDirectThreads((current) => {
        const target = current.find((thread) => thread.id === activeDirectThread.id)
        if (!target) {
          return current
        }

        const replyAt = new Date().toISOString()
        const replyMessage = {
          id: `dm-reply-${Date.now()}`,
          senderId: target.participant.id,
          text: directReplyLibrary[Math.floor(Math.random() * directReplyLibrary.length)],
          createdAt: replyAt,
        }

        return sortDirectThreads(
          current.map((thread) =>
            thread.id === target.id
              ? {
                  ...thread,
                  unread: activeDirectThreadId === thread.id ? 0 : thread.unread + 1,
                  updatedAt: replyAt,
                  messages: [...thread.messages, replyMessage],
                }
              : thread,
          ),
        )
      })
    }, 1100)
  }

  const openOrCreateDirectWithUser = async (targetProfile) => {
    if (!currentUser || !targetProfile?.id || targetProfile.id === currentUser.id) {
      return
    }

    if (isSupabaseConfigured) {
      try {
        const threadId = await createOrGetDirectThread({
          userId: currentUser.id,
          targetUserId: targetProfile.id,
        })
        await loadDirectInbox(currentUser.id, threadId, { silent: true })
        activateNav('Direct')
        if (isMobileViewport) {
          setDirectMobileView('chat')
        }
      } catch (error) {
        setErrorMessage(toMessage(error, 'Nao foi possivel iniciar este direct agora.'))
      }

      return
    }

    const normalizedHandle = normalizeHandle(targetProfile.handle || targetProfile.name)
    const existing = directThreads.find(
      (thread) => normalizeHandle(thread.participant.handle) === normalizedHandle,
    )

    if (existing) {
      await openDirectThread(existing.id, { moveToDirect: true })
      return
    }

    const nowIso = new Date().toISOString()
    const newThread = {
      id: `dm-local-${Date.now()}`,
      participant: {
        id: targetProfile.id,
        name: targetProfile.name || 'Usuario',
        handle: normalizedHandle,
        avatarUrl: targetProfile.avatarUrl || null,
        online: false,
      },
      unread: 0,
      updatedAt: nowIso,
      messages: [],
    }

    setDirectThreads((current) => sortDirectThreads([newThread, ...current]))
    setActiveDirectThreadId(newThread.id)
    activateNav('Direct')
    if (isMobileViewport) {
      setDirectMobileView('chat')
    }
  }

  const clearStoryComposerMedia = useCallback(() => {
    if (storyMediaPreview) {
      URL.revokeObjectURL(storyMediaPreview)
    }

    setStoryMediaFile(null)
    setStoryMediaPreview('')

    if (storyMediaInputRef.current) {
      storyMediaInputRef.current.value = ''
    }
  }, [storyMediaPreview])

  const openStoryComposer = useCallback(() => {
    if (!currentUser) {
      return
    }

    setStoryDraft({
      text: '',
      track: '',
      artist: '',
    })
    clearStoryComposerMedia()
    setStoryComposerOpen(true)
  }, [clearStoryComposerMedia, currentUser])

  const closeStoryComposer = useCallback(() => {
    setStoryComposerOpen(false)
    clearStoryComposerMedia()
  }, [clearStoryComposerMedia])

  const openStoryGroup = useCallback((userId, itemIndex = 0) => {
    if (!userId) {
      return
    }

    setStoryViewer({
      open: true,
      userId,
      itemIndex,
    })
  }, [])

  const closeStoryViewer = useCallback(() => {
    setStoryViewer({
      open: false,
      userId: '',
      itemIndex: 0,
    })
  }, [])

  const goToNextStory = useCallback(() => {
    setStoryViewer((current) => {
      if (!current.open) {
        return current
      }

      const currentGroupIndex = stories.findIndex((group) => group.userId === current.userId)
      if (currentGroupIndex < 0) {
        return {
          open: false,
          userId: '',
          itemIndex: 0,
        }
      }

      const currentGroup = stories[currentGroupIndex]
      if (current.itemIndex < currentGroup.items.length - 1) {
        return {
          ...current,
          itemIndex: current.itemIndex + 1,
        }
      }

      const nextGroup = stories.slice(currentGroupIndex + 1).find((group) => group.items.length > 0)
      if (!nextGroup) {
        return {
          open: false,
          userId: '',
          itemIndex: 0,
        }
      }

      return {
        open: true,
        userId: nextGroup.userId,
        itemIndex: 0,
      }
    })
  }, [stories])

  const goToPrevStory = useCallback(() => {
    setStoryViewer((current) => {
      if (!current.open) {
        return current
      }

      const currentGroupIndex = stories.findIndex((group) => group.userId === current.userId)
      if (currentGroupIndex < 0) {
        return current
      }

      if (current.itemIndex > 0) {
        return {
          ...current,
          itemIndex: current.itemIndex - 1,
        }
      }

      const previousGroups = stories.slice(0, currentGroupIndex).filter((group) => group.items.length > 0)
      if (!previousGroups.length) {
        return current
      }

      const previousGroup = previousGroups[previousGroups.length - 1]
      return {
        open: true,
        userId: previousGroup.userId,
        itemIndex: Math.max(0, previousGroup.items.length - 1),
      }
    })
  }, [stories])

  const markStoryViewedLocally = useCallback((storyId) => {
    setStories((current) =>
      current.map((group) => {
        let changed = false
        const nextItems = group.items.map((item) => {
          if (item.id !== storyId || item.viewed) {
            return item
          }

          changed = true
          return {
            ...item,
            viewed: true,
          }
        })

        if (!changed) {
          return group
        }

        return {
          ...group,
          items: nextItems,
          hasUnviewed: nextItems.some((item) => !item.viewed),
        }
      }),
    )
  }, [])

  const onSelectStoryMedia = (event) => {
    const [file] = event.target.files || []

    if (!file) {
      clearStoryComposerMedia()
      return
    }

    if (!isAllowedFile(file)) {
      setErrorMessage('Story aceita apenas imagem ou audio.')
      clearStoryComposerMedia()
      return
    }

    if (storyMediaPreview) {
      URL.revokeObjectURL(storyMediaPreview)
    }

    setStoryMediaFile(file)
    setStoryMediaPreview(URL.createObjectURL(file))
  }

  const publishStory = async (event) => {
    event.preventDefault()

    if (!currentUser) {
      return
    }

    const text = storyDraft.text.trim()
    const trackTitle = storyDraft.track.trim()
    const trackArtist = storyDraft.artist.trim()

    if ((trackTitle && !trackArtist) || (!trackTitle && trackArtist)) {
      setErrorMessage('Preencha nome da faixa e artista juntos no story.')
      return
    }

    if (!text && !trackTitle && !trackArtist && !storyMediaFile) {
      setErrorMessage('Escreva algo, informe uma faixa ou adicione midia ao story.')
      return
    }

    setPublishingStory(true)
    setErrorMessage('')

    try {
      if (isSupabaseConfigured) {
        await createStory({
          userId: currentUser.id,
          content: text,
          trackTitle,
          trackArtist,
          mediaFile: storyMediaFile,
        })
        await loadStories(currentUser.id)
      } else {
        const createdAt = new Date().toISOString()
        let localMedia = null

        if (storyMediaFile) {
          const base64 = await readFileAsDataUrl(storyMediaFile)
          localMedia = {
            url: base64,
            type: inferMediaKindFromFile(storyMediaFile) || 'image',
          }
        }

        const newStory = {
          id: `local-story-new-${Date.now()}`,
          userId: currentUser.id,
          user: {
            id: currentUser.id,
            name: currentUser.name,
            handle: normalizeHandle(currentUser.handle),
            avatarUrl: currentUser.avatarUrl || null,
          },
          text,
          media: localMedia,
          track: trackTitle && trackArtist ? { title: trackTitle, artist: trackArtist } : null,
          createdAt,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          viewed: true,
          own: true,
        }

        setStories((current) => {
          const existing = current.find((group) => group.userId === currentUser.id)
          if (!existing) {
            return sortStoryGroups([
              {
                userId: currentUser.id,
                user: newStory.user,
                own: true,
                latestAt: createdAt,
                hasUnviewed: false,
                items: [newStory],
              },
              ...current,
            ])
          }

          const next = current.map((group) =>
            group.userId === currentUser.id
              ? {
                  ...group,
                  own: true,
                  latestAt: createdAt,
                  hasUnviewed: false,
                  items: [...group.items, newStory].slice(-6),
                }
              : group,
          )

          return sortStoryGroups(next)
        })
      }

      closeStoryComposer()
      setStatusMessage('Story publicado com sucesso.')
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel publicar o story.'))
    } finally {
      setPublishingStory(false)
    }
  }

  useEffect(() => {
    if (!storyViewer.open || !activeStoryItem || !currentUser) {
      return
    }

    markStoryViewedLocally(activeStoryItem.id)

    if (isSupabaseConfigured && !activeStoryItem.own && !activeStoryItem.viewed) {
      void markStoryViewed({
        storyId: activeStoryItem.id,
        userId: currentUser.id,
      }).catch((error) => {
        setErrorMessage(toMessage(error, 'Nao foi possivel atualizar visualizacao do story.'))
      })
    }
  }, [activeStoryItem, currentUser, markStoryViewedLocally, storyViewer.open])

  useEffect(() => {
    if (!storyViewer.open || !activeStoryItem) {
      return
    }

    const duration = activeStoryItem.media?.type === 'audio' ? 7600 : 4800

    if (storyAutoAdvanceRef.current) {
      clearTimeout(storyAutoAdvanceRef.current)
    }

    storyAutoAdvanceRef.current = setTimeout(() => {
      goToNextStory()
    }, duration)

    return () => {
      if (storyAutoAdvanceRef.current) {
        clearTimeout(storyAutoAdvanceRef.current)
      }
    }
  }, [activeStoryItem, goToNextStory, storyViewer.open])

  useEffect(() => {
    const query = searchQuery.trim()

    if (query.length < 2) {
      setUserSearchResults([])
      setLoadingUserSearch(false)
      return
    }

    let cancelled = false
    setLoadingUserSearch(true)

    const load = async () => {
      if (isSupabaseConfigured && currentUser?.id) {
        try {
          const results = await searchProfiles({
            query,
            limit: 8,
            viewerUserId: currentUser.id,
          })

          if (!cancelled) {
            setUserSearchResults(results)
          }
        } catch (error) {
          if (!cancelled) {
            setErrorMessage(toMessage(error, 'Falha ao buscar usuarios.'))
            setUserSearchResults([])
          }
        } finally {
          if (!cancelled) {
            setLoadingUserSearch(false)
          }
        }

        return
      }

      const normalizedQuery = query.toLowerCase()
      const results = localUserSearchPool
        .filter((user) => {
          const name = String(user.name || '').toLowerCase()
          const handle = String(normalizeHandle(user.handle || '')).toLowerCase()
          return name.includes(normalizedQuery) || handle.includes(normalizedQuery)
        })
        .slice(0, 8)

      if (!cancelled) {
        setUserSearchResults(results)
        setLoadingUserSearch(false)
      }
    }

    const timeout = setTimeout(() => {
      void load()
    }, 240)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [currentUser, localUserSearchPool, searchQuery])

  const setActionBusy = useCallback((actionId, value) => {
    setBusyActions((current) => ({ ...current, [actionId]: value }))
  }, [])

  const triggerLikeBurst = useCallback((postId) => {
    if (likeBurstTimeoutRef.current) {
      clearTimeout(likeBurstTimeoutRef.current)
    }

    setLikeBurstId(postId)

    likeBurstTimeoutRef.current = setTimeout(() => {
      setLikeBurstId('')
    }, 620)
  }, [])

  const handleAuthChange = (field, value) => {
    setAuthForm((current) => ({ ...current, [field]: value }))
  }

  const submitAuth = async (event) => {
    event.preventDefault()

    const email = authForm.email.trim()
    const password = authForm.password.trim()
    const name = authForm.name.trim()

    if (!email || !password || (authMode === 'signup' && !name)) {
      setErrorMessage('Preencha todos os campos obrigatorios.')
      return
    }

    setAuthBusy(true)
    setErrorMessage('')

    try {
      if (authMode === 'signin') {
        await signIn({ email, password })
        setStatusMessage('')
      } else {
        const data = await signUp({ name, email, password })

        if (data.session) {
          setStatusMessage('Conta criada e login efetuado.')
        } else {
          setStatusMessage('Conta criada. Verifique seu email para confirmar o cadastro.')
        }
      }
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel autenticar com esses dados.'))
    } finally {
      setAuthBusy(false)
    }
  }

  const submitGoogleAuth = async () => {
    if (!isSupabaseConfigured) {
      return
    }

    setAuthGoogleBusy(true)
    setErrorMessage('')
    setStatusMessage('Redirecionando para login com Google...')

    try {
      const data = await signInWithGoogle()
      if (data?.url && typeof window !== 'undefined') {
        window.location.assign(data.url)
        return
      }
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel iniciar login com Google.'))
      setStatusMessage('')
    } finally {
      setAuthGoogleBusy(false)
    }
  }

  const handleLogout = async () => {
    if (!isSupabaseConfigured) {
      return
    }

    try {
      await signOut()
      setStatusMessage('Sessao encerrada.')
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel sair da sessao.'))
    }
  }

  const handleComposer = (field, value) => {
    setComposer((current) => ({ ...current, [field]: value }))
  }

  const onSelectMedia = (event) => {
    const [file] = event.target.files || []

    if (!file) {
      clearComposerMedia()
      return
    }

    if (!isAllowedFile(file)) {
      setErrorMessage('Envie apenas imagem ou audio para o post.')
      clearComposerMedia()
      return
    }

    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview)
    }

    setMediaFile(file)
    setMediaPreview(URL.createObjectURL(file))
  }

  const publishPost = async () => {
    const text = composer.text.trim()
    const trackTitle = composer.track.trim()
    const trackArtist = composer.artist.trim()
    const spotifyInput = composer.spotifyUrl.trim()
    const spotify = spotifyInput ? parseSpotifyUrl(spotifyInput) : null

    if ((trackTitle && !trackArtist) || (!trackTitle && trackArtist)) {
      setErrorMessage('Preencha nome da faixa e artista juntos.')
      return
    }

    if (spotifyInput && !spotify) {
      setErrorMessage('Link do Spotify invalido. Use URL de faixa, playlist, album ou artista.')
      return
    }

    if (!text && !trackTitle && !trackArtist && !mediaFile && !spotify) {
      setErrorMessage('Escreva algo, informe uma faixa ou adicione midia.')
      return
    }

    setPublishing(true)
    setErrorMessage('')

    try {
      if (isSupabaseConfigured) {
        if (!session?.user || !currentUser) {
          throw new Error('Faca login para publicar.')
        }

        const created = await createPost({
          userId: session.user.id,
          currentUserId: session.user.id,
          content: text || 'Novo drop sem legenda ainda.',
          mood: composer.mood,
          trackTitle,
          trackArtist,
          spotifyUrl: spotify?.url || '',
          mediaFile,
        })

        setPosts((current) => [created, ...current])
      } else {
        let localMedia = null

        if (mediaFile) {
          const base64 = await readFileAsDataUrl(mediaFile)
          localMedia = {
            url: base64,
            type: inferMediaKindFromFile(mediaFile) || 'image',
          }
        }

        const post = {
          id: `local-${Date.now()}`,
          user: {
            id: demoUser.id,
            name: demoUser.name,
            handle: demoUser.handle,
          },
          createdAt: new Date().toISOString(),
          mood: composer.mood,
          text: text || 'Novo drop sem legenda ainda.',
          track: trackTitle && trackArtist ? { title: trackTitle, artist: trackArtist } : null,
          spotify,
          media: localMedia,
          likes: 0,
          reposts: 0,
          liked: false,
          reposted: false,
          comments: [],
        }

        setPosts((current) => [post, ...current])
      }

      setComposer({ text: '', track: '', artist: '', spotifyUrl: '', mood: moods[0] })
      clearComposerMedia()
      setShowComposer(false)
      setStatusMessage('Post publicado com sucesso.')
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel publicar o post.'))
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    if (activeNav !== 'Feed' || publicProfile) {
      setShowComposer(false)
    }
  }, [activeNav, publicProfile])

  useEffect(() => {
    if (activeNav !== 'Perfil') {
      setProfileTab('posts')
    }
  }, [activeNav])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const saved = window.localStorage.getItem(directThemeStorageKey)
    if (saved) {
      setDirectMobileBg(saved)
      return
    }

    setDirectMobileBg(directMobileThemePresets[0].color)
  }, [directThemeStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(directThemeStorageKey, directMobileBg)
  }, [directMobileBg, directThemeStorageKey])

  useEffect(() => {
    if (activeNav !== 'Direct') {
      setDirectThemeOpen(false)
    }
  }, [activeNav])

  useEffect(() => {
    if (!isMobileViewport) {
      setDirectMobileView('chat')
      return
    }

    if (activeNav === 'Direct') {
      setDirectMobileView('list')
    }
  }, [activeNav, isMobileViewport])

  const toggleReaction = async (postId, kind) => {
    if (!currentUser) {
      return
    }

    if (!isSupabaseConfigured) {
      const target = posts.find((post) => post.id === postId)
      if (kind === 'like' && target && !target.liked) {
        triggerLikeBurst(postId)
      }

      mutatePostEverywhere(postId, (post) => {
        if (kind === 'like') {
          const liked = !post.liked
          return {
            ...post,
            liked,
            likes: post.likes + (liked ? 1 : -1),
          }
        }

        const reposted = !post.reposted
        return {
          ...post,
          reposted,
          reposts: post.reposts + (reposted ? 1 : -1),
        }
      })

      return
    }

    const actionId = `${kind}:${postId}`
    setActionBusy(actionId, true)

    try {
      const result =
        kind === 'like'
          ? await toggleLike({ postId, userId: currentUser.id })
          : await toggleRepost({ postId, userId: currentUser.id })

      if (kind === 'like' && result.active) {
        triggerLikeBurst(postId)
      }

      mutatePostEverywhere(postId, (post) => {
        if (kind === 'like') {
          return {
            ...post,
            liked: result.active,
            likes: result.count,
          }
        }

        return {
          ...post,
          reposted: result.active,
          reposts: result.count,
        }
      })
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel atualizar esta interacao.'))
    } finally {
      setActionBusy(actionId, false)
    }
  }

  const submitComment = async (event, postId) => {
    event.preventDefault()

    const text = (commentDrafts[postId] || '').trim()
    if (!text || !currentUser) {
      return
    }

    const actionId = `comment:${postId}`
    setActionBusy(actionId, true)

    try {
      if (isSupabaseConfigured) {
        const comment = await addComment({
          postId,
          userId: currentUser.id,
          content: text,
        })

        mutatePostEverywhere(postId, (post) => ({
          ...post,
          comments: [...post.comments, comment],
        }))
      } else {
        const comment = {
          id: `local-comment-${Date.now()}`,
          authorName: demoUser.name,
          authorHandle: demoUser.handle,
          authorAvatarUrl: currentUser.avatarUrl || null,
          text,
          createdAt: new Date().toISOString(),
        }

        mutatePostEverywhere(postId, (post) => ({
          ...post,
          comments: [...post.comments, comment],
        }))
      }

      setCommentDrafts((current) => ({ ...current, [postId]: '' }))
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel enviar o comentario.'))
    } finally {
      setActionBusy(actionId, false)
    }
  }

  const clearProfileAvatarSelection = () => {
    if (profileAvatarPreview) {
      URL.revokeObjectURL(profileAvatarPreview)
    }

    setProfileAvatarPreview('')
    setProfileAvatarFile(null)

    if (profileAvatarInputRef.current) {
      profileAvatarInputRef.current.value = ''
    }
  }

  const openProfileEditor = () => {
    if (!currentUser) {
      return
    }

    setProfileDraft({
      name: currentUser.name || '',
      bio: currentUser.bio || '',
    })
    clearProfileAvatarSelection()
    setProfileEditorOpen(true)
  }

  const closeProfileEditor = () => {
    setProfileEditorOpen(false)
    clearProfileAvatarSelection()
  }

  const onSelectProfileAvatar = (event) => {
    const [file] = event.target.files || []

    if (!file) {
      clearProfileAvatarSelection()
      return
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Avatar precisa ser uma imagem.')
      clearProfileAvatarSelection()
      return
    }

    if (profileAvatarPreview) {
      URL.revokeObjectURL(profileAvatarPreview)
    }

    setProfileAvatarFile(file)
    setProfileAvatarPreview(URL.createObjectURL(file))
  }

  const saveOwnProfile = async (event) => {
    event.preventDefault()

    if (!currentUser) {
      return
    }

    const name = profileDraft.name.trim()
    const bio = profileDraft.bio.trim()

    if (!name) {
      setErrorMessage('Nome do perfil nao pode ficar vazio.')
      return
    }

    setProfileSaving(true)
    setErrorMessage('')

    try {
      if (isSupabaseConfigured) {
        const updatedProfile = await updateOwnProfile({
          userId: currentUser.id,
          name,
          bio,
          avatarFile: profileAvatarFile,
        })

        setProfile(updatedProfile)
        setPosts((current) =>
          current.map((post) =>
            post.user.id === currentUser.id
              ? {
                  ...post,
                  user: {
                    ...post.user,
                    name: updatedProfile.name,
                    handle: normalizeHandle(updatedProfile.handle),
                    bio: updatedProfile.bio || '',
                    avatarUrl: updatedProfile.avatar_url || null,
                  },
                }
              : post,
          ),
        )
        setPublicProfile((current) => {
          if (!current || current.profile.id !== currentUser.id) {
            return current
          }

          return {
            ...current,
            profile: {
              ...current.profile,
              name: updatedProfile.name,
              bio: updatedProfile.bio || '',
              avatarUrl: updatedProfile.avatar_url || null,
            },
            posts: (current.posts || []).map((post) => ({
              ...post,
              user: {
                ...post.user,
                name: updatedProfile.name,
                handle: normalizeHandle(updatedProfile.handle),
                bio: updatedProfile.bio || '',
                avatarUrl: updatedProfile.avatar_url || null,
              },
            })),
          }
        })
      } else {
        const avatarUrl = profileAvatarFile ? await readFileAsDataUrl(profileAvatarFile) : currentUser.avatarUrl || null

        setProfile((current) => ({
          ...(current || demoUser),
          id: demoUser.id,
          handle: normalizeHandle((current && current.handle) || demoUser.handle),
          name,
          bio,
          avatarUrl,
        }))

        setPosts((current) =>
          current.map((post) =>
            post.user.id === demoUser.id
              ? {
                  ...post,
                  user: {
                    ...post.user,
                    name,
                    avatarUrl,
                  },
                }
              : post,
          ),
        )

        setPublicProfile((current) => {
          if (!current || current.profile.id !== demoUser.id) {
            return current
          }

          return {
            ...current,
            profile: {
              ...current.profile,
              name,
              bio,
              avatarUrl,
            },
            posts: (current.posts || []).map((post) => ({
              ...post,
              user: {
                ...post.user,
                name,
                avatarUrl,
              },
            })),
          }
        })
      }

      setStatusMessage('Perfil atualizado com sucesso.')
      closeProfileEditor()
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel atualizar o perfil.'))
    } finally {
      setProfileSaving(false)
    }
  }

  const handleFollowToggle = async (targetUserId) => {
    if (!currentUser || !targetUserId || currentUser.id === targetUserId) {
      return
    }

    if (!isSupabaseConfigured) {
      const wasFollowing = Boolean(peopleToFollow.find((person) => person.id === targetUserId)?.followed)

      setPeopleToFollow((current) =>
        current.map((person) =>
          person.id === targetUserId
            ? {
                ...person,
                followed: !person.followed,
                followers: Math.max(0, person.followers + (person.followed ? -1 : 1)),
              }
            : person,
        ),
      )

      setFollowStats((current) => ({
        ...current,
        following: Math.max(0, current.following + (wasFollowing ? -1 : 1)),
      }))

      setPublicProfile((current) => {
        if (!current || current.profile.id !== targetUserId) {
          return current
        }

        const nextFollowing = !current.isFollowing
        return {
          ...current,
          isFollowing: nextFollowing,
          followers: Math.max(0, current.followers + (nextFollowing ? 1 : -1)),
        }
      })

      return
    }

    try {
      const result = await toggleFollowUser({
        followerId: currentUser.id,
        followingId: targetUserId,
      })

      setPeopleToFollow((current) =>
        current.map((person) =>
          person.id === targetUserId
            ? {
                ...person,
                followed: result.following,
                followers: result.targetFollowersCount,
              }
            : person,
        ),
      )

      setFollowStats((current) => ({
        ...current,
        following: result.ownFollowingCount,
      }))

      setPublicProfile((current) => {
        if (!current || current.profile.id !== targetUserId) {
          return current
        }

        return {
          ...current,
          isFollowing: result.following,
          followers: result.targetFollowersCount,
        }
      })

      await Promise.allSettled([loadFollowStats(currentUser.id), loadPeopleToFollow(currentUser.id)])
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel atualizar follow agora.'))
    }
  }

  const openPublicProfile = async (handle) => {
    const normalizedHandle = normalizeHandle(handle || '').trim()
    if (!normalizedHandle) {
      return
    }

    if (currentUser && normalizedHandle === normalizeHandle(currentUser.handle)) {
      setPublicProfile({
        profile: {
          id: currentUser.id,
          name: currentUser.name,
          handle: normalizeHandle(currentUser.handle),
          bio: currentUser.bio || '',
          avatarUrl: currentUser.avatarUrl || null,
        },
        followers: profileStats.followers,
        following: profileStats.following,
        isFollowing: false,
        posts: posts.filter((post) => post.user.id === currentUser.id),
      })
      return
    }

    if (!isSupabaseConfigured) {
      const localPosts = posts.filter(
        (post) => normalizeHandle(post.user.handle).toLowerCase() === normalizedHandle.toLowerCase(),
      )

      const person =
        peopleToFollow.find((entry) => normalizeHandle(entry.handle).toLowerCase() === normalizedHandle.toLowerCase()) ||
        localPosts[0]?.user

      if (!person) {
        setErrorMessage('Perfil nao encontrado.')
        return
      }

      setPublicProfile({
        profile: {
          id: person.id,
          name: person.name,
          handle: normalizeHandle(person.handle),
          bio: person.role || person.bio || 'Perfil da comunidade WaveLoop.',
          avatarUrl: person.avatarUrl || null,
        },
        followers: person.followers || 0,
        following: 0,
        isFollowing: Boolean(person.followed),
        posts: localPosts,
      })
      return
    }

    setLoadingPublicProfile(true)

    try {
      const profileData = await fetchPublicProfileByHandle({
        handle: normalizedHandle,
        viewerUserId: currentUser?.id || null,
      })
      setPublicProfile(profileData)
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel abrir este perfil agora.'))
    } finally {
      setLoadingPublicProfile(false)
    }
  }

  const closePublicProfile = () => {
    setPublicProfile(null)
  }

  const connectSpotifyCapsule = async () => {
    if (!currentUser?.id) {
      setErrorMessage('Entre na sua conta para conectar com Spotify.')
      return
    }

    if (!spotifyCapsuleClientId) {
      const typedClientId =
        typeof window !== 'undefined'
          ? window.prompt('Cole seu Spotify Client ID para ativar a conexao:')?.trim() || ''
          : ''

      if (typedClientId) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('waveloop:spotify-client-id', typedClientId)
          window.location.reload()
        }
        return
      }

      setErrorMessage('Defina VITE_SPOTIFY_CLIENT_ID no .env (ou informe o Client ID no prompt).')
      return
    }

    try {
      const verifier = randomSpotifyPkceString(96)
      const challenge = await makeSpotifyCodeChallenge(verifier)
      const state = `waveloop_spotify_${crypto.randomUUID()}`

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          spotifyPkceStorageKey(),
          JSON.stringify({
            state,
            verifier,
            userId: currentUser.id,
            period: spotifyCapsulePeriod,
            createdAt: Date.now(),
          }),
        )
      }

      const authorizeUrl = new URL('https://accounts.spotify.com/authorize')
      authorizeUrl.searchParams.set('response_type', 'code')
      authorizeUrl.searchParams.set('client_id', spotifyCapsuleClientId)
      authorizeUrl.searchParams.set('redirect_uri', spotifyCapsuleRedirectUri)
      authorizeUrl.searchParams.set('scope', spotifyCapsuleScopes.join(' '))
      authorizeUrl.searchParams.set('code_challenge_method', 'S256')
      authorizeUrl.searchParams.set('code_challenge', challenge)
      authorizeUrl.searchParams.set('state', state)
      authorizeUrl.searchParams.set('show_dialog', 'true')

      window.location.assign(authorizeUrl.toString())
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel iniciar conexao com Spotify.'))
    }
  }

  const disconnectSpotifyCapsule = async () => {
    if (!currentUser?.id) {
      return
    }

    if (!isSupabaseConfigured) {
      writeSpotifyTokenCache(currentUser.id, null)
      setSpotifyCapsuleConnection(null)
      setSpotifyCapsuleMine(null)
      setSpotifyCapsuleLeaderboard((current) => current.filter((entry) => entry.userId !== currentUser.id))
      setStatusMessage('Conta Spotify desconectada.')
      return
    }

    setDisconnectingSpotifyCapsule(true)
    try {
      await deleteSpotifyConnection({ userId: currentUser.id })
      writeSpotifyTokenCache(currentUser.id, null)
      setSpotifyCapsuleConnection(null)
      setSpotifyCapsuleMine(null)
      setSpotifyCapsuleLeaderboard((current) => current.filter((entry) => entry.userId !== currentUser.id))
      setStatusMessage('Conta Spotify desconectada.')
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel desconectar Spotify agora.'))
    } finally {
      setDisconnectingSpotifyCapsule(false)
    }
  }

  const handleSyncSpotifyCapsule = async () => {
    if (!currentUser?.id) {
      setErrorMessage('Entre na sua conta para sincronizar Spotify.')
      return
    }

    await syncSpotifyCapsule(currentUser.id, { period: spotifyCapsulePeriod })
  }

  const toggleCommunityJoin = async (communityId, options = {}) => {
    if (!currentUser?.id || !communityId) {
      setErrorMessage('Entre na sua conta para participar de comunidades.')
      return
    }

    const targetCommunity = communities.find((community) => community.id === communityId)
    const joinedBefore = Boolean(targetCommunity?.joined)
    const isOwner = targetCommunity?.creatorId === currentUser.id

    if (joinedBefore && isOwner) {
      setErrorMessage('Voce e criador desta comunidade. Para sair, transfira a criacao para outro perfil.')
      return
    }

    if (joinedBefore && options.confirmLeave && typeof window !== 'undefined') {
      const confirmed = window.confirm('Deseja realmente sair desta comunidade?')
      if (!confirmed) {
        return
      }
    }

    if (!isSupabaseConfigured) {
      setCommunities((current) =>
        current.map((community) =>
          community.id === communityId
            ? {
                ...community,
                joined: !community.joined,
                members: Math.max(0, Number(community.members || 0) + (community.joined ? -1 : 1)),
              }
            : community,
        ),
      )
      if (joinedBefore) {
        setStatusMessage('Voce saiu da comunidade.')
      } else {
        setStatusMessage('Agora voce participa da comunidade.')
      }
      return
    }

    try {
      const result = await toggleCommunityMembership({
        communityId,
        userId: currentUser.id,
      })

      setCommunities((current) =>
        current.map((community) =>
          community.id === communityId
            ? {
                ...community,
                joined: result.joined,
                members: result.members,
              }
            : community,
        ),
      )

      if (joinedBefore && result.joined) {
        setErrorMessage('Nao foi possivel sair desta comunidade agora.')
        return
      }

      if (result.joined) {
        setStatusMessage('Agora voce participa da comunidade.')
      } else {
        setStatusMessage('Voce saiu da comunidade.')
      }
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel atualizar sua comunidade agora.'))
    }
  }

  const togglePlaylistSave = async (playlistId) => {
    if (!currentUser?.id || !playlistId) {
      setErrorMessage('Entre na sua conta para salvar playlists.')
      return
    }

    if (!isSupabaseConfigured) {
      setPlaylists((current) =>
        current.map((playlist) =>
          playlist.id === playlistId
            ? {
                ...playlist,
                saved: !playlist.saved,
                saves: Math.max(0, Number(playlist.saves || 0) + (playlist.saved ? -1 : 1)),
              }
            : playlist,
        ),
      )
      return
    }

    try {
      const result = await toggleSaveSpotifyPlaylist({
        playlistId,
        userId: currentUser.id,
      })

      setPlaylists((current) =>
        current.map((playlist) =>
          playlist.id === playlistId
            ? {
                ...playlist,
                saved: result.saved,
                saves: result.saves,
              }
            : playlist,
        ),
      )
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel salvar essa playlist agora.'))
    }
  }

  const submitCommunity = async (event) => {
    event.preventDefault()

    if (!currentUser?.id) {
      setErrorMessage('Entre na sua conta para criar comunidades.')
      return
    }

    const name = communityDraft.name.trim()
    const description = communityDraft.description.trim()
    const themeColor = communityDraft.themeColor.trim() || '#3b82f6'

    if (name.length < 3) {
      setErrorMessage('Nome da comunidade precisa ter ao menos 3 caracteres.')
      return
    }

    setCreatingCommunity(true)
    setErrorMessage('')

    try {
      if (!isSupabaseConfigured) {
        const newCommunity = {
          id: `local-community-${Date.now()}`,
          name,
          description,
          members: 1,
          creatorId: currentUser.id,
          creatorName: currentUser.name,
          creatorHandle: normalizeHandle(currentUser.handle),
          themeColor,
          joined: true,
        }
        setCommunities((current) => [newCommunity, ...current])
      } else {
        const created = await createCommunity({
          userId: currentUser.id,
          name,
          description,
          themeColor,
        })
        setCommunities((current) => [created, ...current.filter((community) => community.id !== created.id)])
      }

      setCommunityDraft({
        name: '',
        description: '',
        themeColor: '#3b82f6',
      })
      setStatusMessage('Comunidade criada com sucesso.')
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel criar comunidade.'))
    } finally {
      setCreatingCommunity(false)
    }
  }

  const publishCommunityPost = (event) => {
    event.preventDefault()

    if (!currentUser?.id || !selectedCommunity?.id) {
      setErrorMessage('Selecione uma comunidade e faca login para publicar.')
      return
    }

    const title = communityPostDraft.title.trim()
    const text = communityPostDraft.text.trim()
    const spotifyUrl = communityPostDraft.spotifyUrl.trim()
    const mediaUrl = communityPostDraft.mediaUrl.trim()
    const albumName = communityPostDraft.albumName.trim()
    const rating = Math.max(1, Math.min(5, Number(communityPostDraft.rating || 4)))

    if (!title && !text && !spotifyUrl && !mediaUrl) {
      setErrorMessage('Preencha titulo, texto ou link para publicar no feed da comunidade.')
      return
    }

    const nextPost = {
      id: `community-post-${selectedCommunity.id}-${Date.now()}`,
      type: communityPostDraft.type || 'music',
      title,
      text,
      spotifyUrl,
      mediaUrl,
      albumName,
      rating: communityPostDraft.type === 'rating' ? rating : 0,
      author: {
        id: currentUser.id,
        name: currentUser.name,
        handle: normalizeHandle(currentUser.handle),
      },
      createdAt: new Date().toISOString(),
      likes: 0,
      shares: 0,
      saves: 0,
      liked: false,
      saved: false,
      comments: [],
    }

    setCommunityFeedById((current) => ({
      ...current,
      [selectedCommunity.id]: [nextPost, ...(current[selectedCommunity.id] || [])],
    }))

    setCommunityPostDraft({
      type: 'music',
      title: '',
      text: '',
      spotifyUrl: '',
      mediaUrl: '',
      albumName: '',
      rating: 4,
    })
    setStatusMessage('Post publicado no feed da comunidade.')
  }

  const toggleCommunityFeedLike = (postId) => {
    if (!selectedCommunity?.id) {
      return
    }

    setCommunityFeedById((current) => {
      const currentPosts = current[selectedCommunity.id] || []
      const nextPosts = currentPosts.map((post) => {
        if (post.id !== postId) {
          return post
        }

        return {
          ...post,
          liked: !post.liked,
          likes: Math.max(0, Number(post.likes || 0) + (post.liked ? -1 : 1)),
        }
      })

      return {
        ...current,
        [selectedCommunity.id]: nextPosts,
      }
    })
  }

  const toggleCommunityFeedSave = (postId) => {
    if (!selectedCommunity?.id) {
      return
    }

    setCommunityFeedById((current) => {
      const currentPosts = current[selectedCommunity.id] || []
      const nextPosts = currentPosts.map((post) => {
        if (post.id !== postId) {
          return post
        }

        return {
          ...post,
          saved: !post.saved,
          saves: Math.max(0, Number(post.saves || 0) + (post.saved ? -1 : 1)),
        }
      })

      return {
        ...current,
        [selectedCommunity.id]: nextPosts,
      }
    })
  }

  const shareCommunityFeedPost = (postId) => {
    if (!selectedCommunity?.id) {
      return
    }

    setCommunityFeedById((current) => {
      const currentPosts = current[selectedCommunity.id] || []
      const nextPosts = currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              shares: Number(post.shares || 0) + 1,
            }
          : post,
      )

      return {
        ...current,
        [selectedCommunity.id]: nextPosts,
      }
    })
    setStatusMessage('Post compartilhado.')
  }

  const sendCommunityFeedComment = (postId) => {
    if (!currentUser?.id || !selectedCommunity?.id) {
      return
    }

    const draftKey = `${selectedCommunity.id}:${postId}`
    const text = String(communityCommentDrafts[draftKey] || '').trim()
    if (!text) {
      return
    }

    const nextComment = {
      id: `community-comment-${postId}-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      author: {
        id: currentUser.id,
        name: currentUser.name,
        handle: normalizeHandle(currentUser.handle),
      },
    }

    setCommunityFeedById((current) => {
      const currentPosts = current[selectedCommunity.id] || []
      const nextPosts = currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: [...(post.comments || []), nextComment],
            }
          : post,
      )

      return {
        ...current,
        [selectedCommunity.id]: nextPosts,
      }
    })

    setCommunityCommentDrafts((current) => ({ ...current, [draftKey]: '' }))
  }

  const publishCommunityTopic = (event) => {
    event.preventDefault()
    if (!currentUser?.id || !selectedCommunity?.id) {
      return
    }

    const title = communityTopicDraft.title.trim()
    const body = communityTopicDraft.body.trim()
    if (!title || !body) {
      setErrorMessage('Informe titulo e descricao para criar um topico.')
      return
    }

    const nextTopic = {
      id: `community-topic-${selectedCommunity.id}-${Date.now()}`,
      title,
      body,
      pinned: false,
      createdAt: new Date().toISOString(),
      author: {
        id: currentUser.id,
        name: currentUser.name,
        handle: normalizeHandle(currentUser.handle),
      },
      replies: [],
      bestReplyId: '',
    }

    setCommunityTopicsById((current) => ({
      ...current,
      [selectedCommunity.id]: [nextTopic, ...(current[selectedCommunity.id] || [])],
    }))
    setCommunityTopicDraft({ title: '', body: '' })
    setStatusMessage('Topico criado na comunidade.')
  }

  const replyCommunityTopic = (topicId) => {
    if (!currentUser?.id || !selectedCommunity?.id) {
      return
    }

    const draftKey = `${selectedCommunity.id}:${topicId}`
    const text = String(communityReplyDrafts[draftKey] || '').trim()
    if (!text) {
      return
    }

    const nextReply = {
      id: `topic-reply-${topicId}-${Date.now()}`,
      text,
      votes: 0,
      isBest: false,
      author: { id: currentUser.id, name: currentUser.name, handle: normalizeHandle(currentUser.handle) },
      createdAt: new Date().toISOString(),
    }

    setCommunityTopicsById((current) => {
      const currentTopics = current[selectedCommunity.id] || []
      const nextTopics = currentTopics.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              replies: [...(topic.replies || []), nextReply],
            }
          : topic,
      )

      return {
        ...current,
        [selectedCommunity.id]: nextTopics,
      }
    })

    setCommunityReplyDrafts((current) => ({ ...current, [draftKey]: '' }))
  }

  const voteCommunityReply = (topicId, replyId, delta) => {
    if (!selectedCommunity?.id) {
      return
    }

    setCommunityTopicsById((current) => {
      const currentTopics = current[selectedCommunity.id] || []
      const nextTopics = currentTopics.map((topic) => {
        if (topic.id !== topicId) {
          return topic
        }

        return {
          ...topic,
          replies: (topic.replies || []).map((reply) =>
            reply.id === replyId
              ? {
                  ...reply,
                  votes: Number(reply.votes || 0) + delta,
                }
              : reply,
          ),
        }
      })

      return {
        ...current,
        [selectedCommunity.id]: nextTopics,
      }
    })
  }

  const togglePinnedTopic = (topicId) => {
    if (!selectedCommunity?.id || selectedCommunity?.creatorId !== currentUser?.id) {
      return
    }

    setCommunityTopicsById((current) => {
      const currentTopics = current[selectedCommunity.id] || []
      const nextTopics = currentTopics.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              pinned: !topic.pinned,
            }
          : topic,
      )

      return {
        ...current,
        [selectedCommunity.id]: nextTopics,
      }
    })
  }

  const markTopicBestReply = (topicId, replyId) => {
    if (!selectedCommunity?.id) {
      return
    }

    setCommunityTopicsById((current) => {
      const currentTopics = current[selectedCommunity.id] || []
      const nextTopics = currentTopics.map((topic) => {
        if (topic.id !== topicId || topic.author?.id !== currentUser?.id) {
          return topic
        }

        return {
          ...topic,
          bestReplyId: topic.bestReplyId === replyId ? '' : replyId,
          replies: (topic.replies || []).map((reply) => ({
            ...reply,
            isBest: topic.bestReplyId === replyId ? false : reply.id === replyId,
          })),
        }
      })

      return {
        ...current,
        [selectedCommunity.id]: nextTopics,
      }
    })
  }

  const publishCommunityCollab = (event) => {
    event.preventDefault()
    if (!selectedCommunity?.id || !currentUser?.id) {
      return
    }

    const title = communityCollabDraft.title.trim()
    const roleNeeded = communityCollabDraft.roleNeeded.trim()
    const details = communityCollabDraft.details.trim()
    if (!title || !roleNeeded || !details) {
      setErrorMessage('Preencha titulo, papel e detalhes para publicar colaboracao.')
      return
    }

    const nextRequest = {
      id: `community-collab-${selectedCommunity.id}-${Date.now()}`,
      title,
      roleNeeded,
      details,
      createdAt: new Date().toISOString(),
      status: 'open',
      applicants: 0,
      author: { id: currentUser.id, name: currentUser.name, handle: normalizeHandle(currentUser.handle) },
    }

    setCommunityCollabsById((current) => ({
      ...current,
      [selectedCommunity.id]: [nextRequest, ...(current[selectedCommunity.id] || [])],
    }))
    setCommunityCollabDraft({ title: '', roleNeeded: '', details: '' })
  }

  const applyCommunityCollab = (request) => {
    if (!selectedCommunity?.id || !currentUser?.id) {
      return
    }

    setCommunityCollabsById((current) => {
      const list = current[selectedCommunity.id] || []
      const nextList = list.map((item) =>
        item.id === request.id
          ? {
              ...item,
              applicants: Number(item.applicants || 0) + 1,
            }
          : item,
      )

      return {
        ...current,
        [selectedCommunity.id]: nextList,
      }
    })

    if (request.author?.id && request.author.id !== currentUser.id) {
      void openOrCreateDirectWithUser({
        id: request.author.id,
        name: request.author.name,
        handle: request.author.handle,
        avatarUrl: null,
      })
    }
  }

  const publishCommunityChallenge = (event) => {
    event.preventDefault()
    if (!selectedCommunity?.id || !currentUser?.id) {
      return
    }

    const title = communityChallengeDraft.title.trim()
    const kind = communityChallengeDraft.kind.trim()
    const details = communityChallengeDraft.details.trim()
    const deadline = communityChallengeDraft.deadline

    if (!title || !kind || !details) {
      setErrorMessage('Preencha titulo, tipo e detalhes para criar desafio.')
      return
    }

    const nextChallenge = {
      id: `community-challenge-${selectedCommunity.id}-${Date.now()}`,
      title,
      kind,
      details,
      deadline: deadline ? new Date(deadline).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      participants: [],
      createdAt: new Date().toISOString(),
      author: { id: currentUser.id, name: currentUser.name, handle: normalizeHandle(currentUser.handle) },
    }

    setCommunityChallengesById((current) => ({
      ...current,
      [selectedCommunity.id]: [nextChallenge, ...(current[selectedCommunity.id] || [])],
    }))
    setCommunityChallengeDraft({ title: '', kind: 'cover', details: '', deadline: '' })
  }

  const joinCommunityChallenge = (challengeId) => {
    if (!selectedCommunity?.id || !currentUser?.id) {
      return
    }

    setCommunityChallengesById((current) => {
      const list = current[selectedCommunity.id] || []
      const nextList = list.map((challenge) => {
        if (challenge.id !== challengeId) {
          return challenge
        }

        const alreadyJoined = (challenge.participants || []).some((participant) => participant.userId === currentUser.id)
        if (alreadyJoined) {
          return challenge
        }

        const score = 55 + Math.floor(Math.random() * 46)
        return {
          ...challenge,
          participants: [...(challenge.participants || []), { userId: currentUser.id, name: currentUser.name, score }],
        }
      })

      return {
        ...current,
        [selectedCommunity.id]: nextList,
      }
    })
  }

  const submitPlaylist = async (event) => {
    event.preventDefault()

    if (!currentUser?.id) {
      setErrorMessage('Entre na sua conta para cadastrar playlists.')
      return
    }

    const spotify = parseSpotifyUrl(playlistDraft.spotifyUrl)
    if (!spotify || spotify.type !== 'playlist') {
      setErrorMessage('Use um link valido de playlist do Spotify.')
      return
    }

    const title = playlistDraft.title.trim() || 'Playlist personalizada'
    const description = playlistDraft.description.trim()

    setCreatingPlaylist(true)
    setErrorMessage('')

    try {
      if (!isSupabaseConfigured) {
        const newPlaylist = {
          id: `local-playlist-${Date.now()}`,
          title,
          description,
          spotifyUrl: spotify.url,
          spotifyType: 'playlist',
          creatorId: currentUser.id,
          creatorName: currentUser.name,
          creatorHandle: normalizeHandle(currentUser.handle),
          saves: 1,
          saved: true,
          sampleTrack: null,
        }
        setPlaylists((current) => [newPlaylist, ...current])
      } else {
        const created = await createSpotifyPlaylist({
          userId: currentUser.id,
          title,
          description,
          spotifyUrl: spotify.url,
        })
        setPlaylists((current) => [created, ...current.filter((playlist) => playlist.id !== created.id)])
      }

      setPlaylistDraft({
        title: '',
        description: '',
        spotifyUrl: '',
      })
      setStatusMessage('Playlist adicionada e salva no seu perfil.')
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel criar playlist.'))
    } finally {
      setCreatingPlaylist(false)
    }
  }

  const toggleEventSave = (eventId) => {
    setSavedEvents((current) => ({ ...current, [eventId]: !current[eventId] }))
  }

  const goToComposer = () => {
    activateNav('Feed')
    setShowComposer(true)
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const focusCommentInput = (postId) => {
    const input = commentInputRefs.current[postId]
    if (!input) {
      return
    }

    input.focus()
    input.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const applyTrendingTrack = (track) => {
    setComposer((current) => ({
      ...current,
      track: track.title,
      artist: track.artist,
    }))
    setShowComposer(true)
    setStatusMessage(`Faixa pronta no composer: ${track.title} - ${track.artist}`)
    setErrorMessage('')
  }

  const applyPlaylistInComposer = (playlist) => {
    if (!playlist?.spotifyUrl) {
      return
    }

    activateNav('Feed')
    setShowComposer(true)
    setComposer((current) => ({
      ...current,
      spotifyUrl: playlist.spotifyUrl,
    }))
    setStatusMessage(`Playlist pronta no composer: ${playlist.title}.`)
    setErrorMessage('')
  }

  const toggleVisualPlayer = (postId) => {
    setPlayingPostId((current) => (current === postId ? '' : postId))
  }

  const handleInteractiveMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    event.currentTarget.style.setProperty('--mx', `${x}px`)
    event.currentTarget.style.setProperty('--my', `${y}px`)
  }

  const clearInteractiveMove = (event) => {
    event.currentTarget.style.removeProperty('--mx')
    event.currentTarget.style.removeProperty('--my')
  }

  const likeButtonClassName = (post) => {
    let className = 'react-btn'

    if (post.liked) {
      className += ' active'
    }

    if (likeBurstId === post.id) {
      className += ' burst'
    }

    return className
  }

  const isDirectFullscreen = activeNav === 'Direct' && !publicProfile
  const rootClassName = [
    'scene-root',
    `theme-${themeMode}`,
    isDirectFullscreen ? 'is-direct-fullscreen' : '',
    isMobileViewport && isDirectFullscreen ? 'is-mobile-direct' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (isSupabaseConfigured && loadingAuth) {
    return (
      <div className={rootClassName}>
        <AmbientBackdrop />
        <div className="auth-shell">
          <div className="auth-card">
            <p className="hero-tag">Conectando backend</p>
            <h1>Carregando sessao...</h1>
          </div>
        </div>
      </div>
    )
  }

  if (isSupabaseConfigured && !session) {
    return (
      <div className={rootClassName}>
        <AmbientBackdrop />
        <div className="auth-shell">
          <div className="auth-card auth-card-split">
            <section className="auth-side">
              <p className="auth-side-eyebrow">BEM VINDO</p>
              <h2>{authMode === 'signin' ? 'Novo Login' : 'Ja tem conta?'}</h2>
              <p>
                {authMode === 'signin'
                  ? 'Crie sua conta para publicar faixas, playlists e conversar no direct.'
                  : 'Entre com seu email e senha para voltar para seu feed.'}
              </p>
              <button
                type="button"
                className="secondary-btn auth-side-cta"
                onClick={() => setAuthMode((current) => (current === 'signin' ? 'signup' : 'signin'))}
              >
                {authMode === 'signin' ? 'Criar conta' : 'Fazer login'}
              </button>
              <div className="auth-side-social" aria-hidden="true">
                <span>G</span>
                <span>T</span>
                <span>W</span>
              </div>
            </section>

            <button
              type="button"
              className="auth-swap"
              aria-label="Alternar entre login e cadastro"
              onClick={() => setAuthMode((current) => (current === 'signin' ? 'signup' : 'signin'))}
            >
              ⇄
            </button>

            <section className="auth-pane">
              <div className="auth-mode-switch">
                <button
                  type="button"
                  className={authMode === 'signin' ? 'auth-mode-btn is-active' : 'auth-mode-btn'}
                  onClick={() => setAuthMode('signin')}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={authMode === 'signup' ? 'auth-mode-btn is-active' : 'auth-mode-btn'}
                  onClick={() => setAuthMode('signup')}
                >
                  Criar conta
                </button>
              </div>

              <h1>{authMode === 'signin' ? 'FAÇA LOGIN' : 'CRIE SUA CONTA'}</h1>
              <p className="auth-pane-copy">Use email e senha para acessar sua conta.</p>

              <form className="auth-form" onSubmit={submitAuth}>
                {authMode === 'signup' && (
                  <input
                    type="text"
                    placeholder="Seu nome"
                    value={authForm.name}
                    onChange={(event) => handleAuthChange('name', event.target.value)}
                  />
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={authForm.email}
                  onChange={(event) => handleAuthChange('email', event.target.value)}
                />
                <input
                  type="password"
                  placeholder="Senha"
                  value={authForm.password}
                  onChange={(event) => handleAuthChange('password', event.target.value)}
                />
                <button type="submit" className="primary-btn auth-submit-btn" disabled={authBusy}>
                  {authBusy ? 'Enviando...' : authMode === 'signin' ? 'Entrar' : 'Criar conta'}
                </button>
              </form>

              <button
                type="button"
                className="secondary-btn auth-google-btn"
                onClick={submitGoogleAuth}
                disabled={authBusy || authGoogleBusy}
              >
                {authGoogleBusy ? 'Abrindo Google...' : 'Continuar com Google'}
              </button>

              {statusMessage && <div className="notice success">{statusMessage}</div>}
              {errorMessage && <div className="notice error">{errorMessage}</div>}
            </section>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={rootClassName}>
      <AmbientBackdrop />

      <div className="app-shell">
        <aside className="panel left-panel appear-up">
          <div className="brand">WaveLoop</div>
          

          {!isSupabaseConfigured && <div className="notice warn">Modo demo sem backend ativo.</div>}

          <nav className="side-nav" aria-label="Navegacao principal">
            {navItems.map((item) => {
              const meta = navPresentation[item] || {
                label: item,
                mobile: item,
                icon: 'home',
              }
              const isActive = activeNav === item

              return (
                <button
                  type="button"
                  key={item}
                  className={isActive ? 'nav-item active' : 'nav-item'}
                  onClick={() => activateNav(item)}
                >
                  <span className="nav-main">
                    <span className="nav-icon">
                      <NavIcon name={meta.icon} active={isActive} />
                    </span>
                    <span className="nav-text">{meta.label}</span>
                  </span>
                  {item === 'Direct' && totalDirectUnread > 0 && <span className="nav-badge">{compact(totalDirectUnread)}</span>}
                </button>
              )
            })}
          </nav>

          <section className="profile-card sidebar-profile-card">
            <div className="avatar avatar-large">
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt={currentUser.name || 'Usuario'} />
              ) : (
                initials(currentUser?.name || 'Usuario')
              )}
            </div>
            <h2>{currentUser?.name || 'Usuario'}</h2>
            <p>@{normalizeHandle(currentUser?.handle || 'usuario')}</p>
            <button type="button" className="secondary-btn profile-edit-trigger" onClick={openProfileEditor}>
              Editar perfil
            </button>
            <div className="profile-stats">
              <div>
                <strong>{compact(profileStats.followers)}</strong>
                <span>seguidores</span>
              </div>
              <div>
                <strong>{compact(profileStats.following)}</strong>
                <span>seguindo</span>
              </div>
              <div>
                <strong>{profileStats.mixes}</strong>
                <span>mixes</span>
              </div>
            </div>
          </section>

          <section className="cta-card">
            <h3>Criar comunidade</h3>
            <p>Monte um grupo para trocar demos, playlists e eventos da sua cidade.</p>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                activateNav('Comunidades')
                setStatusMessage('Explore as comunidades e entre nos grupos que combinar com seu som.')
              }}
            >
              Novo grupo
            </button>
          </section>

          {isSupabaseConfigured && (
            <button type="button" className="secondary-btn logout-btn" onClick={handleLogout}>
              Sair da conta
            </button>
          )}
        </aside>

        <main className="main-column">
          {activeNav !== 'Direct' && activeNav !== 'Feed' && !publicProfile && (
          <section className="top-strip appear-up" onMouseMove={handleInteractiveMove} onMouseLeave={clearInteractiveMove}>
            <div className="search-shell">
              <label htmlFor="global-search">Buscar posts e usuarios</label>
              <input
                id="global-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Nome, @handle, faixa, mood..."
              />
              {searchQuery.trim().length >= 2 && (
                <div className="search-user-results">
                  {loadingUserSearch && <p>Buscando usuarios...</p>}
                  {!loadingUserSearch && userSearchResults.length === 0 && <p>Nenhum usuario encontrado.</p>}
                  {!loadingUserSearch &&
                    userSearchResults.length > 0 &&
                    userSearchResults.map((user) => (
                      <button
                        type="button"
                        key={`search-user-${user.id}`}
                        onClick={() => {
                          setSearchQuery('')
                          void openPublicProfile(user.handle)
                        }}
                      >
                        <div className="avatar">
                          {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} /> : initials(user.name)}
                        </div>
                        <div>
                          <strong>{user.name}</strong>
                          <span>@{normalizeHandle(user.handle)}</span>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="quick-actions" aria-label="Atalhos rapidos">
              <button type="button" onClick={() => activateNav('Feed')}>
                Feed
              </button>
              <button type="button" onClick={() => activateNav('Descobrir')}>
                Descobrir
              </button>
              <button type="button" onClick={() => activateNav('Direct')}>
                Direct
              </button>
              <button type="button" onClick={goToComposer}>
                Publicar
              </button>
            </div>
          </section>
          )}

          {activeNav === 'Descobrir' && !publicProfile && (
            <>
              <section className="hero appear-up delay-1">
                <span className="hero-tag">Rede social para musica independente</span>
                <h1>Mostre o que voce escuta e descubra artistas todos os dias.</h1>
                <p>
                  Publique faixas, comente em tempo real e acompanhe movimentos musicais da comunidade.
                </p>
                <div className="hero-stats">
                  <article>
                    <strong>{compact(postsForView.length)}</strong>
                    <span>{searchQuery ? 'resultados' : heroCountLabels[activeNav] || 'posts no feed'}</span>
                  </article>
                  <article>
                    <strong>{compact(engagement.likes)}</strong>
                    <span>curtidas totais</span>
                  </article>
                  <article>
                    <strong>{compact(engagement.comments)}</strong>
                    <span>comentarios</span>
                  </article>
                  <article>
                    <strong>{compact(engagement.reposts)}</strong>
                    <span>reposts</span>
                  </article>
                </div>
              </section>

              <section className="trend-strip appear-up delay-1" aria-label="Trending now">
                <header className="trend-head">
                  <h2>Trending now</h2>
                  <p>Clique para preencher a faixa no composer.</p>
                </header>
                <div className="trend-grid">
                  {trendingTracks.map((track, index) => (
                    <button
                      type="button"
                      key={track.id}
                      className="trend-card"
                      onClick={() => applyTrendingTrack(track)}
                      style={{ animationDelay: `${130 + index * 90}ms` }}
                    >
                      <span className="trend-rank">#{index + 1}</span>
                      <strong>{track.title}</strong>
                      <p>{track.artist}</p>
                      <span className="trend-plays">{compact(track.plays)} plays</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeNav === 'Feed' && !publicProfile && (
            <>
            <section className="feed-inline-header appear-up">
              <h2>Feed</h2>
              <div className="feed-inline-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setShowComposer((current) => !current)}
                >
                  {showComposer ? 'Fechar post' : 'Criar post'}
                </button>
                <button type="button" className="secondary-btn" onClick={() => activateNav('Direct')}>
                  Mensagens
                </button>
                <button
                  type="button"
                  className="theme-icon-toggle compact"
                  onClick={() => setThemeMode((current) => (current === 'dark' ? 'clean' : 'dark'))}
                  aria-label={themeMode === 'dark' ? 'Ativar modo clean' : 'Ativar modo dark'}
                  title={themeMode === 'dark' ? 'Ativar modo clean' : 'Ativar modo dark'}
                >
                  <ThemeModeIcon mode={themeMode} />
                </button>
              </div>
            </section>

            <section className="stories-strip appear-up delay-1" aria-label="Stories">
              <header className="stories-head">
                <h3>Stories</h3>
                <button type="button" className="secondary-btn stories-create-btn" onClick={openStoryComposer}>
                  Novo story
                </button>
              </header>

              {loadingStories && <div className="notice">Carregando stories...</div>}

              {!loadingStories && stories.length === 0 && (
                <div className="notice">Ainda nao existem stories ativos. Publique o primeiro agora.</div>
              )}

              {!loadingStories && stories.length > 0 && (
                <ul>
                  {stories.map((group) => {
                    const isOwnEmpty = group.own && group.items.length === 0
                    const isActive = storyViewer.open && storyViewer.userId === group.userId
                    const displayName = group.own ? 'Seu story' : group.user.name.split(' ')[0]
                    const ringClassName = group.own
                      ? group.hasUnviewed
                        ? 'story-ring own'
                        : 'story-ring own viewed'
                      : group.hasUnviewed
                        ? 'story-ring'
                        : 'story-ring viewed'

                    return (
                      <li key={`story-${group.userId}`}>
                        <button
                          type="button"
                          className={isActive ? 'story-item active' : 'story-item'}
                          onClick={() => {
                            if (group.items.length > 0) {
                              openStoryGroup(group.userId)
                              return
                            }

                            if (group.own) {
                              openStoryComposer()
                              return
                            }

                            void openPublicProfile(group.user.handle)
                          }}
                        >
                          <div className={ringClassName}>
                            <div className="avatar">
                              {group.user.avatarUrl ? (
                                <img src={group.user.avatarUrl} alt={group.user.name} />
                              ) : (
                                initials(group.user.name)
                              )}
                            </div>
                            {isOwnEmpty && <span className="story-plus">+</span>}
                          </div>
                          <span>{displayName}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
            </>
          )}

          {activeNav === 'Comunidades' && !publicProfile && (
            <section className="mode-board appear-up">
              <header className="mode-board-head">
                <div>
                  <h2>Comunidades</h2>
                  <p>Descubra grupos, participe de discussões e acompanhe rankings internos.</p>
                </div>
                <div className="community-stats-row">
                  <span className="community-stat-pill">Total {compact(communityStats.total)}</span>
                  <span className="community-stat-pill">Participando {compact(communityStats.joined)}</span>
                  <span className="community-stat-pill">Minhas {compact(communityStats.mine)}</span>
                </div>
              </header>

              <div className="community-controls">
                <input
                  type="search"
                  value={communityQuery}
                  onChange={(event) => setCommunityQuery(event.target.value)}
                  placeholder="Buscar comunidade por nome, descricao ou criador..."
                />
                <div className="community-filter-row">
                  <button
                    type="button"
                    className={communityGenreFilter === 'all' ? 'secondary-btn followed' : 'secondary-btn'}
                    onClick={() => setCommunityGenreFilter('all')}
                  >
                    Todos os generos
                  </button>
                  {communityGenreOptions.map((genre) => (
                    <button
                      type="button"
                      key={`community-genre-${genre}`}
                      className={communityGenreFilter === genre ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => setCommunityGenreFilter(genre)}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
                <div className="community-filter-row">
                  <button
                    type="button"
                    className={communityFilter === 'all' ? 'secondary-btn followed' : 'secondary-btn'}
                    onClick={() => setCommunityFilter('all')}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className={communityFilter === 'joined' ? 'secondary-btn followed' : 'secondary-btn'}
                    onClick={() => setCommunityFilter('joined')}
                  >
                    Participando
                  </button>
                  <button
                    type="button"
                    className={communityFilter === 'mine' ? 'secondary-btn followed' : 'secondary-btn'}
                    onClick={() => setCommunityFilter('mine')}
                    disabled={!currentUser}
                  >
                    Criadas por mim
                  </button>
                </div>
              </div>

              <div className="community-ranking-periods">
                {spotifyCapsulePeriods.map((periodOption) => (
                  <button
                    type="button"
                    key={`community-rank-period-${periodOption.id}`}
                    className={communityRankPeriod === periodOption.id ? 'secondary-btn followed' : 'secondary-btn'}
                    onClick={() => setCommunityRankPeriod(periodOption.id)}
                  >
                    Top {periodOption.label}
                  </button>
                ))}
              </div>
              <form className="mode-create-form" onSubmit={submitCommunity}>
                <div className="mode-create-grid">
                  <input
                    type="text"
                    value={communityDraft.name}
                    onChange={(event) => setCommunityDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Nome da comunidade"
                  />
                  <input
                    type="text"
                    value={communityDraft.description}
                    onChange={(event) => setCommunityDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Descricao curta"
                  />
                  <label className="mode-create-color">
                    Cor
                    <input
                      type="color"
                      value={communityDraft.themeColor}
                      onChange={(event) => setCommunityDraft((current) => ({ ...current, themeColor: event.target.value }))}
                    />
                  </label>
                </div>
                <button type="submit" className="primary-btn" disabled={creatingCommunity}>
                  {creatingCommunity ? 'Criando...' : 'Criar comunidade'}
                </button>
              </form>

              {selectedCommunity && (
                <article className="community-focus-card">
                  <header className="community-focus-head">
                    <div>
                      <h3>{selectedCommunity.name}</h3>
                      <p>{selectedCommunity.description || 'Comunidade sem descricao por enquanto.'}</p>
                    </div>
                    <span className="community-focus-meta">
                      {compact(selectedCommunity.members || 0)} membros • {selectedCommunityGenre} • @{normalizeHandle(selectedCommunity.creatorHandle || 'comunidade')}
                    </span>
                  </header>

                  <div className="community-focus-actions">
                    <button
                      type="button"
                      className={selectedCommunity.joined ? 'secondary-btn community-leave-btn' : 'secondary-btn followed'}
                      onClick={() => toggleCommunityJoin(selectedCommunity.id, { confirmLeave: selectedCommunity.joined })}
                    >
                      {selectedCommunity.joined ? 'Sair da comunidade' : 'Participar da comunidade'}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => void openPublicProfile(selectedCommunity.creatorHandle || '')}
                    >
                      Ver criador
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={!selectedCommunity.creatorId || selectedCommunity.creatorId === currentUser?.id}
                      onClick={() =>
                        void openOrCreateDirectWithUser({
                          id: selectedCommunity.creatorId,
                          name: selectedCommunity.creatorName,
                          handle: normalizeHandle(selectedCommunity.creatorHandle || ''),
                          avatarUrl: null,
                        })
                      }
                    >
                      Falar no direct
                    </button>
                  </div>

                  <div className="community-leaderboard">
                    <strong className="community-leaderboard-title">
                      Top ouvintes ({capsulePeriodLabel(communityRankPeriod)})
                    </strong>
                    {loadingCommunityRankings ? (
                      <p className="community-leaderboard-empty">Carregando ranking...</p>
                    ) : (communityRankingsById[selectedCommunity.id] || []).length > 0 ? (
                      <ul className="community-leaderboard-list">
                        {(communityRankingsById[selectedCommunity.id] || []).map((entry, index) => (
                          <li key={`${selectedCommunity.id}-focus-rank-${entry.userId || entry.id || index}`}>
                            <span className="community-rank-pos">#{entry.rank || index + 1}</span>
                            <div className="community-rank-user">
                              <strong>{entry.user?.name || 'Usuario'}</strong>
                              <p>@{normalizeHandle(entry.user?.handle || 'usuario')}</p>
                            </div>
                            <div className="community-rank-score">
                              <strong>{compact(entry.score || 0)}</strong>
                              <span>pts</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="community-leaderboard-empty">Sem ranking nesta comunidade ainda.</p>
                    )}
                  </div>
                </article>
              )}

              {selectedCommunity && (
                <section className="community-workspace">
                  <header className="community-workspace-head">
                    <h3>Hub da comunidade</h3>
                    <p>
                      Genero: <strong>{selectedCommunityGenre}</strong>
                    </p>
                  </header>

                  <div className="community-workspace-tabs">
                    <button
                      type="button"
                      className={communityWorkspaceTab === 'feed' ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => setCommunityWorkspaceTab('feed')}
                    >
                      Feed
                    </button>
                    <button
                      type="button"
                      className={communityWorkspaceTab === 'forum' ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => setCommunityWorkspaceTab('forum')}
                    >
                      Forum
                    </button>
                    <button
                      type="button"
                      className={communityWorkspaceTab === 'collab' ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => setCommunityWorkspaceTab('collab')}
                    >
                      Colaboracao
                    </button>
                    <button
                      type="button"
                      className={communityWorkspaceTab === 'challenges' ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => setCommunityWorkspaceTab('challenges')}
                    >
                      Desafios
                    </button>
                    <button
                      type="button"
                      className={communityWorkspaceTab === 'playlists' ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => setCommunityWorkspaceTab('playlists')}
                    >
                      Playlists
                    </button>
                  </div>

                  {communityWorkspaceTab === 'feed' && (
                    <div className="community-workspace-pane">
                      <form className="community-inline-form" onSubmit={publishCommunityPost}>
                        <div className="community-inline-grid">
                          <select
                            value={communityPostDraft.type}
                            onChange={(event) =>
                              setCommunityPostDraft((current) => ({ ...current, type: event.target.value }))
                            }
                          >
                            {communityPostTypeOptions.map((option) => (
                              <option key={`community-post-type-${option.id}`} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={communityPostDraft.title}
                            onChange={(event) =>
                              setCommunityPostDraft((current) => ({ ...current, title: event.target.value }))
                            }
                            placeholder="Titulo do post"
                          />
                          <input
                            type="text"
                            value={communityPostDraft.spotifyUrl}
                            onChange={(event) =>
                              setCommunityPostDraft((current) => ({ ...current, spotifyUrl: event.target.value }))
                            }
                            placeholder="Link Spotify (opcional)"
                          />
                          <input
                            type="text"
                            value={communityPostDraft.mediaUrl}
                            onChange={(event) =>
                              setCommunityPostDraft((current) => ({ ...current, mediaUrl: event.target.value }))
                            }
                            placeholder="URL de imagem/video (opcional)"
                          />
                          <input
                            type="text"
                            value={communityPostDraft.albumName}
                            onChange={(event) =>
                              setCommunityPostDraft((current) => ({ ...current, albumName: event.target.value }))
                            }
                            placeholder="Album (opcional)"
                          />
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={communityPostDraft.rating}
                            onChange={(event) =>
                              setCommunityPostDraft((current) => ({
                                ...current,
                                rating: Math.max(1, Math.min(5, Number(event.target.value || 4))),
                              }))
                            }
                            placeholder="Nota 1-5"
                            disabled={communityPostDraft.type !== 'rating'}
                          />
                        </div>
                        <textarea
                          value={communityPostDraft.text}
                          onChange={(event) =>
                            setCommunityPostDraft((current) => ({ ...current, text: event.target.value }))
                          }
                          placeholder="Escreva opiniao, feedback ou contexto do post..."
                        />
                        <button type="submit" className="primary-btn">
                          Publicar no feed da comunidade
                        </button>
                      </form>

                      <div className="community-post-list">
                        {activeCommunityFeed.map((post) => {
                          const commentDraftKey = `${selectedCommunity.id}:${post.id}`
                          return (
                            <article key={post.id} className="community-post-card">
                              <header>
                                <strong>{post.title || 'Post da comunidade'}</strong>
                                <span>{post.type}</span>
                              </header>
                              {post.text && <p>{post.text}</p>}
                              {post.albumName && <p className="community-post-meta">Album: {post.albumName}</p>}
                              {post.spotifyUrl && (
                                <a href={post.spotifyUrl} target="_blank" rel="noreferrer" className="community-post-link">
                                  Ouvir no Spotify
                                </a>
                              )}
                              {post.mediaUrl && (
                                <a href={post.mediaUrl} target="_blank" rel="noreferrer" className="community-post-link">
                                  Abrir midia
                                </a>
                              )}
                              {post.type === 'rating' && post.rating > 0 && (
                                <p className="community-post-rating">{'★'.repeat(post.rating)}{'☆'.repeat(5 - post.rating)}</p>
                              )}
                              <div className="community-post-actions">
                                <button type="button" className={post.liked ? 'secondary-btn followed' : 'secondary-btn'} onClick={() => toggleCommunityFeedLike(post.id)}>
                                  Curtir {compact(post.likes || 0)}
                                </button>
                                <button type="button" className="secondary-btn" onClick={() => shareCommunityFeedPost(post.id)}>
                                  Compartilhar {compact(post.shares || 0)}
                                </button>
                                <button type="button" className={post.saved ? 'secondary-btn followed' : 'secondary-btn'} onClick={() => toggleCommunityFeedSave(post.id)}>
                                  Salvar {compact(post.saves || 0)}
                                </button>
                              </div>
                              <div className="community-comment-form">
                                <input
                                  type="text"
                                  value={communityCommentDrafts[commentDraftKey] || ''}
                                  onChange={(event) =>
                                    setCommunityCommentDrafts((current) => ({ ...current, [commentDraftKey]: event.target.value }))
                                  }
                                  placeholder="Comentar no post..."
                                />
                                <button type="button" className="secondary-btn" onClick={() => sendCommunityFeedComment(post.id)}>
                                  Comentar
                                </button>
                              </div>
                              {(post.comments || []).length > 0 && (
                                <ul className="community-comment-list">
                                  {(post.comments || []).slice(-3).map((comment) => (
                                    <li key={comment.id}>
                                      <strong>{comment.author?.name || 'Usuario'}</strong>
                                      <p>{comment.text}</p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </article>
                          )
                        })}
                        {activeCommunityFeed.length === 0 && (
                          <div className="notice">Sem posts ainda. Publique o primeiro conteudo da comunidade.</div>
                        )}
                      </div>
                    </div>
                  )}

                  {communityWorkspaceTab === 'forum' && (
                    <div className="community-workspace-pane">
                      <form className="community-inline-form" onSubmit={publishCommunityTopic}>
                        <div className="community-inline-grid two">
                          <input
                            type="text"
                            value={communityTopicDraft.title}
                            onChange={(event) => setCommunityTopicDraft((current) => ({ ...current, title: event.target.value }))}
                            placeholder="Titulo do topico"
                          />
                          <input
                            type="text"
                            value={communityTopicDraft.body}
                            onChange={(event) => setCommunityTopicDraft((current) => ({ ...current, body: event.target.value }))}
                            placeholder="Resumo do topico"
                          />
                        </div>
                        <button type="submit" className="primary-btn">
                          Criar topico
                        </button>
                      </form>

                      <div className="community-topic-list">
                        {activeCommunityTopics.map((topic) => (
                          <article key={topic.id} className="community-topic-card">
                            <header>
                              <strong>{topic.title}</strong>
                              <div className="community-topic-badges">
                                {topic.pinned && <span className="community-topic-badge">Fixado</span>}
                                {topic.bestReplyId && <span className="community-topic-badge">Resposta marcada</span>}
                              </div>
                            </header>
                            <p>{topic.body}</p>
                            <div className="community-post-actions">
                              <button type="button" className="secondary-btn" onClick={() => togglePinnedTopic(topic.id)}>
                                {topic.pinned ? 'Desfixar' : 'Fixar'}
                              </button>
                            </div>
                            <ul className="community-reply-list">
                              {(topic.replies || []).map((reply) => (
                                <li key={reply.id}>
                                  <div>
                                    <strong>{reply.author?.name || 'Usuario'}</strong>
                                    <p>{reply.text}</p>
                                  </div>
                                  <div className="community-reply-actions">
                                    <button type="button" className="secondary-btn" onClick={() => voteCommunityReply(topic.id, reply.id, 1)}>
                                      +1
                                    </button>
                                    <span>{reply.votes || 0}</span>
                                    <button type="button" className="secondary-btn" onClick={() => voteCommunityReply(topic.id, reply.id, -1)}>
                                      -1
                                    </button>
                                    <button
                                      type="button"
                                      className={reply.isBest ? 'secondary-btn followed' : 'secondary-btn'}
                                      onClick={() => markTopicBestReply(topic.id, reply.id)}
                                    >
                                      Melhor resposta
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                            <div className="community-comment-form">
                              <input
                                type="text"
                                value={communityReplyDrafts[`${selectedCommunity.id}:${topic.id}`] || ''}
                                onChange={(event) =>
                                  setCommunityReplyDrafts((current) => ({
                                    ...current,
                                    [`${selectedCommunity.id}:${topic.id}`]: event.target.value,
                                  }))
                                }
                                placeholder="Responder topico..."
                              />
                              <button type="button" className="secondary-btn" onClick={() => replyCommunityTopic(topic.id)}>
                                Responder
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}

                  {communityWorkspaceTab === 'collab' && (
                    <div className="community-workspace-pane">
                      <form className="community-inline-form" onSubmit={publishCommunityCollab}>
                        <div className="community-inline-grid three">
                          <input
                            type="text"
                            value={communityCollabDraft.title}
                            onChange={(event) => setCommunityCollabDraft((current) => ({ ...current, title: event.target.value }))}
                            placeholder="Titulo do pedido"
                          />
                          <input
                            type="text"
                            value={communityCollabDraft.roleNeeded}
                            onChange={(event) => setCommunityCollabDraft((current) => ({ ...current, roleNeeded: event.target.value }))}
                            placeholder="Procuro: vocal, guitarra, beatmaker..."
                          />
                          <input
                            type="text"
                            value={communityCollabDraft.details}
                            onChange={(event) => setCommunityCollabDraft((current) => ({ ...current, details: event.target.value }))}
                            placeholder="Detalhes do projeto"
                          />
                        </div>
                        <button type="submit" className="primary-btn">
                          Publicar colaboracao
                        </button>
                      </form>

                      <div className="community-collab-list">
                        {activeCommunityCollabs.map((request) => (
                          <article key={request.id} className="community-post-card">
                            <header>
                              <strong>{request.title}</strong>
                              <span>{request.roleNeeded}</span>
                            </header>
                            <p>{request.details}</p>
                            <p className="community-post-meta">{compact(request.applicants || 0)} interessados</p>
                            <div className="community-post-actions">
                              <button type="button" className="secondary-btn" onClick={() => applyCommunityCollab(request)}>
                                Quero colaborar
                              </button>
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() =>
                                  void openOrCreateDirectWithUser({
                                    id: request.author?.id,
                                    name: request.author?.name,
                                    handle: normalizeHandle(request.author?.handle || ''),
                                    avatarUrl: null,
                                  })
                                }
                              >
                                Abrir chat
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}

                  {communityWorkspaceTab === 'challenges' && (
                    <div className="community-workspace-pane">
                      <form className="community-inline-form" onSubmit={publishCommunityChallenge}>
                        <div className="community-inline-grid">
                          <input
                            type="text"
                            value={communityChallengeDraft.title}
                            onChange={(event) => setCommunityChallengeDraft((current) => ({ ...current, title: event.target.value }))}
                            placeholder="Nome do desafio"
                          />
                          <select
                            value={communityChallengeDraft.kind}
                            onChange={(event) => setCommunityChallengeDraft((current) => ({ ...current, kind: event.target.value }))}
                          >
                            <option value="cover">Cover</option>
                            <option value="composicao">Composicao</option>
                            <option value="beat">Beat</option>
                          </select>
                          <input
                            type="date"
                            value={communityChallengeDraft.deadline}
                            onChange={(event) => setCommunityChallengeDraft((current) => ({ ...current, deadline: event.target.value }))}
                          />
                        </div>
                        <textarea
                          value={communityChallengeDraft.details}
                          onChange={(event) => setCommunityChallengeDraft((current) => ({ ...current, details: event.target.value }))}
                          placeholder="Regras do desafio..."
                        />
                        <button type="submit" className="primary-btn">
                          Criar desafio
                        </button>
                      </form>

                      <div className="community-challenge-list">
                        {activeCommunityChallenges.map((challenge) => {
                          const ranking = [...(challenge.participants || [])].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
                          return (
                            <article key={challenge.id} className="community-post-card">
                              <header>
                                <strong>{challenge.title}</strong>
                                <span>{challenge.kind}</span>
                              </header>
                              <p>{challenge.details}</p>
                              <p className="community-post-meta">
                                Prazo: {new Date(challenge.deadline).toLocaleDateString('pt-BR')} • participantes {compact(ranking.length)}
                              </p>
                              <div className="community-post-actions">
                                <button type="button" className="secondary-btn" onClick={() => joinCommunityChallenge(challenge.id)}>
                                  Participar do desafio
                                </button>
                              </div>
                              {ranking.length > 0 && (
                                <ul className="community-leaderboard-list">
                                  {ranking.slice(0, 5).map((participant, index) => (
                                    <li key={`${challenge.id}-participant-${participant.userId}`}>
                                      <span className="community-rank-pos">#{index + 1}</span>
                                      <div className="community-rank-user">
                                        <strong>{participant.name}</strong>
                                        <p>Participante</p>
                                      </div>
                                      <div className="community-rank-score">
                                        <strong>{participant.score}</strong>
                                        <span>pts</span>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {communityWorkspaceTab === 'playlists' && (
                    <div className="community-workspace-pane">
                      <div className="community-playlist-grid">
                        {activeCommunityFeed
                          .filter((post) => post.type === 'playlist' && post.spotifyUrl)
                          .map((post) => (
                            <article key={`playlist-post-${post.id}`} className="community-post-card">
                              <header>
                                <strong>{post.title || 'Playlist da comunidade'}</strong>
                                <span>Playlist</span>
                              </header>
                              {post.text && <p>{post.text}</p>}
                              <div className="community-post-actions">
                                <a href={post.spotifyUrl} target="_blank" rel="noreferrer" className="secondary-btn mode-link-btn">
                                  Ouvir
                                </a>
                                <button type="button" className={post.saved ? 'secondary-btn followed' : 'secondary-btn'} onClick={() => toggleCommunityFeedSave(post.id)}>
                                  Salvar
                                </button>
                                <button type="button" className="secondary-btn" onClick={() => shareCommunityFeedPost(post.id)}>
                                  Comentar/Compartilhar
                                </button>
                              </div>
                            </article>
                          ))}

                        {playlists.slice(0, 6).map((playlist) => (
                          <article key={`community-playlist-lib-${playlist.id}`} className="community-post-card">
                            <header>
                              <strong>{playlist.title}</strong>
                              <span>@{normalizeHandle(playlist.creatorHandle || 'usuario')}</span>
                            </header>
                            <p>{playlist.description || 'Playlist compartilhada na comunidade.'}</p>
                            <div className="community-post-actions">
                              <a href={playlist.spotifyUrl} target="_blank" rel="noreferrer" className="secondary-btn mode-link-btn">
                                Ouvir
                              </a>
                              <button type="button" className={playlist.saved ? 'secondary-btn followed' : 'secondary-btn'} onClick={() => togglePlaylistSave(playlist.id)}>
                                {playlist.saved ? 'Salva' : 'Salvar'}
                              </button>
                              <button type="button" className="secondary-btn" onClick={() => applyPlaylistInComposer(playlist)}>
                                Postar no feed
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {loadingCommunities && <div className="notice">Carregando comunidades...</div>}
              <div className="mode-board-grid">
                {filteredCommunities.map((community) => {
                  const joined = Boolean(community.joined)
                  const communityRanking = communityRankingsById[community.id] || []
                  const isSelected = selectedCommunity?.id === community.id
                  return (
                    <article
                      key={community.id}
                      className={isSelected ? 'mode-card is-selected' : 'mode-card'}
                      style={{
                        borderColor: community.themeColor || undefined,
                      }}
                    >
                      <h3>{community.name}</h3>
                      <p>{community.description || 'Comunidade sem descricao por enquanto.'}</p>
                      <span>
                        {compact(community.members || 0)} membros • {detectCommunityGenre(community)} • @{normalizeHandle(community.creatorHandle || 'comunidade')}
                      </span>
                      {communityRanking[0] && (
                        <div className="community-top-one">
                          <span>Top #1</span>
                          <strong>{communityRanking[0]?.user?.name || 'Usuario'}</strong>
                          <p>{compact(communityRanking[0]?.score || 0)} pts</p>
                        </div>
                      )}
                      <div className="community-card-actions">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => setSelectedCommunityId(community.id)}
                        >
                          Ver detalhes
                        </button>
                        <button
                          type="button"
                          className={joined ? 'secondary-btn community-leave-btn' : 'secondary-btn followed'}
                          onClick={() => toggleCommunityJoin(community.id, { confirmLeave: joined })}
                        >
                          {joined ? 'Sair' : 'Participar'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
              {!loadingCommunities && communities.length === 0 && (
                <div className="notice">Nenhuma comunidade criada ainda. Crie a primeira.</div>
              )}
              {!loadingCommunities && communities.length > 0 && filteredCommunities.length === 0 && (
                <div className="notice">Nenhuma comunidade encontrada com esse filtro.</div>
              )}
            </section>
          )}

          {activeNav === 'Eventos' && !publicProfile && (
            <section className="mode-board appear-up">
              <header className="mode-board-head">
                <h2>Eventos musicais</h2>
                <p>Salve os eventos para acompanhar sua agenda.</p>
              </header>
              <div className="mode-board-grid">
                {events.map((event) => {
                  const saved = savedEvents[event.id]
                  return (
                    <article key={event.id} className="mode-card">
                      <h3>{event.title}</h3>
                      <p>{event.place}</p>
                      <span>{event.when}</span>
                      <button
                        type="button"
                        className={saved ? 'secondary-btn followed' : 'secondary-btn'}
                        onClick={() => toggleEventSave(event.id)}
                      >
                        {saved ? 'Na agenda' : 'Salvar evento'}
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {activeNav === 'Playlists' && !publicProfile && (
            <section className="mode-board appear-up">
              <header className="mode-board-head">
                <h2>Playlists curadas</h2>
                <p>Salve playlists e use uma faixa no seu proximo post.</p>
              </header>
              <form className="mode-create-form" onSubmit={submitPlaylist}>
                <div className="mode-create-grid">
                  <input
                    type="text"
                    value={playlistDraft.title}
                    onChange={(event) => setPlaylistDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Titulo da playlist"
                  />
                  <input
                    type="text"
                    value={playlistDraft.spotifyUrl}
                    onChange={(event) => setPlaylistDraft((current) => ({ ...current, spotifyUrl: event.target.value }))}
                    placeholder="https://open.spotify.com/playlist/..."
                  />
                  <input
                    type="text"
                    value={playlistDraft.description}
                    onChange={(event) => setPlaylistDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Descricao (opcional)"
                  />
                </div>
                <button type="submit" className="primary-btn" disabled={creatingPlaylist}>
                  {creatingPlaylist ? 'Salvando...' : 'Adicionar playlist'}
                </button>
              </form>
              {loadingPlaylists && <div className="notice">Carregando playlists...</div>}
              <div className="mode-board-grid">
                {playlists.map((playlist) => {
                  const saved = Boolean(playlist.saved)
                  return (
                    <article key={playlist.id} className="mode-card">
                      <h3>{playlist.title}</h3>
                      <p>{playlist.description || `Curadoria por ${playlist.creatorName || 'Comunidade'}`}</p>
                      <span>
                        {compact(playlist.saves || 0)} salvos • @{normalizeHandle(playlist.creatorHandle || 'usuario')}
                      </span>
                      <div className="mode-card-actions mode-card-actions-playlist">
                        <button
                          type="button"
                          className={saved ? 'secondary-btn followed' : 'secondary-btn'}
                          onClick={() => togglePlaylistSave(playlist.id)}
                        >
                          {saved ? 'Salva' : 'Salvar'}
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => applyPlaylistInComposer(playlist)}>
                          Usar no post
                        </button>
                        <a href={playlist.spotifyUrl} target="_blank" rel="noreferrer" className="secondary-btn mode-link-btn">
                          Abrir Spotify
                        </a>
                      </div>
                    </article>
                  )
                })}
              </div>
              {!loadingPlaylists && playlists.length === 0 && (
                <div className="notice">Nenhuma playlist cadastrada ainda. Adicione uma playlist Spotify.</div>
              )}

              <section className="spotify-capsule-board">
                <header className="spotify-capsule-head">
                  <div>
                    <h3>Capsula Spotify</h3>
                    <p>Sincronize sua conta e entre na competicao de quem mais ouve musica.</p>
                  </div>
                  <div className="spotify-capsule-actions">
                    {spotifyCapsuleConnection ? (
                      <>
                        <button type="button" className="secondary-btn" onClick={handleSyncSpotifyCapsule} disabled={syncingSpotifyCapsule}>
                          {syncingSpotifyCapsule ? 'Sincronizando...' : 'Sincronizar agora'}
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={disconnectSpotifyCapsule}
                          disabled={disconnectingSpotifyCapsule}
                        >
                          {disconnectingSpotifyCapsule ? 'Saindo...' : 'Desconectar'}
                        </button>
                      </>
                    ) : (
                      <button type="button" className="primary-btn" onClick={connectSpotifyCapsule}>
                        Conectar Spotify
                      </button>
                    )}
                  </div>
                </header>

                <div className="spotify-capsule-periods">
                  {spotifyCapsulePeriods.map((periodOption) => (
                    <button
                      key={`capsule-period-${periodOption.id}`}
                      type="button"
                      className={spotifyCapsulePeriod === periodOption.id ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => setSpotifyCapsulePeriod(periodOption.id)}
                    >
                      {periodOption.label}
                    </button>
                  ))}
                </div>

                {loadingSpotifyCapsule && <div className="notice">Carregando capsula Spotify...</div>}

                {!loadingSpotifyCapsule && spotifyCapsuleConnection && (
                  <div className="spotify-capsule-connection">
                    <div className="avatar">
                      {spotifyCapsuleConnection.avatarUrl ? (
                        <img src={spotifyCapsuleConnection.avatarUrl} alt={spotifyCapsuleConnection.displayName || 'Spotify'} />
                      ) : (
                        initials(spotifyCapsuleConnection.displayName || currentUser?.name || 'Spotify')
                      )}
                    </div>
                    <div>
                      <strong>{spotifyCapsuleConnection.displayName || 'Conta conectada'}</strong>
                      <p>
                        {spotifyCapsuleConnection.country || 'Spotify'} • ultimo sync{' '}
                        {spotifyCapsuleConnection.lastSyncedAt ? timeAgo(spotifyCapsuleConnection.lastSyncedAt) : 'agora'}
                      </p>
                    </div>
                  </div>
                )}

                {!loadingSpotifyCapsule && !spotifyCapsuleConnection && (
                  <div className="notice warn">
                    Conecte sua conta Spotify para sincronizar sua capsula e entrar no ranking.
                  </div>
                )}

                {spotifyCapsuleMine && (
                  <article className="spotify-capsule-mine">
                    <div className="spotify-capsule-metrics">
                      <div>
                        <span>Score</span>
                        <strong>{compact(spotifyCapsuleMine.score)}</strong>
                      </div>
                      <div>
                        <span>Minutos (hist.)</span>
                        <strong>{compact(spotifyCapsuleMine.minutesEstimate)}</strong>
                      </div>
                      <div>
                        <span>Plays periodo</span>
                        <strong>{compact(spotifyCapsuleMine.recentPlays)}</strong>
                      </div>
                    </div>
                    <p className="spotify-capsule-top">
                      Top faixas:{' '}
                      {(spotifyCapsuleMine.topTracks || [])
                        .slice(0, 3)
                        .map((track) => track?.name)
                        .filter(Boolean)
                        .join(' • ') || 'Sincronize para ver seus destaques'}
                    </p>
                  </article>
                )}

                <div className="spotify-capsule-ranking">
                  {(spotifyCapsuleLeaderboard || []).map((entry, index) => {
                    const isMe = entry.userId === currentUser?.id
                    return (
                      <article key={entry.id || `${entry.userId}-${index}`} className={isMe ? 'spotify-rank-row is-me' : 'spotify-rank-row'}>
                        <span className="spotify-rank-pos">#{index + 1}</span>
                        <div className="avatar">
                          {entry.user?.avatarUrl ? (
                            <img src={entry.user.avatarUrl} alt={entry.user?.name || 'User'} />
                          ) : (
                            initials(entry.user?.name || 'User')
                          )}
                        </div>
                        <div className="spotify-rank-user">
                          <strong>{entry.user?.name || 'Usuario'}</strong>
                          <p>@{normalizeHandle(entry.user?.handle || 'user')}</p>
                        </div>
                        <div className="spotify-rank-score">
                          <strong>{compact(entry.score)}</strong>
                          <span>pts</span>
                        </div>
                      </article>
                    )
                  })}
                </div>

                {!loadingSpotifyCapsule && (spotifyCapsuleLeaderboard || []).length === 0 && (
                  <div className="notice">Sem ranking para {capsulePeriodLabel(spotifyCapsulePeriod)} ainda.</div>
                )}
              </section>
            </section>
          )}

          {activeNav === 'Perfil' && !publicProfile && (
            <section className="profile-ig appear-up" aria-label="Seu perfil">
              <header className="profile-ig-top">
                <strong className="profile-ig-handle">@{normalizeHandle(currentUser?.handle || 'usuario')}</strong>
                <button type="button" className="secondary-btn profile-ig-top-btn" onClick={openProfileEditor}>
                  Editar
                </button>
              </header>

              <div className="profile-ig-main">
                <div className="avatar avatar-xl profile-ig-avatar">
                  {currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.name || 'Usuario'} />
                  ) : (
                    initials(currentUser?.name || 'Usuario')
                  )}
                </div>

                <div className="profile-ig-metrics">
                  <article>
                    <strong>{compact(ownProfilePosts.length)}</strong>
                    <span>Publicacoes</span>
                  </article>
                  <article>
                    <strong>{compact(profileStats.followers)}</strong>
                    <span>Seguidores</span>
                  </article>
                  <article>
                    <strong>{compact(profileStats.following)}</strong>
                    <span>Seguindo</span>
                  </article>
                </div>
              </div>

              <div className="profile-ig-bio">
                <h3>{currentUser?.name || 'Usuario'}</h3>
                <p>{currentUser?.bio || 'Produtor musical independente e apaixonado por novas sonoridades.'}</p>
              </div>

              <div className="profile-ig-actions">
                <button type="button" className="secondary-btn" onClick={openProfileEditor}>
                  Seguindo
                </button>
                <button type="button" className="secondary-btn" onClick={() => activateNav('Direct')}>
                  Mensagem
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    if (currentUser?.handle) {
                      void openPublicProfile(currentUser.handle)
                    }
                  }}
                >
                  Contato
                </button>
              </div>

              <div className="profile-ig-highlights">
                <button type="button" className="profile-ig-highlight" onClick={openStoryComposer}>
                  <span className="profile-ig-highlight-circle">+</span>
                  <span>Novo</span>
                </button>
                {stories.slice(0, 4).map((group) => (
                  <button
                    type="button"
                    key={`profile-highlight-${group.userId}`}
                    className="profile-ig-highlight"
                    onClick={() => openStoryGroup(group.userId)}
                  >
                    <span className="profile-ig-highlight-circle">
                      {group.user.avatarUrl ? (
                        <img src={group.user.avatarUrl} alt={group.user.name} />
                      ) : (
                        initials(group.user.name)
                      )}
                    </span>
                    <span>{group.own ? 'Seu story' : group.user.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              <div className="profile-ig-tabs" role="tablist" aria-label="Abas do perfil">
                <button
                  type="button"
                  role="tab"
                  aria-selected={profileTab === 'posts'}
                  className={profileTab === 'posts' ? 'active' : ''}
                  onClick={() => setProfileTab('posts')}
                >
                  Posts
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={profileTab === 'tracks'}
                  className={profileTab === 'tracks' ? 'active' : ''}
                  onClick={() => setProfileTab('tracks')}
                >
                  Faixas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={profileTab === 'about'}
                  className={profileTab === 'about' ? 'active' : ''}
                  onClick={() => setProfileTab('about')}
                >
                  Sobre
                </button>
              </div>

              {profileTab === 'posts' && (
                <div className="profile-ig-grid">
                  {ownProfilePosts.length > 0 ? (
                    ownProfilePosts.slice(0, 12).map((post) => (
                      <article key={`profile-grid-${post.id}`} className="profile-ig-grid-item">
                        {post.media && post.media.type !== 'audio' ? (
                          <img src={post.media.url} alt={`Post de ${post.user.name}`} loading="lazy" />
                        ) : (
                          <div
                            className="profile-ig-grid-fallback"
                            style={{ backgroundImage: gradientFromSeed(`${post.id}-${post.mood}`) }}
                          >
                            <span>{post.track?.title || post.mood}</span>
                          </div>
                        )}
                      </article>
                    ))
                  ) : (
                    <p className="profile-ig-empty">Ainda nao existem publicacoes no seu perfil.</p>
                  )}
                </div>
              )}

              {profileTab === 'tracks' && (
                <div className="profile-ig-list">
                  {ownProfileTrackPosts.length > 0 ? (
                    ownProfileTrackPosts.slice(0, 8).map((post) => (
                      <article key={`profile-track-${post.id}`} className="profile-ig-list-item">
                        <strong>{post.track.title}</strong>
                        <p>{post.track.artist}</p>
                      </article>
                    ))
                  ) : (
                    <p className="profile-ig-empty">Nenhuma faixa cadastrada nos seus posts ainda.</p>
                  )}
                </div>
              )}

              {profileTab === 'about' && (
                <div className="profile-ig-list">
                  <article className="profile-ig-list-item">
                    <strong>Direct</strong>
                    <p>{compact(totalDirectUnread)} mensagens nao lidas</p>
                  </article>
                  <article className="profile-ig-list-item">
                    <strong>Playlists salvas</strong>
                    <p>{playlists.filter((playlist) => playlist.saved).length} playlists</p>
                  </article>
                  <article className="profile-ig-list-item">
                    <strong>Eventos salvos</strong>
                    <p>{Object.values(savedEvents).filter(Boolean).length} eventos</p>
                  </article>
                </div>
              )}
            </section>
          )}

          {activeNav === 'Direct' && !publicProfile && (
            <section
              className="direct-board appear-up"
              aria-label="Direct"
              style={isMobileViewport ? { '--direct-mobile-bg': directMobileBg } : undefined}
            >
              <aside
                className={
                  showDirectListPane
                    ? 'direct-threads direct-pane direct-pane-list is-active'
                    : 'direct-threads direct-pane direct-pane-list is-inactive'
                }
              >
                <header className="direct-board-head">
                  <div>
                    <h2>Direct</h2>
                    <span>{compact(totalDirectUnread)} nao lidas</span>
                  </div>
                  <div className="direct-board-actions">
                    <button
                      type="button"
                      className="secondary-btn direct-theme-toggle"
                      onClick={() => setDirectThemeOpen((current) => !current)}
                    >
                      Tema
                    </button>
                    <button
                      type="button"
                      className="theme-icon-toggle compact direct-mode-btn"
                      onClick={() => setThemeMode((current) => (current === 'dark' ? 'clean' : 'dark'))}
                      aria-label={themeMode === 'dark' ? 'Ativar modo clean' : 'Ativar modo dark'}
                      title={themeMode === 'dark' ? 'Ativar modo clean' : 'Ativar modo dark'}
                    >
                      <ThemeModeIcon mode={themeMode} />
                    </button>
                    <button
                      type="button"
                      className="secondary-btn direct-exit-btn"
                      onClick={() => {
                        setDirectThemeOpen(false)
                        activateNav('Feed')
                      }}
                    >
                      Voltar
                    </button>
                  </div>
                </header>
                {directThemeOpen && (
                  <div className="direct-theme-panel">
                    <p>Cor de fundo</p>
                    <div className="direct-theme-swatches">
                      {directMobileThemePresets.map((preset) => (
                        <button
                          type="button"
                          key={`theme-${preset.id}`}
                          className={directMobileBg === preset.color ? 'direct-theme-swatch active' : 'direct-theme-swatch'}
                          style={{ backgroundColor: preset.color }}
                          title={preset.label}
                          onClick={() => setDirectMobileBg(preset.color)}
                        />
                      ))}
                    </div>
                    <label className="direct-theme-custom">
                      Personalizada
                      <input
                        type="color"
                        value={directMobileBg}
                        onChange={(event) => setDirectMobileBg(event.target.value)}
                      />
                    </label>
                  </div>
                )}
                {isDirectInitialLoading && <div className="notice">Carregando conversas...</div>}
                {!isDirectInitialLoading && (
                  <ul>
                    {directThreads.map((thread) => {
                      const active = thread.id === activeDirectThread?.id
                      return (
                        <li key={thread.id}>
                          <button
                            type="button"
                            className={active ? 'direct-thread-item active' : 'direct-thread-item'}
                            onClick={() => {
                              setDirectThemeOpen(false)
                              void openDirectThread(thread.id)
                            }}
                          >
                            <div className="avatar">
                              {thread.participant.avatarUrl ? (
                                <img src={thread.participant.avatarUrl} alt={thread.participant.name} />
                              ) : (
                                initials(thread.participant.name)
                              )}
                            </div>
                            <div>
                              <strong>{thread.participant.name}</strong>
                              <p>@{normalizeHandle(thread.participant.handle)}</p>
                            </div>
                            <span>{thread.unread > 0 ? compact(thread.unread) : timeAgo(thread.updatedAt)}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </aside>

              <div
                className={
                  showDirectChatPane
                    ? 'direct-chat direct-pane direct-pane-chat is-active'
                    : 'direct-chat direct-pane direct-pane-chat is-inactive'
                }
              >
                {isDirectInitialLoading ? (
                  <div className="notice">Sincronizando mensagens...</div>
                ) : activeDirectThread ? (
                  <>
                    <header className="direct-chat-head">
                      <div className="direct-chat-head-main">
                        {isMobileViewport && (
                          <button
                            type="button"
                            className="secondary-btn direct-mobile-back"
                            onClick={() => setDirectMobileView('list')}
                            aria-label="Voltar para conversas"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M15.5 4.5 8 12l7.5 7.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        )}
                        <div className="avatar direct-chat-avatar">
                          {activeDirectThread.participant.avatarUrl ? (
                            <img src={activeDirectThread.participant.avatarUrl} alt={activeDirectThread.participant.name} />
                          ) : (
                            initials(activeDirectThread.participant.name)
                          )}
                        </div>
                        <div className="direct-chat-head-text">
                          <strong>{activeDirectThread.participant.name}</strong>
                          <p>
                            @{normalizeHandle(activeDirectThread.participant.handle)}{' '}
                            {activeDirectThread.participant.online ? '• online' : '• offline'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="secondary-btn direct-profile-btn"
                        onClick={() => openPublicProfile(activeDirectThread.participant.handle)}
                      >
                        Ver perfil
                      </button>
                    </header>

                    <div className="direct-message-list">
                      {activeDirectThread.messages.map((message) => {
                        const own = message.senderId === currentUser?.id
                        return (
                          <article key={message.id} className={own ? 'direct-message own' : 'direct-message'}>
                            <p>{message.text}</p>
                            <span>{timeAgo(message.createdAt)}</span>
                          </article>
                        )
                      })}
                    </div>

                    <form className="direct-form" onSubmit={sendDirectMessage}>
                      <input
                        type="text"
                        value={directDraft}
                        onChange={(event) => setDirectDraft(event.target.value)}
                        placeholder="Escreva uma mensagem..."
                      />
                      <button type="submit" className="primary-btn" disabled={!directDraft.trim() || sendingDirect}>
                        {sendingDirect ? 'Enviando...' : 'Enviar'}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="notice">Nenhuma conversa disponivel.</div>
                )}
              </div>
            </section>
          )}

          {(statusMessage || errorMessage) && (
            <section className="message-stack appear-up delay-1">
              {statusMessage && <div className="notice success">{statusMessage}</div>}
              {errorMessage && <div className="notice error">{errorMessage}</div>}
            </section>
          )}

          {loadingPublicProfile && (
            <section className="public-profile-view">
              <div className="notice">Carregando perfil...</div>
            </section>
          )}

          {!loadingPublicProfile && publicProfile && (
            <section className="public-profile-view appear-up">
              <header className="public-profile-head">
                <div className="public-profile-meta">
                  <div className="avatar avatar-xl">
                    {publicProfile.profile.avatarUrl ? (
                      <img src={publicProfile.profile.avatarUrl} alt={publicProfile.profile.name} />
                    ) : (
                      initials(publicProfile.profile.name)
                    )}
                  </div>
                  <div>
                    <h2>{publicProfile.profile.name}</h2>
                    <p>@{normalizeHandle(publicProfile.profile.handle)}</p>
                    <span>{publicProfile.profile.bio || 'Sem bio ainda.'}</span>
                  </div>
                </div>
                <div className="public-profile-actions">
                  {currentUser && currentUser.id !== publicProfile.profile.id && (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => openOrCreateDirectWithUser(publicProfile.profile)}
                    >
                      Mensagem
                    </button>
                  )}
                  {currentUser && currentUser.id !== publicProfile.profile.id && (
                    <button
                      type="button"
                      className={publicProfile.isFollowing ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => handleFollowToggle(publicProfile.profile.id)}
                    >
                      {publicProfile.isFollowing ? 'Seguindo' : 'Seguir'}
                    </button>
                  )}
                  <button type="button" className="secondary-btn" onClick={closePublicProfile}>
                    Voltar ao feed
                  </button>
                </div>
              </header>
              <div className="public-profile-stats">
                <article>
                  <strong>{compact(publicProfile.posts.length)}</strong>
                  <span>posts</span>
                </article>
                <article>
                  <strong>{compact(publicProfile.followers)}</strong>
                  <span>seguidores</span>
                </article>
                <article>
                  <strong>{compact(publicProfile.following)}</strong>
                  <span>seguindo</span>
                </article>
              </div>
            </section>
          )}

          {!publicProfile && activeNav === 'Feed' && showComposer && (
            <section ref={composerRef} id="composer" className="composer appear-up delay-2" aria-label="Criar post">
            <h2>Publicar agora</h2>
            <textarea
              value={composer.text}
              onChange={(event) => handleComposer('text', event.target.value)}
              placeholder="Compartilhe um trecho, um sentimento ou uma recomendacao..."
            />
            <div className="mood-row">
              {moods.map((mood) => (
                <button
                  type="button"
                  key={mood}
                  className={composer.mood === mood ? 'mood-chip active' : 'mood-chip'}
                  onClick={() => handleComposer('mood', mood)}
                >
                  {mood}
                </button>
              ))}
            </div>
            <div className="composer-grid">
              <input
                value={composer.track}
                onChange={(event) => handleComposer('track', event.target.value)}
                type="text"
                placeholder="Nome da faixa"
              />
              <input
                value={composer.artist}
                onChange={(event) => handleComposer('artist', event.target.value)}
                type="text"
                placeholder="Artista"
              />
              <button type="button" className="primary-btn" onClick={publishPost} disabled={publishing}>
                {publishing ? 'Publicando...' : 'Publicar'}
              </button>
            </div>

            <div className="spotify-picker-row">
              <button type="button" className="secondary-btn" onClick={openSpotifyPicker}>
                {selectedSpotify ? 'Trocar Spotify' : 'Escolher no Spotify'}
              </button>
              {selectedSpotify && (
                <>
                  <span className="spotify-selected-kind">
                    {selectedSpotify.type === 'link' ? 'link' : selectedSpotify.type}
                  </span>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      handleComposer('spotifyUrl', '')
                      setSpotifyManualUrl('')
                    }}
                  >
                    Remover
                  </button>
                </>
              )}
            </div>

            {selectedSpotify && (
              <div className="spotify-card composer-spotify-preview">
                {selectedSpotify.embedUrl ? (
                  <iframe
                    src={selectedSpotify.embedUrl}
                    title={`Spotify selecionado ${selectedSpotify.type}`}
                    loading="lazy"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  />
                ) : (
                  <p>Link do Spotify selecionado. O embed sera exibido quando o formato for suportado.</p>
                )}
                <a href={selectedSpotify.url} target="_blank" rel="noreferrer">
                  Abrir no Spotify
                </a>
              </div>
            )}

            <div className="media-input-row">
              <label className="file-pill" htmlFor="composer-file">
                <span>{mediaFile ? 'Trocar imagem/audio' : 'Adicionar imagem/audio'}</span>
              </label>
              <input
                id="composer-file"
                ref={fileInputRef}
                type="file"
                className="file-native"
                accept="image/*,audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm,.opus,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif"
                onChange={onSelectMedia}
              />
              {mediaFile && (
                <button type="button" className="secondary-btn" onClick={clearComposerMedia}>
                  Remover arquivo
                </button>
              )}
            </div>

            {mediaFile && (
              <div className="draft-preview">
                <p>
                  Arquivo selecionado: <strong>{mediaFile.name}</strong>
                </p>
                {inferMediaKindFromFile(mediaFile) === 'audio' ? (
                  <audio controls src={mediaPreview} preload="metadata" />
                ) : (
                  <img src={mediaPreview} alt="Previa de imagem" />
                )}
              </div>
            )}
            </section>
          )}

          {(publicProfile || activeNav === 'Feed' || activeNav === 'Descobrir') && (
          <section className="feed-list" aria-label="Feed de posts">
            {loadingFeed && <div className="notice">Carregando feed...</div>}

            {!loadingFeed && displayedPosts.length === 0 && !searchQuery && (
              <div className="notice">Nenhum post ainda. Publique sua primeira faixa.</div>
            )}

            {!loadingFeed && displayedPosts.length === 0 && searchQuery && (
              <div className="notice">Nenhum resultado para "{searchQuery}".</div>
            )}

            {displayedPosts.map((post, index) => (
              <article
                key={post.id}
                className={playingPostId === post.id ? 'post-card appear-up is-playing' : 'post-card appear-up'}
                style={{ animationDelay: `${220 + index * 70}ms` }}
                onMouseMove={handleInteractiveMove}
                onMouseLeave={clearInteractiveMove}
              >
                <header className="post-head">
                  <div className="post-user">
                    <button
                      type="button"
                      className="avatar-button"
                      onClick={() => openPublicProfile(post.user.handle)}
                      aria-label={`Abrir perfil de ${post.user.name}`}
                    >
                      <div className="avatar">
                        {post.user.avatarUrl ? <img src={post.user.avatarUrl} alt={post.user.name} /> : initials(post.user.name)}
                      </div>
                    </button>
                    <div>
                      <button
                        type="button"
                        className="text-user-trigger"
                        onClick={() => openPublicProfile(post.user.handle)}
                      >
                        <strong>{post.user.name}</strong>
                      </button>
                      <p>
                        @{normalizeHandle(post.user.handle)} • {timeAgo(post.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className="mood-pill">{post.mood}</span>
                </header>

                <p className="post-text">{post.text}</p>

                {post.track && (
                  <div className="track-preview">
                    <div
                      className="track-cover"
                      aria-hidden="true"
                      style={{ backgroundImage: gradientFromSeed(`${post.track.title}-${post.track.artist}`) }}
                    />
                    <div className="track-meta">
                      <strong>{post.track.title}</strong>
                      <span>{post.track.artist}</span>
                    </div>
                    <button
                      type="button"
                      className={playingPostId === post.id ? 'play-chip active' : 'play-chip'}
                      onClick={() => toggleVisualPlayer(post.id)}
                    >
                      {playingPostId === post.id ? 'Pausar visual' : 'Tocar visual'}
                    </button>
                  </div>
                )}

                {post.spotify && (
                  <div className="spotify-card">
                    {post.spotify.embedUrl ? (
                      <iframe
                        src={post.spotify.embedUrl}
                        title={`Spotify ${post.spotify.type} ${post.id}`}
                        loading="lazy"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      />
                    ) : (
                      <p>Esse link nao gera embed direto, mas abre normalmente no Spotify.</p>
                    )}
                    <a href={post.spotify.url} target="_blank" rel="noreferrer">
                      Abrir no Spotify
                    </a>
                  </div>
                )}

                <div className={playingPostId === post.id ? 'waveform active' : 'waveform'} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                {post.media && (
                  <div className="media-card">
                    {post.media.type === 'audio' ? (
                      <audio controls src={post.media.url} preload="metadata" />
                    ) : (
                      <img src={post.media.url} alt={`Midia do post de ${post.user.name}`} loading="lazy" />
                    )}
                  </div>
                )}

                <div className="action-row">
                  <button
                    type="button"
                    className={likeButtonClassName(post)}
                    onClick={() => toggleReaction(post.id, 'like')}
                    disabled={Boolean(busyActions[`like:${post.id}`])}
                  >
                    Like {compact(post.likes)}
                  </button>
                  <button type="button" className="react-btn" onClick={() => focusCommentInput(post.id)}>
                    Comentarios {compact(post.comments.length)}
                  </button>
                  <button
                    type="button"
                    className={post.reposted ? 'react-btn active' : 'react-btn'}
                    onClick={() => toggleReaction(post.id, 'repost')}
                    disabled={Boolean(busyActions[`repost:${post.id}`])}
                  >
                    Repost {compact(post.reposts)}
                  </button>
                </div>

                <form className="comment-form" onSubmit={(event) => submitComment(event, post.id)}>
                  <input
                    ref={(node) => {
                      if (node) {
                        commentInputRefs.current[post.id] = node
                      }
                    }}
                    type="text"
                    value={commentDrafts[post.id] || ''}
                    onChange={(event) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [post.id]: event.target.value,
                      }))
                    }
                    placeholder="Responder este post"
                  />
                  <button type="submit" className="secondary-btn" disabled={Boolean(busyActions[`comment:${post.id}`])}>
                    Enviar
                  </button>
                </form>

                {post.comments.length > 0 && (
                  <ul className="comment-list">
                    {post.comments.slice(-3).map((comment) => (
                      <li key={comment.id}>
                        <div className="avatar avatar-comment">
                          {comment.authorAvatarUrl ? (
                            <img src={comment.authorAvatarUrl} alt={comment.authorName} />
                          ) : (
                            initials(comment.authorName)
                          )}
                        </div>
                        <div className="comment-body">
                          <strong>
                            {comment.authorName} (@{normalizeHandle(comment.authorHandle)})
                          </strong>
                          <p>{comment.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </section>
          )}
        </main>

        {activeNav !== 'Direct' && (
        <aside className="panel right-panel appear-up delay-1">
          <section className="widget direct-widget" onMouseMove={handleInteractiveMove} onMouseLeave={clearInteractiveMove}>
            <div className="widget-head">
              <h3>Direct</h3>
              <span>{compact(totalDirectUnread)} nao lidas</span>
            </div>
            <ul className="direct-mini-list">
              {directThreads.slice(0, 4).map((thread) => (
                <li key={`mini-${thread.id}`}>
                  <button type="button" onClick={() => openDirectThread(thread.id, { moveToDirect: true })}>
                    <div className="avatar">
                      {thread.participant.avatarUrl ? (
                        <img src={thread.participant.avatarUrl} alt={thread.participant.name} />
                      ) : (
                        initials(thread.participant.name)
                      )}
                    </div>
                    <div>
                      <strong>{thread.participant.name}</strong>
                      <p>@{normalizeHandle(thread.participant.handle)}</p>
                    </div>
                    <span>{thread.unread > 0 ? compact(thread.unread) : timeAgo(thread.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="secondary-btn direct-open-btn" onClick={() => activateNav('Direct')}>
              Abrir inbox
            </button>
          </section>

          <section className="widget" onMouseMove={handleInteractiveMove} onMouseLeave={clearInteractiveMove}>
            <div className="widget-head">
              <h3>Top da semana</h3>
              <span>Brasil</span>
            </div>
            <ul className="rank-list">
              {trendingTracks.map((track, index) => (
                <li key={track.id}>
                  <span className="rank">#{index + 1}</span>
                  <div>
                    <strong>{track.title}</strong>
                    <p>{track.artist}</p>
                  </div>
                  <span className="plays">{compact(track.plays)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="widget" onMouseMove={handleInteractiveMove} onMouseLeave={clearInteractiveMove}>
            <div className="widget-head">
              <h3>Proximos eventos</h3>
            </div>
            <ul className="event-list">
              {events.map((event) => (
                <li key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{event.when}</span>
                  <p>{event.place}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="widget" onMouseMove={handleInteractiveMove} onMouseLeave={clearInteractiveMove}>
            <div className="widget-head">
              <h3>Pessoas para seguir</h3>
            </div>
            <ul className="suggestion-list">
              {peopleToFollow.map((person) => {
                const following = Boolean(person.followed)
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="avatar-button"
                      onClick={() => openPublicProfile(person.handle)}
                      aria-label={`Abrir perfil de ${person.name}`}
                    >
                      <div className="avatar">
                        {person.avatarUrl ? <img src={person.avatarUrl} alt={person.name} /> : initials(person.name)}
                      </div>
                    </button>
                    <div>
                      <button
                        type="button"
                        className="text-user-trigger"
                        onClick={() => openPublicProfile(person.handle)}
                      >
                        <strong>{person.name}</strong>
                      </button>
                      <p>{toRoleText(person.role)}</p>
                      <span>{compact(person.followers || 0)} seguidores</span>
                    </div>
                    <button
                      type="button"
                      className={following ? 'secondary-btn followed' : 'secondary-btn'}
                      onClick={() => handleFollowToggle(person.id)}
                      disabled={currentUser?.id === person.id}
                    >
                      {following ? 'Seguindo' : 'Seguir'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>
        )}
      </div>

      {storyViewer.open && activeStoryGroup && activeStoryItem && (
        <div className="story-viewer-overlay" role="presentation" onClick={closeStoryViewer}>
          <section
            className="story-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={`Story de ${activeStoryGroup.user.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="story-viewer-head">
              <div className="story-progress">
                {activeStoryGroup.items.map((item, index) => (
                  <span
                    key={`story-progress-${item.id}`}
                    className={
                      index < storyViewer.itemIndex
                        ? 'done'
                        : index === storyViewer.itemIndex
                          ? 'active'
                          : ''
                    }
                  />
                ))}
              </div>
              <div className="story-viewer-meta">
                <div className="story-meta-user">
                  <div className="avatar">
                    {activeStoryGroup.user.avatarUrl ? (
                      <img src={activeStoryGroup.user.avatarUrl} alt={activeStoryGroup.user.name} />
                    ) : (
                      initials(activeStoryGroup.user.name)
                    )}
                  </div>
                  <div>
                    <strong>{activeStoryGroup.user.name}</strong>
                    <p>
                      @{normalizeHandle(activeStoryGroup.user.handle)} • {timeAgo(activeStoryItem.createdAt)}
                    </p>
                  </div>
                </div>
                <button type="button" className="secondary-btn" onClick={closeStoryViewer}>
                  Fechar
                </button>
              </div>
            </header>

            <div className="story-viewer-body">
              <button type="button" className="story-nav story-nav-prev" aria-label="Story anterior" onClick={goToPrevStory}>
                ‹
              </button>

              <article className="story-frame">
                {activeStoryItem.media ? (
                  activeStoryItem.media.type === 'audio' ? (
                    <div className="story-audio-shell">
                      <div
                        className="story-artwork"
                        aria-hidden="true"
                        style={{
                          backgroundImage: gradientFromSeed(
                            `${activeStoryGroup.user.handle}-${activeStoryItem.createdAt}`,
                          ),
                        }}
                      />
                      <audio controls autoPlay src={activeStoryItem.media.url} preload="metadata" />
                    </div>
                  ) : (
                    <img src={activeStoryItem.media.url} alt={`Story de ${activeStoryGroup.user.name}`} />
                  )
                ) : (
                  <div
                    className="story-fallback"
                    style={{
                      backgroundImage: gradientFromSeed(
                        `${activeStoryGroup.user.handle}-${activeStoryItem.text || activeStoryItem.createdAt}`,
                      ),
                    }}
                  />
                )}

                {(activeStoryItem.text || activeStoryItem.track) && (
                  <div className="story-caption">
                    {activeStoryItem.track && (
                      <span className="story-track">
                        {activeStoryItem.track.title} - {activeStoryItem.track.artist}
                      </span>
                    )}
                    {activeStoryItem.text && <p>{activeStoryItem.text}</p>}
                  </div>
                )}
              </article>

              <button type="button" className="story-nav story-nav-next" aria-label="Proximo story" onClick={goToNextStory}>
                ›
              </button>
            </div>
          </section>
        </div>
      )}

      {storyComposerOpen && (
        <div className="modal-overlay" role="presentation" onClick={closeStoryComposer}>
          <section
            className="story-composer-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Criar story"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="profile-editor-head">
              <h2>Novo story</h2>
              <button type="button" className="secondary-btn" onClick={closeStoryComposer}>
                Fechar
              </button>
            </header>

            <form className="profile-editor-form" onSubmit={publishStory}>
              <label>
                Texto do story
                <textarea
                  value={storyDraft.text}
                  maxLength={240}
                  onChange={(event) =>
                    setStoryDraft((current) => ({
                      ...current,
                      text: event.target.value,
                    }))
                  }
                  placeholder="Compartilhe uma ideia, trecho ou mensagem."
                />
              </label>

              <div className="composer-grid story-composer-grid">
                <input
                  value={storyDraft.track}
                  onChange={(event) =>
                    setStoryDraft((current) => ({
                      ...current,
                      track: event.target.value,
                    }))
                  }
                  type="text"
                  placeholder="Nome da faixa (opcional)"
                />
                <input
                  value={storyDraft.artist}
                  onChange={(event) =>
                    setStoryDraft((current) => ({
                      ...current,
                      artist: event.target.value,
                    }))
                  }
                  type="text"
                  placeholder="Artista (opcional)"
                />
              </div>

              <div className="media-input-row">
                <label className="file-pill" htmlFor="story-file-input">
                  {storyMediaFile ? 'Trocar imagem/audio' : 'Adicionar imagem/audio'}
                </label>
                <input
                  id="story-file-input"
                  ref={storyMediaInputRef}
                  type="file"
                  className="file-native"
                  accept="image/*,audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm,.opus,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif"
                  onChange={onSelectStoryMedia}
                />
                {storyMediaFile && (
                  <button type="button" className="secondary-btn" onClick={clearStoryComposerMedia}>
                    Remover arquivo
                  </button>
                )}
              </div>

              {storyMediaFile && (
                <div className="draft-preview">
                  <p>
                    Arquivo selecionado: <strong>{storyMediaFile.name}</strong>
                  </p>
                  {inferMediaKindFromFile(storyMediaFile) === 'audio' ? (
                    <audio controls src={storyMediaPreview} preload="metadata" />
                  ) : (
                    <img src={storyMediaPreview} alt="Preview do story" />
                  )}
                </div>
              )}

              <div className="profile-editor-footer">
                <span>{storyDraft.text.length}/240</span>
                <button type="submit" className="primary-btn" disabled={publishingStory}>
                  {publishingStory ? 'Publicando...' : 'Publicar story'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {spotifyPickerOpen && (
        <div className="modal-overlay" role="presentation" onClick={closeSpotifyPicker}>
          <section
            className="spotify-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Escolher conteudo do Spotify"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="profile-editor-head">
              <h2>Escolher no Spotify</h2>
              <button type="button" className="secondary-btn" onClick={closeSpotifyPicker}>
                Fechar
              </button>
            </header>

            <div className="spotify-picker-tools">
              <input
                type="search"
                value={spotifyPickerQuery}
                onChange={(event) => setSpotifyPickerQuery(event.target.value)}
                placeholder="Filtrar por nome (tracks, playlists, albums)"
              />
              <a href="https://open.spotify.com/search" target="_blank" rel="noreferrer">
                Abrir busca Spotify
              </a>
            </div>

            <div className="spotify-picker-grid">
              {filteredSpotifyLibrary.map((item) => {
                const parsed = parseSpotifyUrl(item.url)
                if (!parsed) {
                  return null
                }

                return (
                  <article key={item.id} className="spotify-picker-item">
                    <iframe
                      src={parsed.embedUrl}
                      title={`${item.title} ${item.subtitle}`}
                      loading="lazy"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    />
                    <div className="spotify-picker-meta">
                      <strong>{item.title}</strong>
                      <p>{item.subtitle}</p>
                    </div>
                    <button type="button" className="primary-btn" onClick={() => chooseSpotifyUrl(item.url)}>
                      Usar no post
                    </button>
                  </article>
                )
              })}

              {filteredSpotifyLibrary.length === 0 && <div className="notice">Nenhum resultado com esse filtro.</div>}
            </div>

            <div className="spotify-manual">
              <label htmlFor="spotify-manual-url">Ou cole um link do Spotify</label>
              <div>
                <input
                  id="spotify-manual-url"
                  type="url"
                  value={spotifyManualUrl}
                  onChange={(event) => setSpotifyManualUrl(event.target.value)}
                  placeholder="https://open.spotify.com/track/..."
                />
                <button type="button" className="secondary-btn" onClick={() => chooseSpotifyUrl(spotifyManualUrl)}>
                  Usar link
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {profileEditorOpen && (
        <div className="modal-overlay" role="presentation" onClick={closeProfileEditor}>
          <section
            className="profile-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Editar perfil"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="profile-editor-head">
              <h2>Editar perfil</h2>
              <button type="button" className="secondary-btn" onClick={closeProfileEditor}>
                Fechar
              </button>
            </header>

            <form className="profile-editor-form" onSubmit={saveOwnProfile}>
              <label>
                Nome
                <input
                  type="text"
                  value={profileDraft.name}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Bio
                <textarea
                  value={profileDraft.bio}
                  maxLength={280}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      bio: event.target.value,
                    }))
                  }
                  placeholder="Fale rapidamente sobre seu estilo musical."
                />
              </label>

              <div className="profile-avatar-editor">
                <div className="avatar avatar-large">
                  {profileAvatarPreview ? (
                    <img src={profileAvatarPreview} alt="Preview do avatar" />
                  ) : currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.name} />
                  ) : (
                    initials(currentUser?.name || 'Usuario')
                  )}
                </div>
                <div className="profile-avatar-actions">
                  <label className="file-pill" htmlFor="profile-avatar-input">
                    Alterar avatar
                  </label>
                  <input
                    id="profile-avatar-input"
                    ref={profileAvatarInputRef}
                    type="file"
                    className="file-native"
                    accept="image/*"
                    onChange={onSelectProfileAvatar}
                  />
                  {(profileAvatarFile || profileAvatarPreview) && (
                    <button type="button" className="secondary-btn" onClick={clearProfileAvatarSelection}>
                      Remover
                    </button>
                  )}
                </div>
              </div>

              <div className="profile-editor-footer">
                <span>{profileDraft.bio.length}/280</span>
                <button type="submit" className="primary-btn" disabled={profileSaving}>
                  {profileSaving ? 'Salvando...' : 'Salvar perfil'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <nav className="mobile-tabbar" aria-label="Navegacao mobile">
        {navItems.map((item) => {
          const meta = navPresentation[item] || { label: item, mobile: item, icon: 'home' }
          const isActive = activeNav === item

          return (
            <button
              type="button"
              key={`mobile-${item}`}
              className={isActive ? 'mobile-tab active' : 'mobile-tab'}
              onClick={() => activateNav(item)}
              title={meta.mobile}
              aria-label={meta.label}
            >
              <span className="mobile-tab-icon">
                <NavIcon name={meta.icon} active={isActive} />
              </span>
              <span className="mobile-tab-label">{meta.mobile}</span>
              {item === 'Direct' && totalDirectUnread > 0 && (
                <span className="mobile-tab-badge" aria-label={`${compact(totalDirectUnread)} mensagens nao lidas`}>
                  {compact(totalDirectUnread)}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default App
