import { db, FieldValue } from '../config/firebase.js';
import { logMovement } from '../utils/logMovement.js';

const COLLECTION = 'tools';

const normalize = (b = {}) => {
  const out = {
    Nombre: String(b.Nombre || '').trim(),
    'Fecha de compra': String(b['Fecha de compra'] || '').trim(),
    'Numero Interno': String(b['Numero Interno'] || '').trim(),
    'Ubicacion / Coordenada': String(b['Ubicacion / Coordenada'] || '').trim(),
    'Designacion Generica': String(b['Designacion Generica'] || '').trim(),
    Descripcion: String(b.Descripcion || '').trim(),
    Marca: String(b.Marca || '').trim(),
    Modelo: String(b.Modelo || '').trim(),
    Proveedor: String(b.Proveedor || '').trim(),
    Estado: String(b.Estado || '').trim(), // Operativo / En reparacion / Danado / Baja
    Observaciones: String(b.Observaciones || '').trim()
  };
  if (!out.Nombre) throw new Error('Nombre requerido');
  if (!out.Estado) throw new Error('Estado requerido');
  return out;
};

export const createTool = async (req, res) => {
  try {
    const value = normalize(req.body);

    let existing = null;
    if (value['Numero Interno']) {
      const q = await db.collection(COLLECTION)
        .where('Nombre', '==', value.Nombre)
        .where('Numero Interno', '==', value['Numero Interno'])
        .limit(1).get();
      if (!q.empty) existing = q.docs[0];
    }

    if (existing) {
      await existing.ref.update({
        ...value,
        _updatedAt: FieldValue.serverTimestamp(),
        _updatedBy: req.user?.username || 'system'
      });
      await logMovement({
        entity: 'tool',
        entityId: existing.id,
        type: 'update',
        by: req.user?.username,
        payload: { merged: true, data: value }
      });
      return res.json({ id: existing.id, merged: true });
    }

    const docRef = await db.collection(COLLECTION).add({
      ...value,
      _createdAt: FieldValue.serverTimestamp(),
      _createdBy: req.user?.username || 'system',
      _updatedAt: FieldValue.serverTimestamp()
    });

    await logMovement({
      entity: 'tool',
      entityId: docRef.id,
      type: 'create',
      by: req.user?.username,
      payload: { data: value }
    });

    res.json({ id: docRef.id, merged: false });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error creando herramienta' });
  }
};

export const listTools = async (req, res) => {
  try {
    const { q } = req.query;
    const snap = await db.collection(COLLECTION).orderBy('_updatedAt', 'desc').get();
    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (q && q.trim()) {
      const needle = q.toLowerCase();
      items = items.filter(it => JSON.stringify(it).toLowerCase().includes(needle));
    }
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error listando herramientas' });
  }
};

export const getTool = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'No encontrada' });
    res.json({ id: snap.id, ...snap.data() });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error obteniendo herramienta' });
  }
};

export const updateTool = async (req, res) => {
  try {
    const id = req.params.id;
    const value = req.body || {};
    await db.collection(COLLECTION).doc(id).update({
      ...value,
      _updatedAt: FieldValue.serverTimestamp(),
      _updatedBy: req.user?.username || 'system'
    });
    await logMovement({
      entity: 'tool',
      entityId: id,
      type: 'update',
      by: req.user?.username,
      payload: { data: value }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error actualizando herramienta' });
  }
};

export const deleteTool = async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection(COLLECTION).doc(id).delete();
    await logMovement({
      entity: 'tool',
      entityId: id,
      type: 'delete',
      by: req.user?.username
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error eliminando herramienta' });
  }
};
