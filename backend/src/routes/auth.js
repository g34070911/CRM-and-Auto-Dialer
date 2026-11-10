import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function signToken(user) {
  return jwt.sign(
    { user_id: user.id, company_id: user.company_id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/signup - Creates new tenant company & first admin user
router.post('/signup', async (req, res, next) => {
  try {
    const { companyName, industry, name, email, password } = req.body;
    if (!companyName || !name || !email || !password) {
      return res.status(400).json({ error: 'Company name, your name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email.trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const companyResult = await client.query(
        'INSERT INTO companies (name, industry) VALUES ($1, $2) RETURNING *',
        [companyName.trim(), industry || null]
      );
      const company = companyResult.rows[0];

      const passwordHash = await bcrypt.hash(password, 10);
      const userResult = await client.query(
        `INSERT INTO users (company_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, 'admin') RETURNING *`,
        [company.id, email.trim().toLowerCase(), passwordHash, name.trim()]
      );
      const user = userResult.rows[0];

      await client.query('COMMIT');

      const token = signToken(user);
      res.status(201).json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        company: { id: company.id, name: company.name, industry: company.industry },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const { rows: companyRows } = await query('SELECT * FROM companies WHERE id = $1', [user.company_id]);
    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: companyRows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me - Verify token & return fresh user/company details
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows: userRows } = await query('SELECT id, company_id, email, name, role, created_at FROM users WHERE id = $1', [req.user.user_id]);
    if (userRows.length === 0) return res.status(401).json({ error: 'User not found' });
    const user = userRows[0];

    const { rows: companyRows } = await query('SELECT id, name, industry, created_at FROM companies WHERE id = $1', [user.company_id]);

    res.json({
      user,
      company: companyRows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/team - List team members for the company (for lead assignment)
router.get('/team', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, email, role FROM users WHERE company_id = $1 ORDER BY name ASC',
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
