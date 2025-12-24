import { db, FieldValue } from '../config/firebase.js';
import { hasPermission } from '../utils/permissions.js';

const COLLECTION = 'hourClients';
const DEFAULT_CLIENTS = [
  'Conci',
  'Centro Motor',
  'Sew',
  'Gamisol',
  'Melchior',
  'Las Piedras',
  'Echaniz'
];

const normalizeName = (name = '') => String(name || '').trim();

const buildClientList = (docs = []) => {
  const names = new Map();
  DEFAULT_CLIENTS.forEach((client) => names.set(client, { disabled: false }));
  docs.forEach((doc) => {
    const data = doc.data() || {};
    const value = normalizeName(data.name);
    if (!value) return;
    const disabled = Boolean(data.disabled);
    names.set(value, { disabled });
  });
  return Array.from(names.entries())
    .filter(([, info]) => !info.disabled)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
};

export const canManageHourClients = (user = {}) => {
  const roles = user.roles || [];
  const perms = user.permissions || {};
  return roles.includes('admin') || hasPermission(perms, 'hours.clients');
};

export const ensureHourClientManager = (req, res, next) => {
  if (!canManageHourClients(req.user || {})) {
    return res.status(403).json({ error: 'Permiso denegado' });
  }
  next();
};

export const listHourClients = async (_req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy('name', 'asc').get();
    const names = buildClientList(snap.docs);
    res.json(names);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error listando clientes' });
  }
};

export const addHourClient = async (req, res) => {
  try {
    const clean = normalizeName(req.body?.name);
    if (!clean) return res.status(400).json({ error: 'Nombre requerido' });

    const existing = await db.collection(COLLECTION).where('name', '==', clean).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      const data = doc.data() || {};
      if (data.disabled) {
        await doc.ref.update({
          disabled: false,
          _reactivatedAt: FieldValue.serverTimestamp()
        });
        return res.json({ name: clean });
      }
      return res.status(409).json({ error: 'El cliente ya existe' });
    }

    await db.collection(COLLECTION).add({
      name: clean,
      disabled: false,
      _createdAt: FieldValue.serverTimestamp()
    });
    res.status(201).json({ name: clean });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error agregando cliente' });
  }
};

export const deleteHourClient = async (req, res) => {
  try {
    const raw = req.params?.name ?? req.body?.name ?? '';
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    const clean = normalizeName(decoded);
    if (!clean) return res.status(400).json({ error: 'Nombre requerido' });

    const snap = await db.collection(COLLECTION).where('name', '==', clean).get();
    const timestamp = FieldValue.serverTimestamp();

    if (snap.empty) {
      await db.collection(COLLECTION).add({
        name: clean,
        disabled: true,
        _deletedAt: timestamp
      });
      return res.json({ name: clean, disabled: true });
    }

    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        disabled: true,
        _deletedAt: timestamp
      });
    });
    await batch.commit();
    res.json({ name: clean, disabled: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error eliminando cliente' });
  }
};
