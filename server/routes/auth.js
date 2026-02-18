const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/index');
const { users } = require('../db/schema');
const { eq, and, or, ne } = require('drizzle-orm');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

const SALT_ROUNDS = 10;

router.post('/register', async (req, res) => {
  try {
    const { username, displayName, password } = req.body;

    if (!username || !displayName || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    const existingUser = await db.select().from(users).where(eq(users.username, username));

    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const [newUser] = await db.insert(users).values({
      username: username.toLowerCase(),
      displayName,
      password: hashedPassword
    }).returning();

    const token = generateToken(newUser.id, newUser.username, newUser.displayName);

    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await db.select().from(users).where(eq(users.username, username.toLowerCase()));

    if (result.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.username, user.displayName);

    const { password: _, ...userWithoutPassword } = user;

    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await db.select().from(users).where(eq(users.id, req.userId));

    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password: _, ...userWithoutPassword } = result[0];

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { displayName, avatarUrl, password: newPassword } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updateData = { updatedAt: new Date() };

    if (displayName) {
      updateData.displayName = displayName;
    }

    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl || null;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      updateData.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    const [updatedUser] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    const { password: _, ...userWithoutPassword } = updatedUser;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.put('/username', verifyToken, async (req, res) => {
  try {
    const { username } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    const existingUser = await db.select().from(users)
      .where(and(
        eq(users.username, username.toLowerCase()),
        ne(users.id, userId)
      ));

    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const [updatedUser] = await db.update(users)
      .set({ username: username.toLowerCase(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    const { password: _, ...userWithoutPassword } = updatedUser;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'Failed to update username' });
  }
});

router.get('/users', verifyToken, async (req, res) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      updatedAt: users.updatedAt,
    }).from(users);
    
    res.json(allUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/user/:username', verifyToken, async (req, res) => {
  try {
    const { username } = req.params;
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      updatedAt: users.updatedAt,
    }).from(users).where(eq(users.username, username.toLowerCase()));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
