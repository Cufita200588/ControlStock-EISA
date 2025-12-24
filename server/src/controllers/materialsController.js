import { db, FieldValue, FieldPath } from '../config/firebase.js';
import { logMovement } from '../utils/logMovement.js';

const COLLECTION = 'materials';
const DEFAULT_PAGE_SIZE = 120;
const MATERIAL_MATCH_FIELDS = [
  { key: 'Descripcion', path: 'Descripcion' },
  { key: 'Rubro', path: 'Rubro' },
  { key: 'Unidad', path: 'Unidad' },
  { key: 'Condicion', path: 'Condicion' },
  { key: 'Obra', path: 'Obra' },
  { key: 'Marca', path: 'Marca' },
  { key: 'Material', path: 'Material' },
  { key: 'Ubicacion Fisica / Coordenadas', path: new FieldPath('Ubicacion Fisica / Coordenadas') },
  { key: 'Proveedor', path: 'Proveedor' },
  { key: 'Comprador', path: 'Comprador' },
  { key: 'Observaciones', path: 'Observaciones' }
];

const normalize = (b = {}) => {
  const out = {
    Descripcion: String(b.Descripcion || '').trim(),
    Cantidad: Number(b.Cantidad || 0),
    Unidad: String(b.Unidad || '').trim(),
    Rubro: String(b.Rubro || '').trim(),
    Marca: String(b.Marca || '').trim(),
    Material: String(b.Material || '').trim(),
    'Ubicacion Fisica / Coordenadas': String(b['Ubicacion Fisica / Coordenadas'] || '').trim(),
    Proveedor: String(b.Proveedor || '').trim(),
    Comprador: String(b.Comprador || '').trim(),
    Observaciones: String(b.Observaciones || '').trim(),
    Condicion: String(b.Condicion || '').trim(),
    Obra: String(b.Obra || '').trim(),
    Fecha: String(b.Fecha || '').trim()
  };
  if (!out.Descripcion) throw new Error('Descripcion requerida');
  if (!out.Rubro) throw new Error('Rubro requerido');
  if (!out.Condicion) throw new Error('Condicion requerida');
  if (Number.isNaN(out.Cantidad)) out.Cantidad = 0;
  return out;
};

const findExistingMaterial = async (value) => {
  let query = db.collection(COLLECTION);
  MATERIAL_MATCH_FIELDS.forEach(({ key, path }) => {
    query = query.where(path, '==', value[key] || '');
  });
  const snap = await query.limit(1).get();
  return snap.empty ? null : snap.docs[0];
};

export const createMaterial = async (req, res) => {
  try {
    const value = normalize(req.body);

    const match = await findExistingMaterial(value);

    if (match) {
      await match.ref.update({
        Cantidad: FieldValue.increment(value.Cantidad),
        _updatedAt: FieldValue.serverTimestamp(),
        _updatedBy: req.user?.username || 'system'
      });
      await logMovement({
        entity: 'material',
        entityId: match.id,
        type: 'stock_in',
        by: req.user?.username,
        payload: { merged: true, delta: value.Cantidad, data: value }
      });
      res.json({ id: match.id, merged: true });
      return;
    }

    const ref = await db.collection(COLLECTION).add({
      ...value,
      _createdAt: FieldValue.serverTimestamp(),
      _createdBy: req.user?.username || 'system',
      _updatedAt: FieldValue.serverTimestamp()
    });

    await logMovement({
      entity: 'material',
      entityId: ref.id,
      type: 'create',
      by: req.user?.username,
      payload: { data: value }
    });

    res.json({ id: ref.id, merged: false });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error creando material' });
  }
};

const serializeMaterial = (doc) => ({ id: doc.id, ...(doc.data() || {}) });

const parseLimit = (value) => {
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(num), 20), 500);
};

const parseCursor = (value) => {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && String(asNumber) === String(value).trim()) {
    const date = new Date(asNumber);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date;
  return null;
};

