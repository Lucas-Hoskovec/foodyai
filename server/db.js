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

// ---- Social ---- //

/** Search users by username (excluding the caller); includes friendship status. */
export async function searchUsers(userId, query, limit = 20) {
  const like = `%${String(query).toLowerCase()}%`
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar,
            f.user_b AS friend,
            CASE WHEN fr.id IS NULL THEN NULL ELSE 'pending' END AS pending,
            CASE WHEN fr2.id IS NULL THEN NULL ELSE 'incoming' END AS incoming
     FROM users u
     LEFT JOIN friendships f
       ON (f.user_a = $1 AND f.user_b = u.id) OR (f.user_a = u.id AND f.user_b = $1)
     LEFT JOIN friend_requests fr ON fr.requester_id = $1 AND fr.addressee_id = u.id
     LEFT JOIN friend_requests fr2 ON fr2.addressee_id = $1 AND fr2.requester_id = u.id
     WHERE u.id <> $1 AND lower(u.username) LIKE $2
     ORDER BY u.username
     LIMIT $3`,
    [Number(userId), like, limit],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    username: r.username,
    avatar: r.avatar,
    status: r.friend ? 'friends' : r.incoming ? 'incoming' : r.pending ? 'pending' : 'none',
  }))
}

export async function createFriendRequest(requesterId, addresseeId) {
  const { rows } = await pool.query(
    `INSERT INTO friend_requests (requester_id, addressee_id, created_at) VALUES ($1, $2, $3) RETURNING id`,
    [Number(requesterId), Number(addresseeId), Date.now()],
  )
  return Number(rows[0].id)
}

export async function getFriendRequest(id) {
  const { rows } = await pool.query(
    `SELECT fr.id, fr.requester_id, fr.addressee_id, u.username, u.avatar
     FROM friend_requests fr JOIN users u ON u.id = fr.requester_id
     WHERE fr.id = $1`,
    [Number(id)],
  )
  return rows[0] ?? null
}

export async function listIncomingRequests(userId) {
  const { rows } = await pool.query(
    `SELECT fr.id, fr.requester_id, fr.created_at, u.username, u.avatar
     FROM friend_requests fr JOIN users u ON u.id = fr.requester_id
     WHERE fr.addressee_id = $1 ORDER BY fr.created_at DESC`,
    [Number(userId)],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    user: { id: Number(r.requester_id), username: r.username, avatar: r.avatar },
    createdAt: Number(r.created_at),
  }))
}

export async function deleteFriendRequest(id) {
  await pool.query(`DELETE FROM friend_requests WHERE id = $1`, [Number(id)])
}

export async function deleteFriendRequestByPair(requesterId, addresseeId) {
  await pool.query(`DELETE FROM friend_requests WHERE requester_id = $1 AND addressee_id = $2`, [Number(requesterId), Number(addresseeId)])
}

export async function addFriendship(userA, userB) {
  const a = Number(userA)
  const b = Number(userB)
  await pool.query(
    `INSERT INTO friendships (user_a, user_b, created_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_a, user_b) DO NOTHING`,
    [Math.min(a, b), Math.max(a, b), Date.now()],
  )
}

export async function removeFriendship(userA, userB) {
  await pool.query(
    `DELETE FROM friendships WHERE (user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1)`,
    [Number(userA), Number(userB)],
  )
}

export async function listFriends(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar, uf.created_at
     FROM friendships uf
     JOIN users u ON u.id = CASE WHEN uf.user_a = $1 THEN uf.user_b ELSE uf.user_a END
     WHERE uf.user_a = $1 OR uf.user_b = $1
     ORDER BY uf.created_at DESC`,
    [Number(userId)],
  )
  return rows.map((r) => ({ id: Number(r.id), username: r.username, avatar: r.avatar, createdAt: Number(r.created_at) }))
}

export async function isFriend(userId, otherId) {
  const a = Math.min(Number(userId), Number(otherId))
  const b = Math.max(Number(userId), Number(otherId))
  const { rows } = await pool.query(
    `SELECT 1 FROM friendships WHERE user_a = $1 AND user_b = $2`,
    [a, b],
  )
  return Boolean(rows[0])
}

// ---- Posts & likes ----

