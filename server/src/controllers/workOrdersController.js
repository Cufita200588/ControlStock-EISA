import { db, FieldValue } from '../config/firebase.js';
import { hasPermission } from '../utils/permissions.js';
import { logMovement } from '../utils/logMovement.js';

const COLLECTION = 'workOrders';

const normalizeText = (value = '') => value.toString().trim();
const normalizeKey = (value = '') => normalizeText(value).toLowerCase();
const buildCompositeId = (clientKey, rawId) => `${clientKey}::${rawId}`;
const parseCompositeId = (value = '') => {
  if (!value.includes('::')) return null;
  const [clientKey, rawId] = value.split('::');
  if (!clientKey || !rawId) return null;
  return { clientKey, rawId };
};
const randomId = () => db.collection(COLLECTION).doc().id;
const sanitizeStoredTasks = (tasks = []) =>
  (Array.isArray(tasks) ? tasks : [])
    .map((task) => {
      if (!task) return null;
      const label = normalizeText(task.label || task.name || task.task);
      if (!label) return null;
      const id = task.id || buildCompositeId('task', randomId());
      return { id, label };
    })
    .filter(Boolean);
const normalizeTasksInput = (clientKey, tasks = [], fallbackTask = '') => {
  const entries = (Array.isArray(tasks) ? tasks : [])
    .map((task) => {
      if (!task) return null;
      const label = normalizeText(task.label || task.name || task.task);
      if (!label) return null;
      const rawId = task.id && task.id.includes('::') ? task.id.split('::')[1] : task.id;
      const id = task.id && task.id.includes('::') ? task.id : buildCompositeId(clientKey, rawId || randomId());
      return { id, label };
    })
    .filter(Boolean);
  if (!entries.length && fallbackTask) {
    const label = normalizeText(fallbackTask);
    if (label) entries.push({ id: buildCompositeId(clientKey, randomId()), label });
  }
  return entries;
};
const sanitizeItems = (items = [], client) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => item && item.id && item.name)
    .map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code || '',
      client: item.client || client,
      tasks: sanitizeStoredTasks(item.tasks || [])
    }));
