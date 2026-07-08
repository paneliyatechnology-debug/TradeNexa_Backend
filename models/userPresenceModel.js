/**
 * User presence data access — online/offline status and last seen timestamps.
 *
 * Used by Socket.IO for real-time presence; persisted for offline last_seen display.
 */
const db = require('../database/knex');
const { CHAT_PRESENCE_STATUS } = require('../constants/chat');

// ==========================================
// Write operations
// ==========================================

/**
 * Create or update presence row for a user.
 * @param {number} userId
 * @param {'online'|'offline'} status
 * @param {Object|null} [trx]
 */
const upsertPresence = async (userId, status, trx = null) => {
  const client = trx || db;
  const now = client.fn.now();
  const existing = await client('user_presence').where({ user_id: userId }).first();

  if (existing) {
    await client('user_presence')
      .where({ user_id: userId })
      .update({
        status,
        last_seen_at: status === CHAT_PRESENCE_STATUS.OFFLINE ? now : existing.last_seen_at,
        updated_at: now,
      });
  } else {
    await client('user_presence').insert({
      user_id: userId,
      status,
      last_seen_at: status === CHAT_PRESENCE_STATUS.OFFLINE ? now : null,
      updated_at: now,
    });
  }

  return client('user_presence').where({ user_id: userId }).first();
};

// ==========================================
// Read operations
// ==========================================

/** Batch-fetch presence for multiple user IDs. */
const findByUserIds = async (userIds = []) => {
  if (!userIds.length) return [];
  return db('user_presence').whereIn('user_id', userIds);
};

/** Fetch presence for a single user. */
const findByUserId = (userId) => db('user_presence').where({ user_id: userId }).first();

module.exports = {
  upsertPresence,
  findByUserIds,
  findByUserId,
};