export async function createPost(post) {
  await pool.query(
    `INSERT INTO posts (id, user_id, recipe_id, recipe_json, title, description, image, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [post.id, Number(post.user_id), post.recipe_id ?? null, post.recipe_json ?? '', post.title ?? '', post.description ?? '', post.image ?? '', post.created_at ?? Date.now()],
  )
}

function hydratePost(row) {
  let recipe = null
  if (row.recipe_json) {
    try {
      recipe = JSON.parse(row.recipe_json)
    } catch {
      recipe = null
    }
  }
  return {
    id: row.id,
    user: { id: Number(row.user_id), username: row.username, avatar: row.avatar },
    title: row.title,
    description: row.description,
    image: row.image,
    recipe_id: row.recipe_id ?? null,
    recipe,
    likes: Number(row.likes),
    liked: Boolean(row.liked),
    comments: Number(row.comments),
    createdAt: Number(row.created_at),
  }
}

const POST_WITH_LIKES = `
  SELECT p.*, u.username, u.avatar,
         COALESCE(lk.likes, 0)::int AS likes,
         COALESCE(lk.liked, 0)::int AS liked,
         COALESCE(co.comments, 0)::int AS comments
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN (
    SELECT post_id, count(*)::int AS likes, count(*) FILTER (WHERE user_id = $1)::int AS liked
    FROM likes
    GROUP BY post_id
  ) lk ON lk.post_id = p.id
  LEFT JOIN (
    SELECT post_id, count(*)::int AS comments
    FROM comments
    GROUP BY post_id
  ) co ON co.post_id = p.id`

/** Feed: posts by the caller's accepted friends, newest first. */
export async function listFeed(userId, limit = 50) {
  const { rows } = await pool.query(
    `${POST_WITH_LIKES}
     WHERE p.user_id = $2 OR EXISTS (
       SELECT 1 FROM friendships f
       WHERE (f.user_a = $2 AND f.user_b = p.user_id) OR (f.user_a = p.user_id AND f.user_b = $2)
     )
     ORDER BY p.created_at DESC LIMIT $3`,
    [Number(userId), Number(userId), limit],
  )
  return rows.map(hydratePost)
}

export async function listPostsByUser(userId, viewerId, limit = 200) {
  const { rows } = await pool.query(
    `${POST_WITH_LIKES} WHERE p.user_id = $2 ORDER BY p.created_at DESC LIMIT $3`,
    [Number(viewerId), Number(userId), limit],
  )
  return rows.map(hydratePost)
}

export async function deletePost(postId) {
  await pool.query(`DELETE FROM posts WHERE id = $1`, [String(postId)])
}

export async function toggleLike(postId, userId) {
  await pool.query(
    `INSERT INTO likes (post_id, user_id, created_at) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, user_id) DO UPDATE SET created_at = EXCLUDED.created_at`,
    [String(postId), Number(userId), Date.now()],
  )
}

export async function unlike(postId, userId) {
  await pool.query(`DELETE FROM likes WHERE post_id = $1 AND user_id = $2`, [String(postId), Number(userId)])
}

export async function totalLikes(userId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.user_id = $1`,
    [Number(userId)],
  )
  return Number(rows[0]?.total ?? 0)
}

// ---- Comments ----

export async function createComment(comment) {
  await pool.query(
    `INSERT INTO comments (id, post_id, user_id, text, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [String(comment.id), String(comment.post_id), Number(comment.user_id), comment.text, comment.created_at ?? Date.now()],
  )
}

export async function listCommentsByPost(postId, limit = 200) {
  const { rows } = await pool.query(
    `SELECT c.*, u.username, u.avatar
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = $1 ORDER BY c.created_at ASC LIMIT $2`,
    [String(postId), limit],
  )
  return rows.map((r) => ({
    id: r.id,
    user: { id: Number(r.user_id), username: r.username, avatar: r.avatar },
    text: r.text,
    createdAt: Number(r.created_at),
  }))
}

/** Delete a comment if the caller is its author or the post owner. */
export async function deleteCommentIfOwner(commentId, userId) {
  const { rowCount } = await pool.query(
    `DELETE FROM comments c
     USING posts p
     WHERE c.id = $1 AND c.post_id = p.id AND (c.user_id = $2 OR p.user_id = $2)`,
    [String(commentId), Number(userId)],
  )
  return rowCount > 0
}

// ---- Groups & chat ----

export async function createGroup(group) {
  await pool.query(
    `INSERT INTO groups (id, name, owner_id, created_at) VALUES ($1, $2, $3, $4)`,
    [group.id, group.name, Number(group.owner_id), group.createdAt ?? Date.now()],
  )
}

export async function addGroupMember(groupId, userId, addedBy, isAdmin = false, created = Date.now()) {
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, is_admin, added_by, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (group_id, user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin`,
    [String(groupId), Number(userId), isAdmin ? 1 : 0, Number(addedBy), created],
  )
}

