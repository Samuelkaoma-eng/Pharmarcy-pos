const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken, generateRefreshToken, JWT_SECRET, REFRESH_SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const payload = { userId: user.user_id, tenantId: user.tenant_id, role: user.role, username: user.username };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: {
          id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          tenantId: user.tenant_id
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during authentication' });
  }
};

exports.controlHubLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await db.query('SELECT * FROM users WHERE username = $1 AND role = $2', [username, 'SuperAdmin']);
    let user = result.rows[0];

    // Fallback check for admin user acting as platform admin
    if (!user) {
      const adminRes = await db.query('SELECT * FROM users WHERE username = $1 AND role = $2', [username, 'Admin']);
      user = adminRes.rows[0];
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid ControlHub credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid ControlHub credentials' });
    }

    const payload = { userId: user.user_id, tenantId: user.tenant_id, role: 'SuperAdmin', username: user.username };
    const token = generateToken(payload);
    
    return res.json({
      success: true,
      message: 'ControlHub login successful',
      data: {
        token,
        user: { id: user.user_id, username: user.username, role: 'SuperAdmin' }
      }
    });
  } catch (error) {
    console.error('ControlHub login error:', error);
    res.status(500).json({ error: 'Server error during ControlHub authentication' });
  }
};

exports.refresh = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Refresh token required' });

    const decoded = jwt.verify(token, REFRESH_SECRET);
    const payload = { userId: decoded.userId, tenantId: decoded.tenantId, role: decoded.role, username: decoded.username };
    
    res.json({
      success: true,
      message: 'Token refreshed',
      data: { token: generateToken(payload) }
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    const result = await db.query('SELECT user_id, tenant_id, username, full_name, role, created_at FROM users WHERE user_id = $1', [userId]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, message: 'Profile retrieved', data: user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
};
