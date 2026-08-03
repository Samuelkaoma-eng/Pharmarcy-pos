const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pharmacy_pos_super_secret_key_123';

const authenticateTenant = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.tenantId = decoded.tenantId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || (!allowedRoles.includes(req.user.role) && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ 
        error: `Access denied. Role '${req.user ? req.user.role : 'Guest'}' is not authorized for this operation.` 
      });
    }
    next();
  };
};

module.exports = {
  authenticateTenant,
  requireRole,
  JWT_SECRET
};
