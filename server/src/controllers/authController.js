import jwt from 'jsonwebtoken';
import { db } from '../config/firebase.js';
import { compare, hash } from '../utils/hash.js';
import { userSchema } from '../validators/schemas.js';
import { collectPermissions } from '../utils/permissions.js';

const normalizeUsername = (value = '') => value.toString().trim().toLowerCase();

export const login = async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  const normalized = normalizeUsername(username);
  let snap = await db.collection('users').where('usernameNormalized', '==', normalized).limit(1).get();
  if (snap.empty) {
    // compatibilidad con usuarios antiguos sin campo normalizado
    const candidates = Array.from(new Set([username, normalized].filter(Boolean)));
    for (const value of candidates) {
      const attempt = await db.collection('users').where('username', '==', value).limit(1).get();
      if (!attempt.empty) {
        snap = attempt;
        break;
      }
    }
  }
  if (snap.empty) return res.status(401).json({ error: 'Usuario/clave invalidos' });
  const doc = snap.docs[0];
  const data = doc.data();
  if (!data.usernameNormalized && normalized) {
    await doc.ref.set({ usernameNormalized: normalized }, { merge: true });
  }
  const ok = await compare(password, data.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Usuario/clave invalidos' });

  const roles = data.roles || [];
  const permissions = await collectPermissions(roles);
  const storedUsername = data.username || username;
  const token = jwt.sign(
    {
      uid: doc.id,
      username: storedUsername,
      roles,
      displayName: data.displayName || storedUsername,
      permissions
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({
    token,
    user: {
      username: storedUsername,
      displayName: data.displayName || storedUsername,
      roles,
      permissions
    }
  });
};

export const createUser = async (req, res) => {
  const { error, value } = userSchema.validate(req.body || {});
  if (error) return res.status(400).json({ error: error.message });

  const normalizedUsername = normalizeUsername(value.username);
  const exists = await db.collection('users').where('usernameNormalized', '==', normalizedUsername).limit(1).get();
  if (!exists.empty) return res.status(409).json({ error: 'Username en uso' });

  const passwordHash = await hash(value.password);
  const ref = await db.collection('users').add({
    username: value.username,
    usernameNormalized: normalizedUsername,
    displayName: value.displayName,
    passwordHash,
    roles: value.roles
  });
  res.status(201).json({ id: ref.id });
};

export const updateUser = async (req, res) => {
  const { uid } = req.params;
  const { displayName, roles, password } = req.body || {};
  const update = {};
  if (displayName !== undefined) update.displayName = displayName;
  if (roles !== undefined) update.roles = roles;
  if (password) update.passwordHash = await hash(password);

  await db.collection('users').doc(uid).update(update);
  res.json({ ok: true });
};

export const listUsers = async (_req, res) => {
  const snap = await db.collection('users').get();
  const out = snap.docs.map(d => ({ id: d.id, ...d.data(), passwordHash: undefined }));
  res.json(out);
};

export const listUsersBasic = async (_req, res) => {
  try {
    const snap = await db.collection('users').get();
    const out = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        username: data.username || '',
        displayName: data.displayName || data.username || d.id
      };
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudieron listar usuarios' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Usuario no encontrado' });
    await ref.delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error eliminando usuario' });
  }
};