const responseItems = (items = [], client) =>
  sanitizeItems(items, client)
    .map((item, index) => {
      if (!item.tasks.length && items[index]?.task) {
        return {
          ...item,
          tasks: sanitizeStoredTasks([{ id: buildCompositeId(normalizeKey(client), randomId()), label: items[index].task }])
        };
      }
      return item;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
const getClientDocRef = (client) => db.collection(COLLECTION).doc(normalizeKey(client));

const normalizeRoleName = (value = '') => value.toString().trim().toLowerCase();
const HOURS_MANAGER_ROLES = new Set([
  'gestor de horas',
  'gestor-horas',
  'gestor_de_horas',
  'gestor horas',
  'gestorhoras'
]);

const hasHoursManagerRole = (roles = []) => {
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => HOURS_MANAGER_ROLES.has(normalizeRoleName(role)));
};

export const canManageWorkOrders = (user = {}) => {
  const perms = user.permissions || {};
  const roles = user.roles || [];
  return (
    roles.includes('admin') ||
    hasHoursManagerRole(roles) ||
    hasPermission(perms, 'timesheets.manage') ||
    hasPermission(perms, 'hours.workorders')
  );
};

export const ensureWorkOrderManager = (req, res, next) => {
  if (!canManageWorkOrders(req.user || {})) {
    return res.status(403).json({ error: 'Permiso denegado' });
  }
  next();
};

export const listWorkOrders = async (req, res) => {
  try {
    const client = normalizeText(req.query?.client);
    if (!client) {
      const snap = await db.collection(COLLECTION).limit(200).get();
      const aggregated = snap.docs.flatMap((doc) => {
        const data = doc.data() || {};
        const clientName = data.client || doc.id;
        return responseItems(data.items, clientName);
      });
      return res.json(aggregated);
    }
    const key = normalizeKey(client);
    if (!key) return res.json([]);
    const ref = getClientDocRef(client);
    const snap = await ref.get();
    if (!snap.exists) return res.json([]);
    const data = snap.data() || {};
    const clientName = data.client || client;
    res.json(responseItems(data.items, clientName));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudieron listar las OT' });
  }
};

export const createWorkOrder = async (req, res) => {
  try {
    if (!canManageWorkOrders(req.user || {})) return res.status(403).json({ error: 'Permiso denegado' });
    const client = normalizeText(req.body?.client);
    const name = normalizeText(req.body?.name);
    const code = normalizeText(req.body?.code);
    const fallbackTask = normalizeText(req.body?.task);
    if (!client || !name || !code) return res.status(400).json({ error: 'Cliente, nombre y codigo requeridos' });
    const key = normalizeKey(client);
    if (!key) return res.status(400).json({ error: 'Cliente invalido' });
    const ref = getClientDocRef(client);
    const snap = await ref.get();
    const data = snap.data() || {};
    const items = sanitizeItems(data.items, client);
    const lowerName = name.toLowerCase();
    const lowerCode = code.toLowerCase();
    if (items.some((item) => normalizeText(item.name).toLowerCase() === lowerName)) {
      return res.status(409).json({ error: 'Ya existe una OT con ese nombre' });
    }
    if (items.some((item) => normalizeText(item.code || '').toLowerCase() === lowerCode)) {
      return res.status(409).json({ error: 'Ya existe una OT con ese codigo' });
    }
    const rawId = randomId();
    const id = buildCompositeId(key, rawId);
    const tasks = normalizeTasksInput(key, req.body?.tasks, fallbackTask);
    const nextItems = items.concat({ id, name, code, client, clientKey: key, tasks });
    await ref.set({
      client,
      clientKey: key,
      items: nextItems,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user?.username || req.user?.uid
    }, { merge: true });
    await logMovement({
      entity: 'workorders',
      entityId: id,
      type: 'create',
      by: req.user?.username || req.user?.uid || 'system',
      payload: {
        client,
        name,
        code,
        taskCount: tasks.length,
        tasks: tasks.map((task) => task.label)
      }
    });
    res.status(201).json({ id, client, name });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo crear la OT' });
  }
};

export const updateWorkOrder = async (req, res) => {
  try {
    if (!canManageWorkOrders(req.user || {})) return res.status(403).json({ error: 'Permiso denegado' });
    const { id } = req.params;
    const name = normalizeText(req.body?.name);
    const code = normalizeText(req.body?.code);
    const fallbackTask = normalizeText(req.body?.task);
    const parsed = parseCompositeId(id);
    if (!parsed || !name || !code) return res.status(400).json({ error: 'Datos incompletos' });
    const ref = db.collection(COLLECTION).doc(parsed.clientKey);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'OT no encontrada' });
    const data = snap.data() || {};
    const currentClient = data.client || parsed.clientKey;
    const items = sanitizeItems(data.items, currentClient);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return res.status(404).json({ error: 'OT no encontrada' });
    const lowerName = name.toLowerCase();
    const lowerCode = code.toLowerCase();
    if (items.some((item, idx) => idx !== index && normalizeText(item.name).toLowerCase() === lowerName)) {
      return res.status(409).json({ error: 'Ya existe una OT con ese nombre' });
    }
    if (items.some((item, idx) => idx !== index && normalizeText(item.code || '').toLowerCase() === lowerCode)) {
      return res.status(409).json({ error: 'Ya existe una OT con ese codigo' });
    }
    const tasks = normalizeTasksInput(parsed.clientKey, req.body?.tasks, fallbackTask);
    const previous = items[index];
    const updatedEntry = { ...previous, name, code, tasks };
    items[index] = updatedEntry;
    await ref.update({
      items,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user?.username || req.user?.uid
    });
    await logMovement({
      entity: 'workorders',
      entityId: id,
      type: 'update',
      by: req.user?.username || req.user?.uid || 'system',
      payload: {
        client: currentClient,
        before: {
          name: previous?.name,
          code: previous?.code,
          tasks: (previous?.tasks || []).map((task) => task.label)
        },
        after: {
          name,
          code,
          tasks: tasks.map((task) => task.label)
        }
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo actualizar la OT' });
  }
};

export const deleteWorkOrder = async (req, res) => {
  try {
    if (!canManageWorkOrders(req.user || {})) return res.status(403).json({ error: 'Permiso denegado' });
    const { id } = req.params;
    const parsed = parseCompositeId(id);
    if (!parsed) return res.status(400).json({ error: 'ID invalido' });
    const ref = db.collection(COLLECTION).doc(parsed.clientKey);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'OT no encontrada' });
    const data = snap.data() || {};
    const currentClient = data.client || parsed.clientKey;
    const items = sanitizeItems(data.items, currentClient);
    const removed = items.find((item) => item.id === id);
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return res.status(404).json({ error: 'OT no encontrada' });
    await ref.update({
      items: next,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user?.username || req.user?.uid
    });
    await logMovement({
      entity: 'workorders',
      entityId: id,
      type: 'delete',
      by: req.user?.username || req.user?.uid || 'system',
      payload: {
        client: currentClient,
        name: removed?.name,
        code: removed?.code,
        tasks: (removed?.tasks || []).map((task) => task.label)
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo eliminar la OT' });
  }
};
