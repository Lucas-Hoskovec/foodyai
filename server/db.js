/**
 * Foody persistence — PostgreSQL via `pg`.
 *
 * Tables (see ./schema.sql): users, sessions, recipes, preferences, fridge,
 * uploads (avatar + recipe photos stored as blobs, so nothing lives on disk).
 * Uses the pooler-ready DATABASE_URL from the environment.
 */

import pg from 'pg'
import { randomUUID } from 'node:crypto'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to your env (server/.env or the host env panel).')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})

function parseRow(row) {
  try {
    return JSON.parse(row.recipe_json)
  } catch {
    return null
  }
}

// ---- Users & sessions ----

export async function createUser(username, passwordHash, salt, securityQuestion, securityAnswerHash, securityAnswerSalt) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, salt, security_question, security_answer_hash, security_answer_salt, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [username, passwordHash, salt, securityQuestion, securityAnswerHash, securityAnswerSalt, Date.now()],
  )
  return Number(rows[0].id)
}

export async function getUserByUsername(username) {
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, salt, avatar
     FROM users WHERE lower(username) = $1`,
    [String(username).toLowerCase()],
  )
  return rows[0] ?? null
}

export async function getUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, username, avatar FROM users WHERE id = $1`,
    [Number(id)],
  )
  return rows[0] ?? null
}

/** Full user row including credentials — for server-internal verification only, never sent to clients. */
export async function getUserCredentialsById(id) {
  const { rows } = await pool.query(
    `SELECT id, username, avatar, password_hash, salt FROM users WHERE id = $1`,
    [Number(id)],
  )
  return rows[0] ?? null
}

/** Lookup a user for password recovery (no credentials, only the question). */
export async function getSecurityQuestionByUsername(username) {
  const { rows } = await pool.query(
    `SELECT id, security_question FROM users WHERE lower(username) = $1`,
    [String(username).toLowerCase()],
  )
  return rows[0] ?? null
}

export async function getSecurityCredentials(id) {
  const { rows } = await pool.query(
    `SELECT security_answer_hash, security_answer_salt FROM users WHERE id = $1`,
    [Number(id)],
  )
  return rows[0] ?? null
}

export async function updatePassword(userId, passwordHash, salt) {
  await pool.query(`UPDATE users SET password_hash = $2, salt = $3 WHERE id = $1`, [Number(userId), passwordHash, salt])
}

export async function updateAvatar(userId, avatar) {
  await pool.query(`UPDATE users SET avatar = $2 WHERE id = $1`, [Number(userId), avatar ?? null])
}

export async function updateUsername(userId, username) {
  await pool.query(`UPDATE users SET username = $2 WHERE id = $1`, [Number(userId), username])
}

export async function createSession(token, userId) {
  await pool.query(`INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)`, [token, Number(userId), Date.now()])
}

export async function getUserByToken(token) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token],
  )
  return rows[0] ?? null
}

export async function deleteSession(token) {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token])
}

/**
 * Permanently remove an account. Sessions, recipes, preferences, fridge and
 * uploaded images are cascaded away by their ON DELETE CASCADE references.
 */
export async function deleteAccount(userId) {
  await pool.query(`DELETE FROM users WHERE id = $1`, [Number(userId)])
}

// ---- Recipes (always scoped to a user) ----

/** Most-recent recipes (up to `limit`), newest first. */
export async function listHistory(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT recipe_json FROM recipes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [Number(userId), limit],
  )
  return rows.map(parseRow).filter((recipe) => recipe !== null)
}

/** Recipes the user has bookmarked, newest first. */
export async function listSaved(userId) {
  const { rows } = await pool.query(
    `SELECT recipe_json FROM recipes WHERE user_id = $1 AND saved = 1 ORDER BY created_at DESC`,
    [Number(userId)],
  )
  return rows.map(parseRow).filter((recipe) => recipe !== null)
}

/** Insert or refresh a recipe, keeping any prior "saved" flag. */
export async function upsertRecipe(userId, recipe) {
  await pool.query(
    `INSERT INTO recipes (user_id, id, recipe_json, created_at, saved)
     VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (user_id, id) DO UPDATE SET
       recipe_json = EXCLUDED.recipe_json,
       created_at = EXCLUDED.created_at`,
    [Number(userId), String(recipe.id), JSON.stringify(recipe), recipe.createdAt ?? Date.now()],
  )
}

