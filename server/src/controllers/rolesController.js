import { db } from '../config/firebase.js';
import { roleSchema } from '../validators/schemas.js';

export const upsertRole = async (req, res) => {
  const { error, value } = roleSchema.validate(req.body || {});
  if (error) return res.status(400).json({ error: error.message });
  await db.collection('roles').doc(value.name).set(value);
  res.json({ ok: true });
};

export const getRoles = async (_req, res) => {
  const snap = await db.collection('roles').get();
  res.json(snap.docs.map(d => d.data()));
};

export const deleteRole = async (req, res) => {
  const { name } = req.params;
  await db.collection('roles').doc(name).delete();
  res.json({ ok: true });
};
