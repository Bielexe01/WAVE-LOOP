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
  createOrGetDirectThread,
  createPost,
  ensureProfile,
  fetchDirectThreads,
  fetchFollowStats,
  fetchFeed,
  fetchPeopleToFollow,
  fetchPublicProfileByHandle,
  getSession,
  markDirectThreadRead,
  listenAuthStateChange,
  sendDirectMessage as sendDirectMessageToThread,
  signIn,
  signOut,
  signUp,
  toggleFollowUser,
  toggleLike,
  toggleRepost,
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

function isAllowedFile(file) {
  return file.type.startsWith('image/') || file.type.startsWith('audio/')
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
    sampleTrack: { title: 'Luz de Neon', artist: 'Mila C.' },
  },
  {
    id: 'mix-2',
    title: 'Lo-fi Focus',
    curator: 'Rafa Melo',
    tracks: 32,
    sampleTrack: { title: 'Quiet Circuit', artist: 'Rafa Melo' },
  },
  {
    id: 'mix-3',
    title: 'Synth City',
    curator: 'Luna Costa',
    tracks: 18,
    sampleTrack: { title: 'Brisa da Cidade', artist: 'Maya e Atlas' },
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

const mobileNavLabels = {
  Feed: 'Feed',
  Descobrir: 'Descobrir',
  Direct: 'Direct',
  Comunidades: 'Grupos',
  Eventos: 'Eventos',
  Playlists: 'Mixes',
  Perfil: 'Perfil',
}

function App() {
  const [activeNav, setActiveNav] = useState('Feed')
  const [posts, setPosts] = useState(isSupabaseConfigured ? [] : demoPosts)
  const [profile, setProfile] = useState(isSupabaseConfigured ? null : demoUser)
  const [session, setSession] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(isSupabaseConfigured)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    isSupabaseConfigured
      ? ''
      : 'Modo demo ativo. Configure Supabase para autenticar usuarios e salvar dados no banco.',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [authMode, setAuthMode] = useState('signin')
  const [authBusy, setAuthBusy] = useState(false)
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
  const [joinedCommunities, setJoinedCommunities] = useState(
    () => Object.fromEntries(communityCards.map((community) => [community.id, false])),
  )
  const [savedPlaylists, setSavedPlaylists] = useState(
    () => Object.fromEntries(playlistCards.map((playlist) => [playlist.id, false])),
  )
  const [savedEvents, setSavedEvents] = useState(() => Object.fromEntries(events.map((event) => [event.id, false])))
  const [directThreads, setDirectThreads] = useState(isSupabaseConfigured ? [] : buildInitialDirectThreads)
  const [activeDirectThreadId, setActiveDirectThreadId] = useState(isSupabaseConfigured ? '' : 'dm-luna')
  const [loadingDirect, setLoadingDirect] = useState(false)
  const [sendingDirect, setSendingDirect] = useState(false)
  const [directDraft, setDirectDraft] = useState('')

  const [composer, setComposer] = useState({
    text: '',
    track: '',
    artist: '',
    mood: moods[0],
  })
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState('')
  const [commentDrafts, setCommentDrafts] = useState({})
  const [busyActions, setBusyActions] = useState({})
  const [playingPostId, setPlayingPostId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [likeBurstId, setLikeBurstId] = useState('')

  const fileInputRef = useRef(null)
  const profileAvatarInputRef = useRef(null)
  const likeBurstTimeoutRef = useRef(null)
  const directReplyTimeoutRef = useRef(null)
  const commentInputRefs = useRef({})
  const composerRef = useRef(null)

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

  const storyPeople = useMemo(() => {
    const seeds = []

    if (currentUser) {
      seeds.push({
        id: currentUser.id,
        name: currentUser.name,
        handle: currentUser.handle,
        avatarUrl: currentUser.avatarUrl || null,
        own: true,
      })
    }

    for (const person of peopleToFollow) {
      seeds.push({
        id: person.id,
        name: person.name,
        handle: person.handle,
        avatarUrl: person.avatarUrl || null,
        own: false,
      })
    }

    for (const post of posts) {
      seeds.push({
        id: post.user.id,
        name: post.user.name,
        handle: post.user.handle,
        avatarUrl: post.user.avatarUrl || null,
        own: false,
      })
    }

    const unique = []
    const seen = new Set()

    for (const item of seeds) {
      const key = normalizeHandle(item.handle || item.name).toLowerCase()
      if (!key || seen.has(key)) {
        continue
      }

      seen.add(key)
      unique.push({
        ...item,
        handle: normalizeHandle(item.handle || item.name),
      })

      if (unique.length >= 10) {
        break
      }
    }

    return unique
  }, [currentUser, peopleToFollow, posts])

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

  const loadDirectInbox = useCallback(async (userId, preferredThreadId = '') => {
    if (!isSupabaseConfigured || !userId) {
      return
    }

    setLoadingDirect(true)

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
      setLoadingDirect(false)
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
        setDirectThreads([])
        setActiveDirectThreadId('')
        setPeopleToFollow(buildLocalPeople())
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
  }, [loadDirectInbox, loadFeed, loadFollowStats, loadPeopleToFollow])

  useEffect(() => {
    if (activeDirectThread) {
      return
    }

    if (directThreads.length > 0) {
      setActiveDirectThreadId(directThreads[0].id)
    }
  }, [activeDirectThread, directThreads])

  useEffect(() => {
    return () => {
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview)
      }

      if (profileAvatarPreview) {
        URL.revokeObjectURL(profileAvatarPreview)
      }

      if (likeBurstTimeoutRef.current) {
        clearTimeout(likeBurstTimeoutRef.current)
      }

      if (directReplyTimeoutRef.current) {
        clearTimeout(directReplyTimeoutRef.current)
      }
    }
  }, [mediaPreview, profileAvatarPreview])

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
          await loadDirectInbox(currentUser.id, threadId)
        } catch (error) {
          setErrorMessage(toMessage(error, 'Nao foi possivel abrir este direct agora.'))
        }
      }
    },
    [activateNav, currentUser, loadDirectInbox],
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
        await loadDirectInbox(currentUser.id, activeDirectThread.id)
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
        await loadDirectInbox(currentUser.id, threadId)
        activateNav('Direct')
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
  }

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
        setStatusMessage('Login realizado com sucesso.')
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

    if ((trackTitle && !trackArtist) || (!trackTitle && trackArtist)) {
      setErrorMessage('Preencha nome da faixa e artista juntos.')
      return
    }

    if (!text && !trackTitle && !trackArtist && !mediaFile) {
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
          mediaFile,
        })

        setPosts((current) => [created, ...current])
      } else {
        let localMedia = null

        if (mediaFile) {
          const base64 = await readFileAsDataUrl(mediaFile)
          localMedia = {
            url: base64,
            type: mediaFile.type.startsWith('audio/') ? 'audio' : 'image',
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
          media: localMedia,
          likes: 0,
          reposts: 0,
          liked: false,
          reposted: false,
          comments: [],
        }

        setPosts((current) => [post, ...current])
      }

      setComposer({ text: '', track: '', artist: '', mood: moods[0] })
      clearComposerMedia()
      setStatusMessage('Post publicado com sucesso.')
    } catch (error) {
      setErrorMessage(toMessage(error, 'Nao foi possivel publicar o post.'))
    } finally {
      setPublishing(false)
    }
  }

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

  const toggleCommunityJoin = (communityId) => {
    setJoinedCommunities((current) => ({ ...current, [communityId]: !current[communityId] }))
  }

  const togglePlaylistSave = (playlistId) => {
    setSavedPlaylists((current) => ({ ...current, [playlistId]: !current[playlistId] }))
  }

  const toggleEventSave = (eventId) => {
    setSavedEvents((current) => ({ ...current, [eventId]: !current[eventId] }))
  }

  const goToComposer = () => {
    activateNav('Feed')
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    setStatusMessage(`Faixa pronta no composer: ${track.title} - ${track.artist}`)
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

  if (isSupabaseConfigured && loadingAuth) {
    return (
      <div className="scene-root">
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
      <div className="scene-root">
        <AmbientBackdrop />
        <div className="auth-shell">
          <div className="auth-card">
            <p className="hero-tag">WaveLoop • Supabase</p>
            <h1>Entre para publicar faixas e conversar com a comunidade.</h1>
            <p>Use email e senha para acessar sua conta.</p>

            <div className="auth-mode-switch">
              <button
                type="button"
                className={authMode === 'signin' ? 'secondary-btn followed' : 'secondary-btn'}
                onClick={() => setAuthMode('signin')}
              >
                Entrar
              </button>
              <button
                type="button"
                className={authMode === 'signup' ? 'secondary-btn followed' : 'secondary-btn'}
                onClick={() => setAuthMode('signup')}
              >
                Criar conta
              </button>
            </div>

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
              <button type="submit" className="primary-btn" disabled={authBusy}>
                {authBusy ? 'Enviando...' : authMode === 'signin' ? 'Entrar' : 'Criar conta'}
              </button>
            </form>

            {statusMessage && <div className="notice success">{statusMessage}</div>}
            {errorMessage && <div className="notice error">{errorMessage}</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="scene-root">
      <AmbientBackdrop />

      <div className="app-shell">
        <aside className="panel left-panel appear-up">
          <div className="brand">WaveLoop</div>

          {!isSupabaseConfigured && <div className="notice warn">Modo demo sem backend ativo.</div>}

          <nav className="side-nav" aria-label="Navegacao principal">
            {navItems.map((item) => (
              <button
                type="button"
                key={item}
                className={activeNav === item ? 'nav-item active' : 'nav-item'}
                onClick={() => activateNav(item)}
              >
                <span>{item}</span>
                {item === 'Direct' && totalDirectUnread > 0 && <span className="nav-badge">{compact(totalDirectUnread)}</span>}
              </button>
            ))}
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
          {activeNav !== 'Direct' && (
          <section className="top-strip appear-up" onMouseMove={handleInteractiveMove} onMouseLeave={clearInteractiveMove}>
            <div className="search-shell">
              <label htmlFor="global-search">Buscar no feed</label>
              <input
                id="global-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Artistas, moods, faixas e textos..."
              />
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
            <section className="stories-strip appear-up delay-1" aria-label="Stories">
              <ul>
                {storyPeople.map((person) => (
                  <li key={`story-${person.id}`}>
                    <button
                      type="button"
                      className="story-item"
                      onClick={() => openPublicProfile(person.handle)}
                    >
                      <div className={person.own ? 'story-ring own' : 'story-ring'}>
                        <div className="avatar">
                          {person.avatarUrl ? <img src={person.avatarUrl} alt={person.name} /> : initials(person.name)}
                        </div>
                      </div>
                      <span>{person.own ? 'Seu story' : person.name.split(' ')[0]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activeNav === 'Comunidades' && !publicProfile && (
            <section className="mode-board appear-up">
              <header className="mode-board-head">
                <h2>Comunidades em alta</h2>
                <p>Entre em grupos para trocar feedback e collabs.</p>
              </header>
              <div className="mode-board-grid">
                {communityCards.map((community) => {
                  const joined = joinedCommunities[community.id]
                  return (
                    <article key={community.id} className="mode-card">
                      <h3>{community.name}</h3>
                      <p>{community.description}</p>
                      <span>{compact(community.members)} membros</span>
                      <button
                        type="button"
                        className={joined ? 'secondary-btn followed' : 'secondary-btn'}
                        onClick={() => toggleCommunityJoin(community.id)}
                      >
                        {joined ? 'Participando' : 'Participar'}
                      </button>
                    </article>
                  )
                })}
              </div>
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
              <div className="mode-board-grid">
                {playlistCards.map((playlist) => {
                  const saved = savedPlaylists[playlist.id]
                  return (
                    <article key={playlist.id} className="mode-card">
                      <h3>{playlist.title}</h3>
                      <p>{playlist.curator}</p>
                      <span>{playlist.tracks} faixas</span>
                      <div className="mode-card-actions">
                        <button
                          type="button"
                          className={saved ? 'secondary-btn followed' : 'secondary-btn'}
                          onClick={() => togglePlaylistSave(playlist.id)}
                        >
                          {saved ? 'Salva' : 'Salvar'}
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => applyTrendingTrack(playlist.sampleTrack)}>
                          Usar faixa
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {activeNav === 'Perfil' && !publicProfile && (
            <section className="mode-board profile-hub appear-up">
              <header className="mode-board-head">
                <h2>Seu perfil</h2>
                <p>Gerencie seu perfil publico, mensagens e conteudo.</p>
              </header>
              <div className="profile-hub-grid">
                <article>
                  <strong>{currentUser?.name || 'Usuario'}</strong>
                  <p>@{normalizeHandle(currentUser?.handle || 'usuario')}</p>
                  <span>{currentUser?.bio || 'Atualize sua bio para destacar seu estilo.'}</span>
                </article>
                <article>
                  <strong>{compact(profileStats.followers)}</strong>
                  <p>Seguidores</p>
                  <span>{compact(profileStats.following)} seguindo</span>
                </article>
                <article>
                  <strong>{compact(totalDirectUnread)}</strong>
                  <p>Mensagens nao lidas</p>
                  <span>Direct ativo para collabs</span>
                </article>
              </div>
              <div className="profile-hub-actions">
                <button type="button" className="secondary-btn" onClick={openProfileEditor}>
                  Editar perfil
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
                  Ver perfil publico
                </button>
                <button type="button" className="secondary-btn" onClick={() => activateNav('Direct')}>
                  Abrir direct
                </button>
              </div>
            </section>
          )}

          {activeNav === 'Direct' && !publicProfile && (
            <section className="direct-board appear-up" aria-label="Direct">
              <aside className="direct-threads">
                <header className="direct-board-head">
                  <h2>Direct</h2>
                  <span>{compact(totalDirectUnread)} nao lidas</span>
                </header>
                {loadingDirect && <div className="notice">Carregando conversas...</div>}
                {!loadingDirect && (
                  <ul>
                    {directThreads.map((thread) => {
                      const active = thread.id === activeDirectThread?.id
                      return (
                        <li key={thread.id}>
                          <button
                            type="button"
                            className={active ? 'direct-thread-item active' : 'direct-thread-item'}
                            onClick={() => openDirectThread(thread.id)}
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

              <div className="direct-chat">
                {loadingDirect ? (
                  <div className="notice">Sincronizando mensagens...</div>
                ) : activeDirectThread ? (
                  <>
                    <header className="direct-chat-head">
                      <div>
                        <strong>{activeDirectThread.participant.name}</strong>
                        <p>
                          @{normalizeHandle(activeDirectThread.participant.handle)}{' '}
                          {activeDirectThread.participant.online ? '• online' : '• offline'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="secondary-btn"
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

          {!publicProfile && activeNav === 'Feed' && (
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

            <div className="media-input-row">
              <label className="file-pill" htmlFor="composer-file">
                <span>{mediaFile ? 'Trocar imagem/audio' : 'Adicionar imagem/audio'}</span>
              </label>
              <input
                id="composer-file"
                ref={fileInputRef}
                type="file"
                className="file-native"
                accept="image/*,audio/*"
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
                {mediaFile.type.startsWith('audio/') ? (
                  <audio controls src={mediaPreview} preload="metadata" />
                ) : (
                  <img src={mediaPreview} alt="Previa de imagem" />
                )}
              </div>
            )}
            </section>
          )}

          {activeNav !== 'Direct' && (
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
        {navItems.map((item) => (
          <button
            type="button"
            key={`mobile-${item}`}
            className={activeNav === item ? 'mobile-tab active' : 'mobile-tab'}
            onClick={() => activateNav(item)}
            title={item}
          >
            {mobileNavLabels[item] || item}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