export async function deleteRecipe(userId, id) {
  await pool.query(`DELETE FROM recipes WHERE user_id = $1 AND id = $2`, [Number(userId), String(id)])
}

/** Clear history but keep bookmarked recipes. */
export async function clearHistory(userId) {
  await pool.query(`DELETE FROM recipes WHERE user_id = $1 AND saved = 0`, [Number(userId)])
}

export async function setSaved(userId, id, saved) {
  await pool.query(`UPDATE recipes SET saved = $3 WHERE user_id = $1 AND id = $2`, [Number(userId), String(id), saved ? 1 : 0])
}

/** Update a recipe's image path (uploaded photo URL). */
export async function updateRecipeImage(userId, id, image) {
  const { rows } = await pool.query(`SELECT recipe_json FROM recipes WHERE user_id = $1 AND id = $2`, [Number(userId), String(id)])
  if (!rows[0]) return
  let recipe
  try {
    recipe = JSON.parse(rows[0].recipe_json)
  } catch {
    return
  }
  recipe.image = image
  await pool.query(`UPDATE recipes SET recipe_json = $3 WHERE user_id = $1 AND id = $2`, [Number(userId), String(id), JSON.stringify(recipe)])
}

// ---- Preferences (one row per user) ----

export async function getPrefs(userId) {
  const { rows } = await pool.query(
    `SELECT likes_json, dislikes_json, last_speech FROM preferences WHERE user_id = $1`,
    [Number(userId)],
  )
  const parse = (raw) => {
    try {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr.filter((value) => typeof value === 'string') : []
    } catch {
      return []
    }
  }
  const row = rows[0] ?? {}
  return {
    likes: parse(row.likes_json ?? '[]'),
    dislikes: parse(row.dislikes_json ?? '[]'),
    lastSpeech: typeof row.last_speech === 'string' ? row.last_speech : '',
  }
}

export async function setPrefs(userId, prefs) {
  await pool.query(
    `INSERT INTO preferences (user_id, likes_json, dislikes_json, last_speech)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       likes_json = EXCLUDED.likes_json,
       dislikes_json = EXCLUDED.dislikes_json,
       last_speech = EXCLUDED.last_speech`,
    [Number(userId), JSON.stringify(prefs.likes ?? []), JSON.stringify(prefs.dislikes ?? []), prefs.lastSpeech ?? ''],
  )
}

// ---- Fridge (one row per user) ----

export async function getFridge(userId) {
  const { rows } = await pool.query(`SELECT items_json FROM fridge WHERE user_id = $1`, [Number(userId)])
  try {
    const items = JSON.parse(rows[0]?.items_json ?? '[]')
    if (!Array.isArray(items)) return []
    return items.filter(
      (item) =>
        item &&
        typeof item.name === 'string' &&
        typeof item.amount === 'string' &&
        typeof item.category === 'string',
    )
  } catch {
    return []
  }
}

export async function setFridge(userId, items) {
  const list = Array.isArray(items) ? items : []
  await pool.query(
    `INSERT INTO fridge (user_id, items_json, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       items_json = EXCLUDED.items_json,
       updated_at = EXCLUDED.updated_at`,
    [Number(userId), JSON.stringify(list), Date.now()],
  )
}

export async function getFridgeMode(userId) {
  const { rows } = await pool.query(`SELECT use_fridge FROM fridge WHERE user_id = $1`, [Number(userId)])
  return Boolean(rows[0]?.use_fridge)
}

export async function setFridgeMode(userId, on) {
  await pool.query(
    `INSERT INTO fridge (user_id, items_json, use_fridge, updated_at)
     VALUES ($1, '[]', $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       use_fridge = EXCLUDED.use_fridge,
       updated_at = EXCLUDED.updated_at`,
    [Number(userId), on ? 1 : 0, Date.now()],
  )
}

// ---- Uploads (avatars + recipe photos as blobs) ----

/** Persist an image buffer and return a new internal id/path. */
export async function storeUpload(userId, mime, bytes) {
  const id = randomUUID()
  await pool.query(
    `INSERT INTO uploads (id, user_id, mime, bytes, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, Number(userId), mime, bytes, Date.now()],
  )
  return `/api/uploads/${id}`
}

export async function getUpload(id) {
  const { rows } = await pool.query(`SELECT user_id, mime, bytes FROM uploads WHERE id = $1`, [String(id)])
  return rows[0] ?? null
}