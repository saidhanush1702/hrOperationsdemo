import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export const verifyToken = async (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(403).json({ message: "No token provided. Access Forbidden." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // For every non-SUPER_ADMIN request, verify the organization is still active.
        // This blocks API access immediately when an org is suspended, even for users
        // who already hold a valid JWT from before the suspension.
        if (decoded.role !== 'SUPER_ADMIN' && decoded.orgId) {
            const [[org]] = await pool.query(
                'SELECT is_active FROM organizations WHERE id = ?',
                [decoded.orgId]
            );
            if (!org || org.is_active === 0) {
                return res.status(403).json({ message: "Your organization account has been suspended. Please contact support." });
            }
        }

        next();
    } catch (err) {
        return res.status(401).json({ message: "Unauthorized/Invalid Token" });
    }
};

export const isSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ message: "Require Super Admin Role!" });
    }
    next();
};
