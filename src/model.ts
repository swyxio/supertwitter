export interface Account {
  id: string
  name: string
  username: string
  avatar?: string
  verified?: boolean
}

export interface Post {
  id: string
  text: string
  createdAt: string
  author: Account
  metrics: { replies: number; reposts: number; likes: number; views?: number }
  media?: { url: string; alt?: string; type?: string }[]
  liked?: boolean
  repostedBy?: string
  reposted?: boolean
  bookmarked?: boolean
  replyTo?: string
  quote?: Pick<Post, 'author' | 'text'>
  topic?: string
}

export type Action = 'like' | 'repost' | 'bookmark'
export const actionField = {
  like: 'liked',
  repost: 'reposted',
  bookmark: 'bookmarked',
} as const
export const zeroMetrics = () => ({ replies: 0, reposts: 0, likes: 0 })
export const localAccount = (a: Account) => a.id.startsWith('preview-')
export type Feed = { posts: Post[]; nextToken?: string }
export function updateAction(
  post: Post,
  action: Action,
  active: boolean
): Post {
  const field = actionField[action]
  const metrics = { ...post.metrics }
  if (action !== 'bookmark' && Boolean(post[field]) !== active) {
    const counter = action === 'like' ? 'likes' : 'reposts'
    metrics[counter] = Math.max(0, metrics[counter] + (active ? 1 : -1))
  }
  return { ...post, metrics, [field]: active }
}
