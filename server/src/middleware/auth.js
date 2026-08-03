const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pharmacy_pos_super_secret_key_123';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'pharmacy_pos_refresh_secret_key_456';

const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    // An unreadable token is an ordinary client condition, not a server fault.
    return res.status(401).json({ error: 'Unauthorized, invalid or expired token' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || (!roles.includes(req.user.role) && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};

const controlHubOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'SuperAdmin') {
    return res.status(403).json({ error: 'Forbidden: ControlHub access only' });
  }
  next();
};

module.exports = {
  authenticate,
  requireRole,
  controlHubOnly,
  generateToken,
  generateRefreshToken,
  JWT_SECRET,
  REFRESH_SECRET
};
