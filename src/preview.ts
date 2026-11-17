import type { Account, Post } from './model'

export const previewAccounts: Account[] = [
  {
    id: 'preview-alex',
    name: 'Alex Morgan',
    username: 'alexmorgan',
    avatar: '/media/alex.webp',
  },
  { id: 'preview-studio', name: 'Studio Notes', username: 'studionotes' },
]

export const people: Account[] = [
  {
    id: 'maya',
    name: 'Maya Chen',
    username: 'mayainframe',
    avatar: '/media/maya.webp',
    verified: true,
  },
  {
    id: 'theo',
    name: 'Theo Park',
    username: 'theopark',
    avatar: '/media/theo.webp',
  },
  {
    id: 'nora',
    name: 'Nora Fields',
    username: 'norafields',
    avatar: '/media/nora.webp',
    verified: true,
  },
  {
    id: 'kai',
    name: 'Kai Morgan',
    username: 'kaibuilds',
    avatar: '/media/kai.webp',
  },
]

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString()

export const samplePosts: Post[] = [
  {
    id: 'sample-bridge',
    author: people[0],
    text: 'Took the long way home through the Marin Headlands. I’ve photographed this bridge a hundred times and the light still finds a way to surprise me.',
    createdAt: hoursAgo(0.4),
    topic: 'San Francisco',
    media: [
      {
        url: '/media/golden-gate.webp',
        alt: 'Golden Gate Bridge seen from the Marin Headlands, above bright blue water with the city in the distance.',
      },
    ],
    metrics: { replies: 18, reposts: 42, likes: 386, views: 12400 },
  },
  {
    id: 'sample-interface',
    author: people[1],
    text: 'The best performance feature we shipped this week was deleting a loading spinner. The data was already on the device.',
    createdAt: hoursAgo(1),
    topic: 'Design engineering',
    metrics: { replies: 12, reposts: 28, likes: 214, views: 8700 },
  },
  {
    id: 'sample-forest',
    author: people[2],
    text: 'Field notes from a quiet morning in the woods. The water was so still that the mountains looked twice as tall.',
    createdAt: hoursAgo(2),
    topic: 'Photography',
    media: [
      {
        url: '/media/coast.webp',
        alt: 'Evergreens reflected in a still mountain lake.',
      },
    ],
    metrics: { replies: 8, reposts: 16, likes: 197, views: 5100 },
  },
  {
    id: 'sample-tools',
    author: people[3],
    text: 'Tiny tools for an audience of one are an underrated design exercise. You get to fix the one thing that bothers you every single day.',
    createdAt: hoursAgo(3),
    topic: 'Design engineering',
    metrics: { replies: 7, reposts: 24, likes: 158, views: 4200 },
  },
  {
    id: 'sample-walk',
    author: people[0],
    text: 'A little San Francisco photo walk tip: follow the fog line. One block makes all the difference.',
    createdAt: hoursAgo(5),
    topic: 'San Francisco',
    metrics: { replies: 4, reposts: 7, likes: 86, views: 2300 },
  },
]

export const topics = [
  {
    name: 'San Francisco',
    category: 'Travel',
    image: '/media/golden-gate.webp',
  },
  { name: 'Design engineering', category: 'Technology' },
  { name: 'Photography', category: 'Arts & culture' },
]