export async function removeGroupMember(groupId, userId) {
  await pool.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [String(groupId), Number(userId)])
}

export async function listMyGroups(userId) {
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.owner_id, g.avatar, g.created_at,
            gm.is_admin, gm.last_read_at,
            (SELECT array_agg(u.id::text ORDER BY gm2.created_at) FROM group_members gm2 JOIN users u ON u.id = gm2.user_id WHERE gm2.group_id = g.id) AS member_ids,
            (SELECT count(*)::int FROM group_members gm3 WHERE gm3.group_id = g.id) AS member_count,
            (SELECT count(*)::int FROM group_messages gm4 WHERE gm4.group_id = g.id AND gm4.created_at > COALESCE(gm.last_read_at, 0)) AS unread_count,
            lm.last_type, lm.last_text, lm.last_created_at, lm.last_deleted_at, lm.last_sender_id, lm.last_sender_name
     FROM group_members gm
     JOIN groups g ON g.id = gm.group_id
     LEFT JOIN LATERAL (
       SELECT m.type AS last_type, m.text AS last_text, m.created_at AS last_created_at, m.deleted_at AS last_deleted_at,
              m.sender_id AS last_sender_id, u.username AS last_sender_name
       FROM group_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = g.id
       ORDER BY m.created_at DESC LIMIT 1
     ) lm ON true
     WHERE gm.user_id = $1
     ORDER BY COALESCE(lm.last_created_at, g.created_at) DESC`,
    [Number(userId)],
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ownerId: Number(r.owner_id),
    avatar: r.avatar ?? null,
    isAdmin: Boolean(r.is_admin),
    memberCount: Number(r.member_count),
    memberIds: Array.isArray(r.member_ids) ? r.member_ids.map(Number) : [],
    unreadCount: r.last_created_at == null ? 0 : Number(r.unread_count),
    lastMessage: r.last_created_at == null ? null : {
      type: r.last_type,
      text: r.last_text,
      senderId: Number(r.last_sender_id),
      senderName: r.last_sender_name,
      createdAt: Number(r.last_created_at),
      deletedAt: r.last_deleted_at ? Number(r.last_deleted_at) : null,
    },
    createdAt: Number(r.created_at),
  }))
}

export async function getGroup(groupId) {
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.owner_id, g.avatar, g.created_at FROM groups g WHERE g.id = $1`,
    [String(groupId)],
  )
  return rows[0] ?? null
}

export async function getGroupMembers(groupId) {
  const { rows } = await pool.query(
    `SELECT gm.user_id, gm.is_admin, u.username, u.avatar, gm.added_by
     FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 ORDER BY gm.created_at ASC`,
    [String(groupId)],
  )
  return rows.map((r) => ({
    user: { id: Number(r.user_id), username: r.username, avatar: r.avatar },
    isAdmin: Boolean(r.is_admin),
    addedBy: Number(r.added_by),
  }))
}

