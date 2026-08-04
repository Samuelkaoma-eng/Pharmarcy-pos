const jwt = require('jsonwebtoken');

// The fallback exists so a fresh checkout runs without configuration. It is
// committed to this repository, which means it is not a secret: anyone who has
// read the source can mint a token for any role, SuperAdmin included.
//
// That is tolerable on a developer's own machine and unacceptable anywhere
// reachable, so production refuses to start rather than signing with a public
// value. Failing loudly at boot is the point — a deployment that quietly used
// the fallback would look completely normal while being trivially forgeable
// (DEF-056).
const DEV_FALLBACK_SECRET = 'pharmacy_pos_super_secret_key_123';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET must be set in production. Refusing to start with the committed development fallback, ' +
      'which is public and would allow anyone reading this repository to forge tokens.'
  );
}

const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACK_SECRET;

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
