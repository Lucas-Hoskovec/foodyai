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
 *   GET  /api/uploads/:id            (serve an uploaded image, owner only)
 *   PUT  /api/prefs                  (save taste preferences)
 *   GET  /api/fridge                 (fridge inventory for current user)
 *   PUT  /api/fridge                 (save the full fridge inventory)
 *   GET  /api/health
 *   static  → ../dist
 */

import { env } from 'node:process'
import { fileURLToPath } from 'node:url'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import {
  createUser, getUserByUsername, getUserById, createSession, getUserByToken, deleteSession,
  getSecurityQuestionByUsername, getSecurityCredentials, updatePassword, updateAvatar, updateUsername,
  listHistory, listSaved, upsertRecipe, deleteRecipe, clearHistory, setSaved, updateRecipeImage, getPrefs, setPrefs,
  deleteAccount, getFridge, setFridge, getFridgeMode, setFridgeMode, storeUpload, getUpload,
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
const NIM_MODEL = env.NIM_MODEL ?? env.VITE_NIM_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b'
const PORT = Number(env.PORT ?? 3001)

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
  const { model, temperature, max_tokens, messages, response_format } = req.body ?? {}
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: 'messages is required' })
    return
  }
  try {
    const nimRes = await fetch(`${NIM_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NIM_KEY}`,
      },
      body: JSON.stringify({
        model: model ?? NIM_MODEL,
        temperature,
        max_tokens,
        messages,
        ...(response_format ? { response_format } : {}),
      }),
    })
    const data = await nimRes.text()
    res
      .status(nimRes.status)
      .set('Content-Type', 'application/json')
      .send(data)
  } catch (err) {
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
  res.status(201).json({ user: await getUserById(userId) })
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
  res.json({ user: await getUserById(user.id) })
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
app.put('/api/auth/profile', ah(async (req, res) => {
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
    const current = await getUserById(req.user.id)
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
  res.json({ user: await getUserById(req.user.id) })
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

app.get('/api/auth/me', ah(async (req, res) => {
  res.json({ user: req.user ? await getUserById(req.user.id) : null })
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

// Uploaded images are private: only the owning account may view them.
app.get('/api/uploads/:id', requireAuth, ah(async (req, res) => {
  const uploadRow = await getUpload(req.params.id)
  if (!uploadRow || Number(uploadRow.user_id) !== req.user.id) {
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