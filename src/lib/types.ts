export type Phase = 'idle' | 'listening' | 'thinking' | 'recipe'

export type Tab = 'home' | 'me' | 'history' | 'saved'

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
}

export interface Ingredient {
  name: string
  measure: string
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