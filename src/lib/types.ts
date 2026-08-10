export type Phase = 'idle' | 'listening' | 'thinking' | 'recipe'

export type Tab = 'home' | 'me' | 'fridge' | 'social' | 'history' | 'saved'

export interface Preferences {
  likes: string[]
  dislikes: string[]
  lastSpeech: string
}

export interface Intent {
  dish: string
  cuisine?: string
  dietary: string[]
  time?: string
  keywords: string[]
  searchTerm: string
  imageKeywords: string[]
}

export interface Ingredient {
  name: string
  measure: string
}

export interface FridgeItem {
  name: string
  amount: string
  category: string
}

export interface Recipe {
  id: string
  title: string
  image: string
  imageCredit?: string
  source: 'nim'
  area?: string
  category?: string
  tags: string[]
  ingredients: Ingredient[]
  steps: string[]
  tips: string[]
  time?: string
  servings?: string
  query: string
  createdAt: number
}

export type FriendStatus = 'none' | 'pending' | 'incoming' | 'friends'

export interface SocialUser {
  id: number
  username: string
  avatar: string | null
}

export interface FriendRequestItem {
  id: number
  user: SocialUser
  createdAt: number
}

export interface Post {
  id: string
  user: SocialUser
  title: string
  description: string
  image: string
  recipe_id: string | null
  recipe: Recipe | null
  likes: number
  liked: boolean
  comments: number
  createdAt: number
}

export interface Comment {
  id: string
  user: SocialUser
  text: string
  createdAt: number
}

export interface UserProfile {
  user: SocialUser
  postCount: number
  friendCount: number
  likesGained: number
  friends: SocialUser[]
  posts: Post[]
  self: boolean
}

export interface Group {
  id: string
  name: string
  ownerId: number
  isAdmin: boolean
  memberCount: number
  memberIds: number[]
  createdAt: number
  members?: GroupMember[]
}

export interface GroupMember {
  user: SocialUser
  isAdmin: boolean
}

export type GroupMessageType = 'text' | 'image' | 'recipe'

export interface GroupMessage {
  id: string
  sender: SocialUser
  type: GroupMessageType
  text: string
  image: string
  recipe: Recipe | null
  createdAt: number
}