const toCursorString = (data = {}) => {
  const ts = data._updatedAt || data._createdAt;
  if (!ts) return null;
  if (typeof ts.toDate === 'function') {
    const d = ts.toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts.toISOString();
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

export const listMaterials = async (req, res) => {
  try {
    const { q } = req.query || {};
    const paginated = req.query?.paginated === '1';

    if (q && q.trim()) {
      const snap = await db.collection(COLLECTION).orderBy('_updatedAt', 'desc').get();
      let items = snap.docs.map(serializeMaterial);
      const needle = q.toLowerCase();
      items = items.filter(it => JSON.stringify(it).toLowerCase().includes(needle));
      return res.json(items);
    }

    if (paginated) {
      const limit = parseLimit(req.query?.limit);
      let query = db.collection(COLLECTION).orderBy('_updatedAt', 'desc');
      const cursorDate = parseCursor(req.query?.cursor);
      if (cursorDate) query = query.startAfter(cursorDate);
      const snap = await query.limit(limit + 1).get();
      const docs = snap.docs;
      const hasMore = docs.length > limit;
      const slice = hasMore ? docs.slice(0, limit) : docs;
      const items = slice.map(serializeMaterial);
      const lastDoc = slice[slice.length - 1];
      const nextCursor = hasMore && lastDoc ? toCursorString(lastDoc.data()) : null;
      return res.json({ items, nextCursor });
    }

    const snap = await db.collection(COLLECTION).orderBy('_updatedAt', 'desc').get();
    const items = snap.docs.map(serializeMaterial);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error listando materiales' });
  }
};

export const getMaterial = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'No encontrado' });
    res.json({ id: snap.id, ...snap.data() });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error obteniendo material' });
  }
};

export const updateMaterial = async (req, res) => {
  try {
    const id = req.params.id;
    const value = req.body || {};
    await db.collection(COLLECTION).doc(id).set(
      {
        ...value,
        _updatedAt: FieldValue.serverTimestamp(),
        _updatedBy: req.user?.username || 'system'
      },
      { merge: true }
    );
    await logMovement({
      entity: 'material',
      entityId: id,
      type: 'update',
      by: req.user?.username,
      payload: { data: value }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error actualizando material' });
  }
};

export const deleteMaterial = async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection(COLLECTION).doc(id).delete();
    await logMovement({
      entity: 'material',
      entityId: id,
      type: 'delete',
      by: req.user?.username
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error eliminando material' });
  }
};

export const stockOperation = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      action,
      cantidad,
      motivo = '',
      destino = '',
      entregadoA = '',
      detalle = ''
    } = req.body || {};
    const qty = Number(cantidad);
    if (!['in', 'out', 'transfer'].includes(action)) {
      return res.status(400).json({ error: 'accion invalida' });
    }
    if (!qty || qty <= 0) return res.status(400).json({ error: 'cantidad invalida' });

    const destinoTrim = String(destino || '').trim();
    const entregadoATrim = String(entregadoA || '').trim();
    const motivoTrim = String(motivo || '').trim();
    const detalleTrim = String(detalle || '').trim();

    if (action === 'out' && (!destinoTrim || !entregadoATrim)) {
      return res.status(400).json({ error: 'Destino y responsable requeridos para egreso' });
    }

    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Material no encontrado' });
    const data = snap.data();

    let nuevaCantidad = data.Cantidad;
    if (action === 'in') nuevaCantidad += qty;
    if (action === 'out' || action === 'transfer') {
      if (data.Cantidad - qty < 0) return res.status(400).json({ error: 'No hay stock suficiente' });
      nuevaCantidad -= qty;
    }

    await ref.update({
      Cantidad: nuevaCantidad,
      _updatedAt: FieldValue.serverTimestamp(),
      _updatedBy: req.user?.username || 'system'
    });

    let destinoId = null;
    if (action === 'transfer' && destinoTrim) {
      const match = await findExistingMaterial({ ...data, Obra: destinoTrim });

      if (match) {
        destinoId = match.id;
        await match.ref.update({
          Cantidad: FieldValue.increment(qty),
          _updatedAt: FieldValue.serverTimestamp(),
          _updatedBy: req.user?.username || 'system'
        });
      } else {
        const newDoc = await db.collection(COLLECTION).add({
          ...data,
          Cantidad: qty,
          Obra: destinoTrim,
          _createdAt: FieldValue.serverTimestamp(),
          _createdBy: req.user?.username || 'system',
          _updatedAt: FieldValue.serverTimestamp()
        });
        destinoId = newDoc.id;
      }
    }

    await logMovement({
      entity: 'material',
      entityId: id,
      type: action === 'in' ? 'stock_in' : action === 'out' ? 'stock_out' : 'transfer',
      by: req.user?.username,
      payload: {
        cantidad: qty,
        motivo: motivoTrim,
        destino: destinoTrim,
        destinoId,
        entregadoA: entregadoATrim,
        detalle: detalleTrim,
        material: {
          descripcion: data.Descripcion,
          rubro: data.Rubro,
          unidad: data.Unidad,
          condicion: data.Condicion,
          obra: data.Obra
        }
      }
    });

    res.json({ ok: true, cantidad: nuevaCantidad, destinoId });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error en operacion de stock' });
  }
};
