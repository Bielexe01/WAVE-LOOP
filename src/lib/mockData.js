const now = Date.now()

const minutesAgo = (value) => new Date(now - value * 60 * 1000).toISOString()
const hoursAgo = (value) => new Date(now - value * 60 * 60 * 1000).toISOString()

export const navItems = ['Feed', 'Descobrir', 'Direct', 'Comunidades', 'Eventos', 'Playlists', 'Perfil']

export const moods = ['Alta energia', 'Calmo', 'Nostalgia', 'Treino', 'Noite']

export const trendingTracks = [
  { id: 't1', title: 'Luz de Neon', artist: 'Mila C.', plays: 32400 },
  { id: 't2', title: 'Circuito 09', artist: 'Valik', plays: 28700 },
  { id: 't3', title: 'Subida Lenta', artist: 'Orla', plays: 21300 },
  { id: 't4', title: 'Antes das 6', artist: 'Noah Rios', plays: 19400 },
]

export const events = [
  { id: 'e1', title: 'Open Mic Centro', when: 'SEX 21:00', place: 'Rua Augusta, SP' },
  { id: 'e2', title: 'Vinyl Session', when: 'SAB 17:30', place: 'Pinheiros, SP' },
  { id: 'e3', title: 'Beatmakers Jam', when: 'DOM 15:00', place: 'Bela Vista, SP' },
]

export const suggestedPeople = [
  { id: 's1', name: 'Rafa Melo', handle: 'rafamelo', role: 'Produtor de Lo-fi' },
  { id: 's2', name: 'Nina Prado', handle: 'ninaprado', role: 'Cantora Indie Pop' },
  { id: 's3', name: 'Sergio Vale', handle: 'sergiovale', role: 'Curador de playlists' },
]

export const demoUser = {
  id: 'demo-user',
  name: 'Voce',
  handle: 'voce',
  followers: 1230,
  following: 348,
  mixes: 42,
}

export const demoPosts = [
  {
    id: 'p1',
    user: { id: 'u1', name: 'Luna Costa', handle: 'lunacosta' },
    createdAt: minutesAgo(2),
    mood: 'Alta energia',
    text: 'Acabei de fechar uma sequencia de pop BR para estrada. Quem quer playlist?',
    track: { title: 'Brisa da Cidade', artist: 'Maya e Atlas' },
    media: null,
    likes: 128,
    reposts: 19,
    liked: false,
    reposted: false,
    comments: [
      {
        id: 'c1',
        authorName: 'Rafa Melo',
        authorHandle: 'rafamelo',
        text: 'Essa entra no meu set hoje.',
        createdAt: minutesAgo(1),
      },
      {
        id: 'c2',
        authorName: 'Dani Vox',
        authorHandle: 'danivox',
        text: 'Manda o link da playlist.',
        createdAt: minutesAgo(1),
      },
    ],
  },
  {
    id: 'p2',
    user: { id: 'u2', name: 'Kai Martins', handle: 'kaibeats' },
    createdAt: minutesAgo(17),
    mood: 'Noite',
    text: 'Drop novo de house latino. Gravei um mini teaser no estudio e quero feedback.',
    track: { title: 'Ritmo Noturno', artist: 'Kai Martins' },
    media: null,
    likes: 342,
    reposts: 57,
    liked: true,
    reposted: false,
    comments: [
      {
        id: 'c3',
        authorName: 'Lia Nunes',
        authorHandle: 'lianunes',
        text: 'Kick muito limpo, curti demais.',
        createdAt: minutesAgo(8),
      },
    ],
  },
  {
    id: 'p3',
    user: { id: 'u3', name: 'Helena Rocha', handle: 'helenarocha' },
    createdAt: hoursAgo(1),
    mood: 'Nostalgia',
    text: 'Hoje so escutando classicos de R&B no vinil. Qual faixa antiga voce nunca pula?',
    track: { title: 'Velvet Tape', artist: 'The Downtown Souls' },
    media: null,
    likes: 267,
    reposts: 31,
    liked: false,
    reposted: true,
    comments: [
      {
        id: 'c4',
        authorName: 'Iuri Lemos',
        authorHandle: 'iurilemos',
        text: 'Esse timbre parece filme de domingo.',
        createdAt: minutesAgo(55),
      },
      {
        id: 'c5',
        authorName: 'Mara Luz',
        authorHandle: 'maraluz',
        text: 'Escuta tambem Midnight Avenue.',
        createdAt: minutesAgo(51),
      },
    ],
  },
]
