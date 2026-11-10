import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Every downstream query MUST filter by req.user.company_id -- this is
    // the tenant-isolation boundary. Never trust a company_id from the body.
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
