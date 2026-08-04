const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pharmacy_pos_super_secret_key_123';

// Short-lived on purpose. An access token cannot be revoked once issued, so the
// window in which a stolen one is useful is kept to an hour; the session is
// carried instead by the rotating refresh chain in `services/refreshTokens.js`,
// which *can* be revoked.
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
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
  JWT_SECRET
};