export async function isGroupMember(groupId, userId) {
  const { rows } = await pool.query(
    `SELECT is_admin FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [String(groupId), Number(userId)],
  )
  return rows[0] ? { admin: Boolean(rows[0].is_admin) } : null
}

export async function createGroupMessage(msg) {
  await pool.query(
    `INSERT INTO group_messages (id, group_id, sender_id, type, text, image, recipe_json, reply_to, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [msg.id, String(msg.group_id), Number(msg.sender_id), msg.type, msg.text ?? '', msg.image ?? '', msg.recipe_json ?? '', msg.reply_to ?? null, msg.created_at ?? Date.now()],
  )
}

/** Fetch a single message's group + sender, used for ownership checks. */
export async function getGroupMessageForCheck(messageId) {
  const { rows } = await pool.query(
    `SELECT id, group_id, sender_id, type, deleted_at, created_at FROM group_messages WHERE id = $1`,
    [String(messageId)],
  )
  return rows[0] ?? null
}

export async function updateGroupMessageText(messageId, text) {
  await pool.query(
    `UPDATE group_messages SET text = $2, edited_at = $3 WHERE id = $1`,
    [String(messageId), text, Date.now()],
  )
}

export async function softDeleteGroupMessage(messageId) {
  await pool.query(
    `UPDATE group_messages SET deleted_at = $2 WHERE id = $1`,
    [String(messageId), Date.now()],
  )
}

/** Record that `userId` has read up to `at` (ms epoch) inside `groupId`. */
export async function setLastRead(groupId, userId, at) {
  await pool.query(
    `UPDATE group_members SET last_read_at = GREATEST(last_read_at, $3) WHERE group_id = $1 AND user_id = $2`,
    [String(groupId), Number(userId), Math.max(0, Number(at) || 0)],
  )
}

export async function listGroupMessages(groupId, limit = 200) {
  const { rows } = await pool.query(
    `SELECT m.*, u.username, u.avatar,
            r.type AS reply_type, r.text AS reply_text, r.image AS reply_image, r.recipe_json AS reply_recipe_json,
            r.sender_id AS reply_sender_id, r.deleted_at AS reply_deleted_at,
            ru.username AS reply_sender_name, ru.avatar AS reply_sender_avatar
     FROM group_messages m
     JOIN users u ON u.id = m.sender_id
     LEFT JOIN group_messages r ON r.id = m.reply_to
     LEFT JOIN users ru ON ru.id = r.sender_id
     WHERE m.group_id = $1 ORDER BY m.created_at DESC LIMIT $2`,
    [String(groupId), limit],
  )
  const readMap = await getReadMap(groupId)
  return rows.reverse().map((r) => {
    const createdAt = Number(r.created_at)
    let replyTo = null
    if (r.reply_to) {
      replyTo = {
        id: r.reply_to,
        sender: { id: Number(r.reply_sender_id), username: r.reply_sender_name, avatar: r.reply_sender_avatar },
        type: r.reply_type,
        text: r.reply_text ?? '',
        image: r.reply_image ?? '',
        recipe: (() => { try { return JSON.parse(r.reply_recipe_json ?? '') } catch { return null } })(),
        deletedAt: r.reply_deleted_at ? Number(r.reply_deleted_at) : null,
      }
    }
    return {
      id: r.id,
      sender: { id: Number(r.sender_id), username: r.username, avatar: r.avatar },
      type: r.type,
      text: r.text,
      image: r.image,
      recipe: r.recipe_json ? (() => { try { return JSON.parse(r.recipe_json) } catch { return null } })() : null,
      replyTo,
      readBy: readMap.filter((u) => u.lastReadAt >= createdAt).map((u) => u.userId),
      editedAt: r.edited_at ? Number(r.edited_at) : null,
      deletedAt: r.deleted_at ? Number(r.deleted_at) : null,
      createdAt,
    }
  })
}

/** Per-member "last message read" timestamps, used to compute readBy + unread counts. */
export async function getReadMap(groupId) {
  const { rows } = await pool.query(
    `SELECT user_id, last_read_at FROM group_members WHERE group_id = $1`,
    [String(groupId)],
  )
  return rows.map((r) => ({ userId: Number(r.user_id), lastReadAt: Number(r.last_read_at) }))
}

/** Admin-level edits: rename and/or set the avatar (pass avatar: null to clear). */
export async function updateGroup(groupId, fields) {
  const sets = []
  const vals = []
  if (fields.name !== undefined) {
    sets.push(`name = $${sets.length + 1}`)
    vals.push(String(fields.name))
  }
  if (fields.avatar !== undefined) {
    sets.push(`avatar = $${sets.length + 1}`)
    vals.push(fields.avatar == null ? null : String(fields.avatar))
  }
  if (sets.length === 0) return
  vals.push(String(groupId))
  await pool.query(`UPDATE groups SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
}

export async function transferOwnership(groupId, newOwnerId) {
  await pool.query(`UPDATE groups SET owner_id = $2 WHERE id = $1`, [String(groupId), Number(newOwnerId)])
  await pool.query(`UPDATE group_members SET is_admin = 1 WHERE group_id = $1 AND user_id = $2`, [String(groupId), Number(newOwnerId)])
}

export async function deleteGroup(groupId) {
  await pool.query(`DELETE FROM groups WHERE id = $1`, [String(groupId)])
}