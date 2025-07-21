const { ObjectId } = require('mongodb');

export function safeObjectId(id) {
  if (id instanceof ObjectId) return id;

  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)
    ? new ObjectId(id)
    : null;
}
