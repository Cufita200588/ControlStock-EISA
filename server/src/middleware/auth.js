import jwt from 'jsonwebtoken';
import { db } from '../config/firebase.js';
import { collectPermissions } from '../utils/permissions.js';

export const authRequired = async (req, res, next) => {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token requerido' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;

    const userSnap = await db.collection('users').doc(payload.uid).get();
    if (!userSnap.exists) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user.roles = userSnap.data().roles || [];
    req.user.permissions = await collectPermissions(req.user.roles);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalido' });
  }
};
