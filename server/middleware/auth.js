const jwt = require('jsonwebtoken');
const { db } = require('../db/index');
const { users } = require('../db/schema');
const { eq } = require('drizzle-orm');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

async function ensureUserExists(userId) {
  if (!userId) return false;
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result.length > 0;
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userExists = await ensureUserExists(decoded.userId);
    if (!userExists) {
      return res.status(401).json({ error: 'User not found for token. Please login again.' });
    }
    req.userId = decoded.userId;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

async function verifySocket(socket, next) {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userExists = await ensureUserExists(decoded.userId);
    if (!userExists) {
      return next(new Error('Authentication error: User not found for token'));
    }
    socket.userId = decoded.userId;
    socket.user = decoded;
    next();
  } catch (error) {
    return next(new Error('Authentication error: Invalid or expired token'));
  }
}

function generateToken(userId, username, displayName) {
  return jwt.sign(
    { userId, username, displayName },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = {
  verifyToken,
  verifySocket,
  generateToken
};
