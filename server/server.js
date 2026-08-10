/**
 * Foody server.
 *
 * - Proxies NVIDIA Nim chat completions so the API key stays server-side.
 * - Provides per-account auth (username + password, httpOnly session cookie).
 * - Serves the built client for production.
 * - Data (including uploaded images) lives in PostgreSQL — no disk state.
 *
 * Endpoints:
 *   POST /api/nim/chat/completions   (proxy to NVIDIA, key kept here)
 *   POST /api/auth/register          (create account + sign in, with security question)
 *   POST /api/auth/login             (sign in)
 *   POST /api/auth/logout            (sign out)
 *   POST /api/auth/forgot            (look up security question by username)
 *   POST /api/auth/reset             (verify answer, set a new password)
 *   GET  /api/auth/me                (current account, 401 if not signed in)
 *   PUT  /api/auth/profile           (update username / password)
 *   POST /api/auth/avatar            (upload a profile picture)
 *   DELETE /api/auth/account         (permanently delete account + all data)
 *   GET  /api/data                   (history + saved + prefs for current user)
 *   POST /api/recipes                (upsert recipe into history)
 *   DELETE /api/recipes              (clear history)
 *   DELETE /api/recipes/:id          (remove one recipe)
 *   PUT  /api/recipes/:id/saved      (toggle bookmark)
 *   POST /api/recipes/:id/image      (upload a photo)
 *   GET  /api/uploads/:id            (serve an uploaded image, signed-in users)
 *   GET  /api/social/users           (search users) + friends/posts/groups CRUD
 *   PUT  /api/prefs                  (save taste preferences)
 *   GET  /api/fridge                 (fridge inventory for current user)
 *   PUT  /api/fridge                 (save the full fridge inventory)
 *   GET  /api/health
 *   static  → ../dist
 */

import { env } from 'node:process'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import {
  createUser, getUserByUsername, getUserById, getUserCredentialsById, createSession, getUserByToken, deleteSession,
  getSecurityQuestionByUsername, getSecurityCredentials, updatePassword, updateAvatar, updateUsername,
  listHistory, listSaved, upsertRecipe, deleteRecipe, clearHistory, setSaved, updateRecipeImage, getPrefs, setPrefs,
  deleteAccount, getFridge, setFridge, getFridgeMode, setFridgeMode, storeUpload, getUpload,
  searchUsers, createFriendRequest, getFriendRequest, listIncomingRequests, deleteFriendRequest, addFriendship,
  removeFriendship, listFriends, isFriend, deleteFriendRequestByPair, createPost, listFeed, listPostsByUser, deletePost, toggleLike, unlike,
  totalLikes, createComment, listCommentsByPost, deleteCommentIfOwner, createGroup, addGroupMember, removeGroupMember, listMyGroups, getGroup, getGroupMembers,
  isGroupMember, createGroupMessage, listGroupMessages, getGroupMessageForCheck, updateGroupMessageText, softDeleteGroupMessage, setLastRead,
  updateGroup, transferOwnership, deleteGroup,
} from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')

const HISTORY_LIMIT = 30
const COOKIE_NAME = 'foody.session'
const IS_PROD = env.NODE_ENV === 'production'

// Account-recovery security questions shared with the client (src/lib/securityQuestions.ts).
const PRESET_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was your mother's maiden name?",
  "What was the make and model of your first car?",
  "What was your childhood nickname?",
  "What is the name of your favourite teacher?",
  "What is your oldest sibling's middle name?",
]
const VALID_QUESTION = new Set(PRESET_QUESTIONS)

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (MIME_EXT[file.mimetype]) cb(null, true)
    else cb(new Error('Only image uploads are supported'))
  },
})

const NIM_BASE = 'https://integrate.api.nvidia.com/v1'
const NIM_KEY = env.NIM_API_KEY ?? env.VITE_NIM_API_KEY
const NIM_MODEL = env.NIM_MODEL ?? env.VITE_NIM_MODEL ?? 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'
const PORT = Number(env.PORT ?? 3001)

// In-memory "who is typing in which group" heartbeats. Fine for a single
// instance; on a multi-replica deploy this would move to a shared store.
const typingGroups = new Map() // groupId -> Map(userId -> lastHeartbeatAt)
const TYPING_TTL = 5000

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))

/** Wrap async route handlers so rejections reach the error middleware. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// ---- Password helpers ----

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password, hash, salt) {
  const candidate = Buffer.from(hashPassword(password, salt), 'hex')
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

// ---- Session helpers ----

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 60 * 60 * 24 * 365, // 1 year (~ any-device convenience)
    path: '/',
  })
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' })
}

/** Attach req.user ({ id, username, avatar }) when a valid session cookie is present. */
async function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (token) {
    const user = await getUserByToken(token)
    if (user) req.user = { id: Number(user.id), username: user.username, avatar: user.avatar }
  }
  next()
}

