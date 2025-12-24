import { db } from '../config/firebase.js';

const isTimesheetEntity = (value = '') => {
  const normalized = String(value || '').toLowerCase();
  return ['timesheets', 'timesheet', 'hours'].includes(normalized);
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const mapTimesheetToMovement = (doc) => {
  const data = doc.data() || {};
  const payload = {
    timesheetId: doc.id,
    userId: data.userId,
    userDisplayName: data.userDisplayName || data.username,
    username: data.username,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    client: data.client,
    task: data.task,
    workOrder: data.workOrder,
    durationMinutes: data.durationMinutes,
    nightMinutes: data.nightMinutes,
    isHoliday: Boolean(data.isHoliday)
  };
  const createdMillis = toMillis(data.createdAt || data.date);
  const updatedMillis = toMillis(data.updatedAt || data.createdAt || data.date);
  const type = updatedMillis && createdMillis && updatedMillis !== createdMillis ? 'update' : 'create';
  const by = data.updatedByName || data.createdByName || data.username || 'Sistema';
  const at = data.updatedAt || data.createdAt || data.date || null;
  return {
    id: `ts-fallback-${doc.id}`,
    entity: 'timesheets',
    entityId: doc.id,
    type,
    by,
    at,
    payload,
    metadata: { source: 'timesheet-fallback' }
  };
};

const loadTimesheetFallback = async () => {
  const snap = await db.collection('timesheets').orderBy('date', 'desc').limit(200).get();
  return snap.docs.map(mapTimesheetToMovement);
};

const applyFilters = (items, { entity, by, q }) => {
  let filtered = [...items];
  if (entity) filtered = filtered.filter((i) => String(i.entity) === entity);
  if (by) {
    const needle = by.toLowerCase();
    filtered = filtered.filter((i) => (i.by || '').toLowerCase() === needle);
  }
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((i) => JSON.stringify(i).toLowerCase().includes(needle));
  }
  return filtered;
};

export const listMovements = async (req, res) => {
  // Filtros opcionales: ?entity=material|tool|timesheets&by=username&q=texto
  const { entity, by, q } = req.query || {};
  let snap = await db.collection('movements').orderBy('at', 'desc').limit(500).get();
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const wantsTimesheetHistory = !entity || isTimesheetEntity(entity);
  const hasTimesheetMovements = items.some((item) => isTimesheetEntity(item.entity));
  if (wantsTimesheetHistory && !hasTimesheetMovements) {
    const fallback = await loadTimesheetFallback();
    items = items.concat(fallback);
  }

  const filtered = applyFilters(items, { entity, by, q });
  res.json(filtered.map(enrichSummary));
};

export const deleteMovement = async (req, res) => {
  try {
    const roles = req.user?.roles || [];
    if (!roles.includes('admin')) {
      return res.status(403).json({ error: 'Solo administradores pueden eliminar movimientos' });
    }
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'ID requerido' });
    const ref = db.collection('movements').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Movimiento no encontrado' });
    await ref.delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudo eliminar el movimiento' });
  }
};

const enrichSummary = (item = {}) => {
  const { entity, type, payload = {} } = item;
  let description = '';

  if (entity === 'material') {
    description = summarizeMaterial(type, payload);
  } else if (entity === 'tool') {
    description = summarizeTool(type, payload);
  } else if (entity === 'timesheets') {
    description = summarizeTimesheet(type, payload);
  } else if (entity === 'workorders') {
    description = summarizeWorkOrder(type, payload);
  }

  if (!description) {
    description = summarizeGeneric(type, payload);
  }

  return { ...item, summary: description };
};

const summarizeMaterial = (type, payload) => {
  if (type === 'create') {
    return `Alta de material: ${payload?.data?.Descripcion || 'nuevo registro'}`;
  }
  if (type === 'update') {
    const fields = Object.keys(payload?.data || {});
    return fields.length
      ? `Actualizacion de material (${fields.join(', ')})`
      : 'Actualizacion de material';
  }
  if (type === 'delete') return 'Baja de material';
  if (type === 'stock_in') {
    return `Ingreso de stock (+${payload?.delta ?? payload?.cantidad ?? ''})`;
  }
  if (type === 'stock_out') {
    return `Salida de stock (-${payload?.delta ?? payload?.cantidad ?? ''})`;
  }
  if (type === 'transfer') {
    return `Transferencia de stock (${payload?.cantidad ?? ''}) hacia ${payload?.destino || 'destino desconocido'}`;
  }
  return '';
};

const summarizeTool = (type, payload) => {
  if (type === 'create') {
    return `Alta de herramienta: ${payload?.data?.Nombre || 'nuevo registro'}`;
  }
  if (type === 'update') {
    const fields = Object.keys(payload?.data || {});
    return fields.length
      ? `Actualizacion de herramienta (${fields.join(', ')})`
      : 'Actualizacion de herramienta';
  }
  if (type === 'delete') return 'Baja de herramienta';
  return '';
};

const summarizeTimesheet = (type, payload) => {
  const user = payload?.userDisplayName || payload?.username || 'Usuario';
  const date = payload?.date ? ` (${payload.date})` : '';
  if (type === 'create') {
    return `Carga de horas de ${user}${date}`;
  }
  if (type === 'update') {
    return `Actualizacion de horas de ${user}${date}`;
  }
  if (type === 'delete') {
    return `Eliminacion de horas de ${user}${date}`;
  }
  return '';
};

const summarizeWorkOrder = (type, payload) => {
  const client = payload?.client ? `${payload.client} - ` : '';
  const before = payload?.before || {};
  const after = payload?.after || {};
  const name = payload?.name || after?.name || before?.name || 'OT';
  if (type === 'create') {
    return `Alta de OT ${client}${name}`;
  }
  if (type === 'update') {
    return `Actualizacion de OT ${client}${name}`;
  }
  if (type === 'delete') {
    return `Eliminacion de OT ${client}${name}`;
  }
  return '';
};

const summarizeGeneric = (type, payload) => {
  const details = Object.keys(payload || {});
  if (!type && !details.length) return '';
  if (!details.length) return type;
  return `${type}: ${details.join(', ')}`;
};