/** Require an authenticated user; otherwise 401. */
function requireAuth(req, res, next) {
  if (req.user) {
    next()
    return
  }
  res.status(401).json({ error: 'Not signed in' })
}

app.use((req, _res, next) => {
  req.cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map((part) => {
    const [k, ...rest] = part.trim().split('=')
    return [k, decodeURIComponent(rest.join('='))]
  }).filter(([k]) => k))
  next()
})

// Populate req.user from the session cookie for every request.
app.use(ah(loadUser))

/** Forward a chat-completions request to NVIDIA Nim with the key injected. */
app.post('/api/nim/chat/completions', async (req, res) => {
  const { model, temperature, top_p, top_k, max_tokens, messages, response_format, thinking_token_budget, chat_template_kwargs } =
    req.body ?? {}
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: 'messages is required' })
    return
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 200_000)
    const nimRes = await fetch(`${NIM_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NIM_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model ?? NIM_MODEL,
        temperature,
        ...(top_p != null ? { top_p } : {}),
        ...(top_k != null ? { top_k } : {}),
        max_tokens,
        messages,
        ...(response_format ? { response_format } : {}),
        ...(thinking_token_budget != null ? { thinking_token_budget } : {}),
        ...(chat_template_kwargs ? { chat_template_kwargs } : {}),
      }),
    })
    clearTimeout(timer)
    const data = await nimRes.text()
    res
      .status(nimRes.status)
      .set('Content-Type', 'application/json')
      .send(data)
  } catch (err) {
    if (err?.name === 'AbortError') {
      res.status(504).json({ error: 'Upstream timed out after 200s' })
      return
    }
    res.status(502).json({ error: err instanceof Error ? err.message : 'proxy error' })
  }
})

// ---- Auth ----

app.post('/api/auth/register', ah(async (req, res) => {
  const { username, password, security_question: securityQuestion, security_answer: securityAnswer } = req.body ?? {}
  const name = typeof username === 'string' ? username.trim() : ''
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(name)) {
    res.status(400).json({ error: 'Username must be 3-24 characters (letters, numbers, underscores)' })
    return
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return
  }
  if (typeof securityQuestion !== 'string' || !VALID_QUESTION.has(securityQuestion)) {
    res.status(400).json({ error: 'Please pick a security question from the list' })
    return
  }
  if (typeof securityAnswer !== 'string' || !securityAnswer.trim() || securityAnswer.trim().length > 100) {
    res.status(400).json({ error: 'A security answer between 1 and 100 characters is required' })
    return
  }
  const existing = await getUserByUsername(name)
  if (existing) {
    res.status(409).json({ error: 'That username is already taken' })
    return
  }
  const salt = randomBytes(16).toString('hex')
  const answerSalt = randomBytes(16).toString('hex')
  let userId
  try {
    userId = await createUser(
      name,
      hashPassword(password, salt),
      salt,
      securityQuestion,
      hashPassword(securityAnswer.trim().toLowerCase(), answerSalt),
      answerSalt,
    )
  } catch (err) {
    if (err?.code === '23505') { // unique_violation
      res.status(409).json({ error: 'That username is already taken' })
      return
    }
    throw err
  }
  await login(res, userId)
  res.status(201).json({ user: await publicUser(userId) })
}))

app.post('/api/auth/login', ah(async (req, res) => {
  const { username, password } = req.body ?? {}
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password are required' })
    return
  }
  const user = await getUserByUsername(username.trim())
  if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
    res.status(401).json({ error: 'Incorrect username or password' })
    return
  }
  await login(res, Number(user.id))
  res.json({ user: await publicUser(user.id) })
}))

app.post('/api/auth/logout', ah(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME]
  if (token) await deleteSession(token)
  clearSessionCookie(res)
  res.json({ ok: true })
}))

/** Password recovery step 1: fetch the user's security question. */
app.post('/api/auth/forgot', ah(async (req, res) => {
  const { username } = req.body ?? {}
  if (typeof username !== 'string' || !username.trim()) {
    res.status(400).json({ error: 'Username is required' })
    return
  }
  const user = await getSecurityQuestionByUsername(username.trim())
  if (!user || !user.security_question) {
    res.status(400).json({ error: 'No account found with that username' })
    return
  }
  res.json({ question: user.security_question })
}))

/** Password recovery step 2: verify the answer, then set a new password. */
app.post('/api/auth/reset', ah(async (req, res) => {
  const { username, answer, newPassword } = req.body ?? {}
  if (typeof username !== 'string' || !username.trim()) {
    res.status(400).json({ error: 'Username is required' })
    return
  }
  if (typeof answer !== 'string' || !answer.trim()) {
    res.status(400).json({ error: 'Please answer the security question' })
    return
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' })
    return
  }
  const user = await getSecurityQuestionByUsername(username.trim())
  if (!user) {
    res.status(400).json({ error: 'No account found with that username' })
    return
  }
  const creds = await getSecurityCredentials(user.id)
  if (!creds?.security_answer_hash || !verifyPassword(answer.trim().toLowerCase(), creds.security_answer_hash, creds.security_answer_salt)) {
    res.status(401).json({ error: 'That security answer is incorrect' })
    return
  }
  const salt = randomBytes(16).toString('hex')
  await updatePassword(Number(user.id), hashPassword(newPassword, salt), salt)
  res.json({ ok: true })
}))

/** Update account settings: username and/or password (requires the current password to change it). */
app.put('/api/auth/profile', requireAuth, ah(async (req, res) => {
  const { username, currentPassword, newPassword } = req.body ?? {}
  if (typeof username === 'string' && username.trim() !== req.user.username) {
    const name = username.trim()
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(name)) {
      res.status(400).json({ error: 'Username must be 3-24 characters (letters, numbers, underscores)' })
      return
    }
    const taken = await getUserByUsername(name)
    if (taken && Number(taken.id) !== req.user.id) {
      res.status(409).json({ error: 'That username is already taken' })
      return
    }
    await updateUsername(req.user.id, name)
  }
  if (typeof newPassword === 'string' && newPassword) {
    const current = await getUserCredentialsById(req.user.id)
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, current.password_hash, current.salt)) {
      res.status(401).json({ error: 'Current password is incorrect' })
      return
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' })
      return
    }
    const salt = randomBytes(16).toString('hex')
    await updatePassword(req.user.id, hashPassword(newPassword, salt), salt)
  }
  res.json({ user: await publicUser(req.user.id) })
}))

/** Permanently delete the account and all associated data (recipes, prefs, sessions, uploads). */
app.delete('/api/auth/account', requireAuth, ah(async (req, res) => {
  const { currentPassword } = req.body ?? {}
  const user = await getUserById(req.user.id)
  if (typeof currentPassword !== 'string') {
    res.status(400).json({ error: 'Enter your password to confirm' })
    return
  }
  const creds = await getUserByUsername(user.username)
  if (!creds || !verifyPassword(currentPassword, creds.password_hash, creds.salt)) {
    res.status(401).json({ error: 'Password is incorrect' })
    return
  }
  await deleteAccount(req.user.id)
  clearSessionCookie(res)
  res.json({ user: null })
}))

async function login(res, userId) {
  const token = randomBytes(32).toString('hex')
  await createSession(token, userId)
  setSessionCookie(res, token)
}

/** Public-safe account object: bigserial ids come back from pg as strings,
 *  but social endpoints coerce ids to numbers — keep auth identical so the
 *  client's `me.id === comment.user.id` comparisons always match. */
async function publicUser(id) {
  const row = await getUserById(id)
  return row ? { id: Number(row.id), username: row.username, avatar: row.avatar } : null
}

app.get('/api/auth/me', ah(async (req, res) => {
  res.json({ user: req.user ? await publicUser(req.user.id) : null })
}))

// ---- Recipes & preferences (require auth) ----

app.use('/api/data', requireAuth)
app.use('/api/recipes', requireAuth)
app.use('/api/prefs', requireAuth)
app.use('/api/fridge', requireAuth)

app.get('/api/data', ah(async (req, res) => {
  res.json({
    history: await listHistory(req.user.id, HISTORY_LIMIT),
    saved: await listSaved(req.user.id),
    prefs: await getPrefs(req.user.id),
    fridge: await getFridge(req.user.id),
    fridgeMode: await getFridgeMode(req.user.id),
  })
}))

/** Upsert a recipe into history (deduped by id, capped server-side). */
app.post('/api/recipes', ah(async (req, res) => {
  const recipe = req.body
  if (!recipe || typeof recipe.id !== 'string' || !recipe.title) {
    res.status(400).json({ error: 'A recipe with an id and title is required' })
    return
  }
  await upsertRecipe(req.user.id, recipe)
  res.status(201).json({
    ok: true,
    history: await listHistory(req.user.id, HISTORY_LIMIT),
    saved: await listSaved(req.user.id),
  })
}))

/** Remove a single recipe from history (kept if saved). */
app.delete('/api/recipes/:id', ah(async (req, res) => {
  await deleteRecipe(req.user.id, req.params.id)
  res.json({ ok: true })
}))

/** Clear history but keep bookmarked recipes. */
app.delete('/api/recipes', ah(async (req, res) => {
  await clearHistory(req.user.id)
  res.json({ ok: true })
}))

/** Toggle a recipe's bookmarked state. Body: { saved: boolean }. */
app.put('/api/recipes/:id/saved', ah(async (req, res) => {
  const saved = req.body?.saved
  if (typeof saved !== 'boolean') {
    res.status(400).json({ error: 'Body must include a boolean "saved"' })
    return
  }
  await setSaved(req.user.id, req.params.id, saved)
  res.json({ ok: true, saved: await listSaved(req.user.id) })
}))

/** Upload a photo for a recipe. Stored as a blob in Postgres; returns the URL path. */
app.post('/api/recipes/:id/image', upload.single('image'), ah(async (req, res) => {
  const id = req.params.id
  if (!req.file) {
    res.status(400).json({ error: 'No image file was provided' })
    return
  }
  const image = await storeUpload(req.user.id, req.file.mimetype, req.file.buffer)
  await updateRecipeImage(req.user.id, id, image)
  res.json({ ok: true, image })
}))

/** Save taste preferences. */
app.put('/api/prefs', ah(async (req, res) => {
  await setPrefs(req.user.id, req.body ?? {})
  res.json({ ok: true, prefs: await getPrefs(req.user.id) })
}))

/** Save the full fridge inventory and/or the fridge mode flag for the current user. */
app.put('/api/fridge', ah(async (req, res) => {
  const items = req.body?.items
  const useFridge = req.body?.useFridge
  if (Array.isArray(items)) await setFridge(req.user.id, items)
  if (typeof useFridge === 'boolean') await setFridgeMode(req.user.id, useFridge)
  if (!Array.isArray(items) && typeof useFridge !== 'boolean') {
    res.status(400).json({ error: 'Body must include an "items" array or a "useFridge" flag' })
    return
  }
  res.json({ ok: true, fridge: await getFridge(req.user.id), fridgeMode: await getFridgeMode(req.user.id) })
}))

/** Fetch the full fridge inventory and mode for the current user. */
app.get('/api/fridge', ah(async (req, res) => {
  res.json({ fridge: await getFridge(req.user.id), fridgeMode: await getFridgeMode(req.user.id) })
}))

// ---- Social (friends, posts, groups) ----

app.use('/api/social', requireAuth)

/** Search users by username. ?q=term — returns friend status per result. */
app.get('/api/social/users', ah(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (!q) {
    res.json({ users: [] })
    return
  }
  res.json({ users: await searchUsers(req.user.id, q) })
}))

/** Send a friend request to another user. */
app.post('/api/social/friend-requests', ah(async (req, res) => {
  const to = Number(req.body?.toUserId)
  if (!Number.isInteger(to) || to <= 0) {
    res.status(400).json({ error: 'A target user id is required' })
    return
  }
  if (to === req.user.id) {
    res.status(400).json({ error: 'You cannot befriend yourself' })
    return
  }
  const target = await getUserById(to)
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const existing = await isFriend(req.user.id, to)
  if (existing) {
    res.status(409).json({ error: 'You are already friends' })
    return
  }
  const id = await createFriendRequest(req.user.id, to)
  res.status(201).json({ request: { id, status: 'pending' } })
}))

/** Incoming friend requests. */
app.get('/api/social/friend-requests', ah(async (req, res) => {
  res.json({ requests: await listIncomingRequests(req.user.id) })
}))

/** Accept an incoming friend request. */
app.post('/api/social/friend-requests/:id/accept', ah(async (req, res) => {
  const request = await getFriendRequest(req.params.id)
  if (!request || Number(request.addressee_id) !== req.user.id) {
    res.status(404).json({ error: 'Request not found' })
    return
  }
  await addFriendship(request.requester_id, req.user.id)
  await deleteFriendRequest(Number(req.params.id))
  res.json({ ok: true })
}))

/** Decline an incoming friend request. */
app.post('/api/social/friend-requests/:id/decline', ah(async (req, res) => {
  const request = await getFriendRequest(req.params.id)
  if (!request || Number(request.addressee_id) !== req.user.id) {
    res.status(404).json({ error: 'Request not found' })
    return
  }
  await deleteFriendRequest(Number(req.params.id))
  res.json({ ok: true })
}))

/** Cancel an outgoing friend request. */
app.delete('/api/social/friend-requests/:id', ah(async (req, res) => {
  const request = await getFriendRequest(req.params.id)
  if (!request || Number(request.requester_id) !== req.user.id) {
    res.status(404).json({ error: 'Request not found' })
    return
  }
  await deleteFriendRequest(Number(req.params.id))
  res.json({ ok: true })
}))

/** Cancel an outgoing friend request to a specific user. */
app.delete('/api/social/friend-requests/to/:userId', ah(async (req, res) => {
  const to = Number(req.params.userId)
  if (!Number.isInteger(to) || to <= 0) {
    res.status(400).json({ error: 'A user id is required' })
    return
  }
  await deleteFriendRequestByPair(req.user.id, to)
  res.json({ ok: true })
}))

/** Remove a friendship. */
app.delete('/api/social/friends/:userId', ah(async (req, res) => {
  const other = Number(req.params.userId)
  if (!Number.isInteger(other) || other <= 0) {
    res.status(400).json({ error: 'A user id is required' })
    return
  }
  await removeFriendship(req.user.id, other)
  res.json({ ok: true })
}))

/** My accepted friends. */
app.get('/api/social/friends', ah(async (req, res) => {
  res.json({ friends: await listFriends(req.user.id) })
}))

/** Profile summary for a user: post count, friend count, total likes gained, posts. */
app.get('/api/social/profile/:userId', ah(async (req, res) => {
  const target = Number(req.params.userId)
  if (!Number.isInteger(target) || target <= 0) {
    res.status(400).json({ error: 'A user id is required' })
    return
  }
  const user = await getUserById(target)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const [friends, posts, likes] = await Promise.all([
    listFriends(target),
    listPostsByUser(target, req.user.id),
    totalLikes(target),
  ])
  res.json({
    profile: {
      user: { id: Number(user.id), username: user.username, avatar: user.avatar },
      postCount: posts.length,
      friendCount: friends.length,
      likesGained: likes,
      friends: friends.map((f) => ({ id: Number(f.id), username: f.username, avatar: f.avatar })),
      posts,
      self: req.user.id === Number(user.id),
    },
  })
}))

/** Feed: posts from my accepted friends (plus my own), newest first. */
app.get('/api/social/feed', ah(async (req, res) => {
  res.json({ posts: await listFeed(req.user.id) })
}))

/** My own posts, newest first. */
app.get('/api/social/posts/me', ah(async (req, res) => {
  res.json({ posts: await listPostsByUser(req.user.id, req.user.id) })
}))

/** Create a post. Body: { recipeId?, recipe?, title, description, image }. */
app.post('/api/social/posts', ah(async (req, res) => {
  const { recipe, recipeId, title, description, image } = req.body ?? {}
  if (typeof title !== 'string') {
    res.status(400).json({ error: 'A title is required' })
    return
  }
  let recipeJson = ''
  if (recipe && typeof recipe.id === 'string' && recipe.title) {
    recipeJson = JSON.stringify(recipe)
  }
  const id = randomUUID()
  await createPost({
    id,
    user_id: req.user.id,
    recipe_id: recipeId ? String(recipeId) : recipe?.id ?? null,
    recipe_json: recipeJson,
    title: title.slice(0, 120),
    description: typeof description === 'string' ? description.slice(0, 500) : '',
    image: typeof image === 'string' ? image : '',
  })
  const post = (await listPostsByUser(req.user.id, req.user.id, 1))[0]
  res.status(201).json({ post })
}))

/** Upload an image for a post. */
app.post('/api/social/posts/image', upload.single('image'), ah(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file was provided' })
    return
  }
  const image = await storeUpload(req.user.id, req.file.mimetype, req.file.buffer)
  res.json({ ok: true, image })
}))

/** Like a post (idempotent). */
app.post('/api/social/posts/:id/like', ah(async (req, res) => {
  await toggleLike(req.params.id, req.user.id)
  res.json({ ok: true })
}))

/** Unlike a post. */
app.delete('/api/social/posts/:id/like', ah(async (req, res) => {
  await unlike(req.params.id, req.user.id)
  res.json({ ok: true })
}))

/** Delete my own post. */
app.delete('/api/social/posts/:id', ah(async (req, res) => {
  const own = await listPostsByUser(req.user.id, req.user.id, 500)
  const found = own.some((p) => p.id === req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Post not found' })
    return
  }
  await deletePost(req.params.id)
  res.json({ ok: true })
}))

/** Comments on a post, oldest first. */
app.get('/api/social/posts/:id/comments', ah(async (req, res) => {
  res.json({ comments: await listCommentsByPost(req.params.id) })
}))

/** Add a comment to a post. Body: { text }. */
app.post('/api/social/posts/:id/comments', ah(async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 500) : ''
  if (!text) {
    res.status(400).json({ error: 'A comment is required' })
    return
  }
  const id = randomUUID()
  await createComment({ id, post_id: req.params.id, user_id: req.user.id, text })
  const comments = await listCommentsByPost(req.params.id)
  res.status(201).json({ comment: comments[comments.length - 1] })
}))

/** Delete a comment (own comments only, or the post owner). */
app.delete('/api/social/posts/:id/comments/:commentId', ah(async (req, res) => {
  const deleted = await deleteCommentIfOwner(req.params.commentId, req.user.id)
  if (!deleted) {
    res.status(404).json({ error: 'Comment not found' })
    return
  }
  res.json({ ok: true })
}))

/** Create a group. Body: { name, memberIds: number[] }. Members must be my friends. */
app.post('/api/social/groups', ah(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : ''
  if (!name) {
    res.status(400).json({ error: 'A group name is required' })
    return
  }
  const requested = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== req.user.id) : []
  const friends = await listFriends(req.user.id)
  const friendIds = new Set(friends.map((f) => Number(f.id)))
  const id = randomUUID()
  await createGroup({ id, name, owner_id: req.user.id })
  await addGroupMember(id, req.user.id, req.user.id, true)
  for (const memberId of requested) {
    if (friendIds.has(memberId)) await addGroupMember(id, memberId, req.user.id)
  }
  res.status(201).json({ group: (await listMyGroups(req.user.id)).find((g) => g.id === id) ?? { id } })
}))

/** My groups. */
app.get('/api/social/groups', ah(async (req, res) => {
  res.json({ groups: await listMyGroups(req.user.id) })
}))

/** Group detail + member list. */
app.get('/api/social/groups/:id', ah(async (req, res) => {
  const group = await getGroup(req.params.id)
  if (!group) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  res.json({
    group: {
      id: group.id,
      name: group.name,
      ownerId: Number(group.owner_id),
      avatar: group.avatar ?? null,
      isAdmin: membership.admin,
      members: (await getGroupMembers(req.params.id)).map((m) => ({
        user: { id: Number(m.user.id), username: m.user.username, avatar: m.user.avatar },
        isAdmin: m.isAdmin,
      })),
    },
  })
}))

/** Message history for a group the caller belongs to. */
app.get('/api/social/groups/:id/messages', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  res.json({ messages: await listGroupMessages(req.params.id) })
}))

/** Send a text or recipe message. Body: { type: 'text'|'recipe', text?, recipe? }. */
app.post('/api/social/groups/:id/messages', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  const type = req.body?.type === 'recipe' ? 'recipe' : 'text'
  let recipeJson = ''
  let text = ''
  if (type === 'recipe') {
    const recipe = req.body?.recipe
    if (!recipe || typeof recipe?.id !== 'string' || !recipe.title) {
      res.status(400).json({ error: 'A valid recipe is required' })
      return
    }
    recipeJson = JSON.stringify(recipe)
  } else {
    text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1000) : ''
    if (!text && !req.body?.image) {
      res.status(400).json({ error: 'A message is required' })
      return
    }
  }
  let replyTo = null
  if (typeof req.body?.replyTo === 'string' && req.body.replyTo) {
    const target = await getGroupMessageForCheck(req.body.replyTo)
    if (target && String(target.group_id) === String(req.params.id)) replyTo = target.id
  }
  await createGroupMessage({
    id: randomUUID(),
    group_id: req.params.id,
    sender_id: req.user.id,
    type,
    text,
    image: '',
    recipe_json: recipeJson,
    reply_to: replyTo,
  })
  const messages = await listGroupMessages(req.params.id)
  res.status(201).json({ message: messages[messages.length - 1] })
}))

/** Send an image message. */
app.post('/api/social/groups/:id/messages/image', upload.single('image'), ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  if (!req.file) {
    res.status(400).json({ error: 'No image file was provided' })
    return
  }
  const image = await storeUpload(req.user.id, req.file.mimetype, req.file.buffer)
  await createGroupMessage({
    id: randomUUID(),
    group_id: req.params.id,
    sender_id: req.user.id,
    type: 'image',
    text: '',
    image,
    recipe_json: '',
  })
  const messages = await listGroupMessages(req.params.id)
  res.status(201).json({ message: messages[messages.length - 1] })
}))

/** Admin: add a member (must be my friend). Body: { userId }. */
app.post('/api/social/groups/:id/members', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership?.admin) {
    res.status(403).json({ error: 'Only group admins can add members' })
    return
  }
  const userId = Number(req.body?.userId)
  const friend = (await listFriends(req.user.id)).find((f) => Number(f.id) === userId)
  if (!friend) {
    res.status(400).json({ error: 'You can only add friends' })
    return
  }
  await addGroupMember(req.params.id, userId, req.user.id)
  const group = await getGroup(req.params.id)
  res.json({
    group: { id: group.id, name: group.name, ownerId: Number(group.owner_id), avatar: group.avatar ?? null, isAdmin: true, members: (await getGroupMembers(req.params.id)).map((m) => ({ user: { id: Number(m.user.id), username: m.user.username, avatar: m.user.avatar }, isAdmin: m.isAdmin })) },
  })
}))

/** Admin: remove a member. */
app.delete('/api/social/groups/:id/members/:userId', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership?.admin) {
    res.status(403).json({ error: 'Only group admins can remove members' })
    return
  }
  const userId = Number(req.params.userId)
  const group = await getGroup(req.params.id)
  if (Number(group.owner_id) === userId) {
    res.status(400).json({ error: 'The owner cannot be removed' })
    return
  }
  await removeGroupMember(req.params.id, userId)
  res.json({ ok: true })
}))

/** Admin: promote a member to admin. Body: { userId }. */
app.post('/api/social/groups/:id/admins', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership?.admin) {
    res.status(403).json({ error: 'Only group admins can promote members' })
    return
  }
  const userId = Number(req.body?.userId)
  const target = await isGroupMember(req.params.id, userId)
  if (!target) {
    res.status(404).json({ error: 'User is not a member of this group' })
    return
  }
  await addGroupMember(req.params.id, userId, req.user.id, true)
  res.json({ ok: true })
}))

/** Mark a message (and everything before it) as read. */
app.post('/api/social/groups/:id/messages/:messageId/read', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  const message = await getGroupMessageForCheck(req.params.messageId)
  if (!message || String(message.group_id) !== String(req.params.id)) {
    res.status(404).json({ error: 'Message not found' })
    return
  }
  await setLastRead(req.params.id, req.user.id, Number(message.created_at))
  res.json({ ok: true })
}))

/** Edit one of my own text messages (any time). Body: { text }. */
app.patch('/api/social/groups/:id/messages/:messageId', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  const message = await getGroupMessageForCheck(req.params.messageId)
  if (!message || String(message.group_id) !== String(req.params.id)) {
    res.status(404).json({ error: 'Message not found' })
    return
  }
  if (message.sender_id !== req.user.id) {
    res.status(403).json({ error: 'You can only edit your own messages' })
    return
  }
  if (message.type !== 'text') {
    res.status(400).json({ error: 'Only text messages can be edited' })
    return
  }
  if (message.deleted_at) {
    res.status(400).json({ error: 'This message was deleted' })
    return
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text || text.length > 1000) {
    res.status(400).json({ error: 'A message between 1 and 1000 characters is required' })
    return
  }
  await updateGroupMessageText(req.params.messageId, text)
  const messages = await listGroupMessages(req.params.id)
  res.json({ message: messages.find((m) => m.id === req.params.messageId) })
}))

/** Soft-delete a message for everyone (sender or any admin). */
app.delete('/api/social/groups/:id/messages/:messageId', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  const message = await getGroupMessageForCheck(req.params.messageId)
  if (!message || String(message.group_id) !== String(req.params.id)) {
    res.status(404).json({ error: 'Message not found' })
    return
  }
  if (Number(message.sender_id) !== req.user.id && !membership.admin) {
    res.status(403).json({ error: 'Only the sender or a group admin can delete this message' })
    return
  }
  if (!message.deleted_at) await softDeleteGroupMessage(req.params.messageId)
  res.json({ ok: true })
}))

/** Who is typing right now (heartbeat map, ~5s window). */
app.get('/api/social/groups/:id/typing', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  const now = Date.now()
  const entries = typingGroups.get(req.params.id)
  const typing = []
  if (entries) {
    for (const [userId, lastAt] of entries) {
      if (now - lastAt > TYPING_TTL) continue
      const user = await getUserById(userId)
      if (user) typing.push({ id: Number(user.id), username: user.username, avatar: user.avatar })
    }
  }
  res.json({ typing })
}))

/** Publish (or clear) my typing heartbeat. Body: { typing?: boolean }. */
app.post('/api/social/groups/:id/typing', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  if (req.body?.typing === false) {
    typingGroups.get(req.params.id)?.delete(req.user.id)
  } else {
    if (!typingGroups.has(req.params.id)) typingGroups.set(req.params.id, new Map())
    typingGroups.get(req.params.id).set(req.user.id, Date.now())
  }
  res.json({ ok: true })
}))

/** Admin: rename the group and/or set (or clear) its avatar. Body: { name?, avatar? }. */
app.patch('/api/social/groups/:id', ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership?.admin) {
    res.status(403).json({ error: 'Only group admins can edit the group' })
    return
  }
  const fields = {}
  if (typeof req.body?.name === 'string') {
    const name = req.body.name.trim().slice(0, 60)
    if (!name) {
      res.status(400).json({ error: 'A group name is required' })
      return
    }
    fields.name = name
  }
  if (req.body?.avatar === null || typeof req.body?.avatar === 'string') fields.avatar = req.body.avatar
  if (Object.keys(fields).length > 0) await updateGroup(req.params.id, fields)
  const entry = (await listMyGroups(req.user.id)).find((g) => g.id === req.params.id)
  res.json({ group: entry ?? { id: req.params.id } })
}))

/** Admin: upload a group avatar photo. */
app.post('/api/social/groups/:id/avatar', upload.single('image'), ah(async (req, res) => {
  const membership = await isGroupMember(req.params.id, req.user.id)
  if (!membership?.admin) {
    res.status(403).json({ error: 'Only group admins can change the avatar' })
    return
  }
  if (!req.file) {
    res.status(400).json({ error: 'No image file was provided' })
    return
  }
  const avatar = await storeUpload(req.user.id, req.file.mimetype, req.file.buffer)
  await updateGroup(req.params.id, { avatar })
  const entry = (await listMyGroups(req.user.id)).find((g) => g.id === req.params.id)
  res.json({ group: entry ?? { id: req.params.id } })
}))

/** Owner: transfer ownership to another admin. Body: { userId }. */
app.post('/api/social/groups/:id/owner', ah(async (req, res) => {
  const group = await getGroup(req.params.id)
  if (!group) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  if (Number(group.owner_id) !== req.user.id) {
    res.status(403).json({ error: 'Only the owner can transfer ownership' })
    return
  }
  const targetId = Number(req.body?.userId)
  const target = await isGroupMember(req.params.id, targetId)
  if (!target || !target.admin) {
    res.status(400).json({ error: 'The new owner must be a group admin' })
    return
  }
  await transferOwnership(req.params.id, targetId)
  res.json({ ok: true })
}))

/** Owner: permanently delete the group and all of its messages. */
app.delete('/api/social/groups/:id', ah(async (req, res) => {
  const group = await getGroup(req.params.id)
  if (!group) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  if (Number(group.owner_id) !== req.user.id) {
    res.status(403).json({ error: 'Only the owner can delete the group' })
    return
  }
  await deleteGroup(req.params.id)
  res.json({ ok: true })
}))

/** Leave a group. Owners must delete the group or transfer ownership instead. */
app.post('/api/social/groups/:id/leave', ah(async (req, res) => {
  const group = await getGroup(req.params.id)
  if (!group) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  if (Number(group.owner_id) === req.user.id) {
    res.status(400).json({ error: 'As the owner, delete the group or transfer ownership to leave' })
    return
  }
  if (!(await isGroupMember(req.params.id, req.user.id))) {
    res.status(403).json({ error: 'You are not a member of this group' })
    return
  }
  await removeGroupMember(req.params.id, req.user.id)
  res.json({ ok: true })
}))

/** Upload a profile picture for the signed-in account. */
app.post('/api/auth/avatar', requireAuth, upload.single('image'), ah(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file was provided' })
    return
  }
  const avatar = await storeUpload(req.user.id, req.file.mimetype, req.file.buffer)
  await updateAvatar(req.user.id, avatar)
  res.json({ ok: true, avatar })
}))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Uploaded images are viewable by any signed-in account so friends can see
// avatars, post photos and group images. Everything is still behind login.
app.get('/api/uploads/:id', requireAuth, ah(async (req, res) => {
  const uploadRow = await getUpload(req.params.id)
  if (!uploadRow) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.set('Content-Type', uploadRow.mime)
  res.set('Cache-Control', 'private, max-age=31536000, immutable')
  res.send(uploadRow.bytes)
}))

// Return clean JSON for upload errors (e.g. invalid file type / too large).
app.use((err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  if (err instanceof multer.MulterError || err?.message?.includes('Only image uploads')) {
    res.status(400).json({ error: err.message })
    return
  }
  next(err)
})

// Serve the built client (production). In dev, Vite serves the app and proxies /api here.
app.use(express.static(DIST))
app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')))

app.listen(PORT, () => {
  console.log(`Foody server listening on http://localhost:${PORT}`)
})