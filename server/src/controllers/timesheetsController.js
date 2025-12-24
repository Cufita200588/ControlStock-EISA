import { db } from '../config/firebase.js';
import { logMovement } from '../utils/logMovement.js';
import { hasPermission } from '../utils/permissions.js';
import { timesheetSchema, timesheetUpdateSchema } from '../validators/schemas.js';

const DAY_MINUTES = 24 * 60;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NIGHT_WINDOWS = [
  [21 * 60, 24 * 60],
  [24 * 60, 30 * 60]
];

const sanitizeText = (value = '') => value.toString().trim();
const lower = (value = '') => sanitizeText(value).toLowerCase();

const parseTimeToMinutes = (time) => {
  if (!time || typeof time !== 'string' || !time.includes(':')) return null;
  const [hoursStr, minutesStr] = time.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
};

const computeDuration = (startMinutes, endMinutes) => {
  let diff = endMinutes - startMinutes;
  if (diff <= 0) diff += DAY_MINUTES;
  return diff;
};

const computeNightMinutes = (startMinutes, endMinutes) => {
  const adjustedEnd = endMinutes <= startMinutes ? endMinutes + DAY_MINUTES : endMinutes;
  const ranges = NIGHT_WINDOWS.concat(NIGHT_WINDOWS.map(([s, e]) => [s + DAY_MINUTES, e + DAY_MINUTES]));
  let minutes = 0;
  ranges.forEach(([rangeStart, rangeEnd]) => {
    const overlapStart = Math.max(startMinutes, rangeStart);
    const overlapEnd = Math.min(adjustedEnd, rangeEnd);
    if (overlapEnd > overlapStart) minutes += overlapEnd - overlapStart;
  });
  return Math.min(minutes, adjustedEnd - startMinutes);
};

const buildSearchText = (entry) => {
  const values = [
    entry.date,
    entry.client,
    entry.task,
    entry.workOrder,
    entry.userDisplayName,
    entry.username
  ];
  return lower(values.join(' '));
};

const resolveOwner = async (userId, fallback) => {
  const targetId = userId || fallback.uid;
  if (!targetId) throw new Error('Usuario no encontrado');
  if (targetId === fallback.uid && fallback.username) {
    return {
      userId: fallback.uid,
      username: fallback.username,
      displayName: fallback.displayName || fallback.username || 'Usuario'
    };
  }
  const snap = await db.collection('users').doc(targetId).get();
  if (!snap.exists) throw new Error('Usuario no encontrado');
  const data = snap.data() || {};
  return {
    userId: targetId,
    username: data.username || targetId,
    displayName: data.displayName || data.username || 'Usuario'
  };
};

const composeEntry = ({ previous = {}, input, owner, actor }) => {
  const base = {
    date: input.date ?? previous.date,
    startTime: input.startTime ?? previous.startTime,
    endTime: input.endTime ?? previous.endTime,
    client: input.client ?? previous.client ?? '',
    task: input.task ?? previous.task ?? '',
    workOrder: input.workOrder ?? previous.workOrder ?? '',
    isHoliday: input.isHoliday ?? Boolean(previous.isHoliday)
  };

  const startMinutes = parseTimeToMinutes(base.startTime);
  const endMinutes = parseTimeToMinutes(base.endTime);
  if (startMinutes === null || endMinutes === null) {
    throw new Error('Horarios invalidos');
  }
  const durationMinutes = computeDuration(startMinutes, endMinutes);
  if (durationMinutes <= 0) throw new Error('La duracion debe ser mayor a 0');
  const nightMinutes = computeNightMinutes(startMinutes, endMinutes);
  const holidayMinutes = base.isHoliday ? durationMinutes : 0;

  const client = sanitizeText(base.client);
  const task = sanitizeText(base.task);
  const workOrder = sanitizeText(base.workOrder);

  const entry = {
    userId: owner.userId,
    userDisplayName: owner.displayName,
    username: owner.username,
    date: base.date,
    startTime: base.startTime,
    endTime: base.endTime,
    startMinutes,
    durationMinutes,
    nightMinutes,
    holidayMinutes,
    isHoliday: Boolean(base.isHoliday),
    client,
    task,
    workOrder,
    updatedAt: new Date(),
    updatedBy: actor.uid,
    updatedByName: actor.displayName || actor.username || 'Sistema'
  };
  entry.searchText = buildSearchText(entry);
  return entry;
};

const serializeDoc = (doc) => ({ id: doc.id, ...(doc.data() || {}) });

const stripInternalFields = (entry) => {
  const { searchText, startMinutes, ...rest } = entry;
  return rest;
};

const timestampToDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch {
      // ignored
    }
  }
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (typeof seconds === 'number') {
      return new Date(seconds * 1000 + Math.round(nanos / 1e6));
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const buildMovementPayload = (entry = {}, overrides = {}) => ({
  timesheetId: overrides.timesheetId || entry.id,
  userId: entry.userId,
  userDisplayName: entry.userDisplayName || entry.username,
  username: entry.username,
  date: entry.date,
  startTime: entry.startTime,
  endTime: entry.endTime,
  client: entry.client,
  task: entry.task,
  workOrder: entry.workOrder,
  durationMinutes: entry.durationMinutes,
  nightMinutes: entry.nightMinutes,
  isHoliday: Boolean(entry.isHoliday),
  ...overrides
});

const parseBoolean = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'si'].includes(String(value).toLowerCase());
};

const fetchEntries = async ({ userId, date, from, to, limit = 500, order = 'desc' }) => {
  const direction = order === 'asc' ? 'asc' : 'desc';
  let query = db.collection('timesheets').orderBy('date', direction);

  if (userId) query = query.where('userId', '==', userId);
  if (date) {
    query = query.where('date', '==', date);
  } else {
    if (from) query = query.where('date', '>=', from);
    if (to) query = query.where('date', '<=', to);
  }

  const snap = await query.limit(Math.min(Number(limit) || 500, 1000)).get();
  const docs = snap.docs.map(serializeDoc);
  return docs.sort((a, b) => {
    const compareDate = direction === 'asc'
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date);
    if (compareDate !== 0) return compareDate;
    const startA = a.startMinutes ?? parseTimeToMinutes(a.startTime) ?? 0;
    const startB = b.startMinutes ?? parseTimeToMinutes(b.startTime) ?? 0;
    return direction === 'asc' ? startA - startB : startB - startA;
  });
};

const applyFilters = (entries, filters = {}) => {
  const {
    client,
    task,
    workOrder,
    user,
    q,
    isHoliday,
    nightOnly
  } = filters;

  let result = [...entries];
  if (client) {
    const needle = lower(client);
    result = result.filter((item) => lower(item.client).includes(needle));
  }
  if (task) {
    const needle = lower(task);
    result = result.filter((item) => lower(item.task).includes(needle));
  }
  if (workOrder) {
    const needle = lower(workOrder);
    result = result.filter((item) => lower(item.workOrder).includes(needle));
  }
  if (user) {
    const needle = lower(user);
    result = result.filter(
      (item) =>
        lower(item.userDisplayName).includes(needle) ||
        lower(item.username).includes(needle)
    );
  }
  if (typeof isHoliday === 'boolean') {
    result = result.filter((item) => Boolean(item.isHoliday) === isHoliday);
  }
  if (parseBoolean(nightOnly)) {
    result = result.filter((item) => (item.nightMinutes || 0) > 0);
  }
  if (q) {
    const needle = lower(q);
    result = result.filter((item) =>
      lower(item.searchText || '').includes(needle)
    );
  }
  return result;
};

export const createTimesheetEntry = async (req, res) => {
  try {
    const { error, value } = timesheetSchema.validate(req.body || {}, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.message });

    const canManage = hasPermission(req.user?.permissions || {}, 'timesheets.manage');
    const owner = await resolveOwner(canManage ? value.userId : req.user.uid, req.user);
    const data = composeEntry({
      input: value,
      owner,
      actor: req.user
    });

    const docRef = await db.collection('timesheets').add({
      ...data,
      createdAt: new Date(),
      createdBy: req.user.uid,
      createdByName: req.user.displayName || req.user.username || 'Sistema'
    });
    const snap = await docRef.get();
    const created = serializeDoc(snap);
    await logMovement({
      entity: 'timesheets',
      entityId: created.id,
      type: 'create',
      by: req.user?.username,
      payload: buildMovementPayload(created)
    });
    res.status(201).json(stripInternalFields(created));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar la hora' });
  }
};

export const updateTimesheetEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const ref = db.collection('timesheets').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Registro no encontrado' });
    const existing = snap.data();

    const canManage = hasPermission(req.user?.permissions || {}, 'timesheets.manage');
    if (!canManage) {
      if (existing.userId !== req.user.uid) {
        return res.status(403).json({ error: 'No podes editar este registro' });
      }
      const createdAt =
        timestampToDate(existing.createdAt) ||
        (existing.date ? new Date(`${existing.date}T00:00:00Z`) : null);
      if (!createdAt || (Date.now() - createdAt.getTime()) > DAY_IN_MS) {
        return res.status(403).json({ error: 'Solo podes editar durante las primeras 24 horas' });
      }
    }

    const { error, value } = timesheetUpdateSchema.validate(req.body || {}, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.message });

    const owner = await resolveOwner(canManage ? value.userId || existing.userId : existing.userId, req.user);
    const data = composeEntry({
      previous: existing,
      input: value,
      owner,
      actor: req.user
    });

    await ref.update({
      ...data,
      createdAt: existing.createdAt || new Date(),
      createdBy: existing.createdBy || owner.userId,
      createdByName: existing.createdByName || owner.displayName
    });
    const updated = await ref.get();
    const updatedEntry = serializeDoc(updated);
    await logMovement({
      entity: 'timesheets',
      entityId: id,
      type: 'update',
      by: req.user?.username,
      payload: buildMovementPayload(updatedEntry)
    });
    res.json(stripInternalFields(updatedEntry));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo actualizar la hora' });
  }
};

export const deleteTimesheetEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const ref = db.collection('timesheets').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Registro no encontrado' });
    const existing = serializeDoc(snap);

    const canManage = hasPermission(req.user?.permissions || {}, 'timesheets.manage');
    if (!canManage && existing.userId !== req.user.uid) {
      return res.status(403).json({ error: 'No podes eliminar este registro' });
    }

    await ref.delete();
    await logMovement({
      entity: 'timesheets',
      entityId: id,
      type: 'delete',
      by: req.user?.username,
      payload: buildMovementPayload(existing)
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo eliminar la hora' });
  }
};

export const listTimesheets = async (req, res) => {
  try {
    const { userId, date, from, to, limit } = req.query || {};
    const entries = await fetchEntries({
      userId,
      date,
      from,
      to,
      limit
    });
    const filtered = applyFilters(entries, {
      client: req.query?.client,
      task: req.query?.task,
      workOrder: req.query?.workOrder,
      user: req.query?.user,
      q: req.query?.q,
      isHoliday: parseBoolean(req.query?.isHoliday),
      nightOnly: req.query?.nightOnly
    });
    res.json(filtered.map(stripInternalFields));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudieron listar las horas' });
  }
};

export const listMyTimesheets = async (req, res) => {
  try {
    const { date, from, to } = req.query || {};
    const entries = await fetchEntries({
      userId: req.user.uid,
      date,
      from,
      to,
      limit: 200,
      order: 'asc'
    });
    res.json(entries.map(stripInternalFields));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudieron listar tus horas' });
  }
};

export const summarizeTimesheets = async (req, res) => {
  try {
    const { from, to, userId } = req.query || {};
    const entries = await fetchEntries({
      userId,
      from,
      to,
      limit: Math.min(Number(req.query?.limit) || 1000, 2000),
      order: 'asc'
    });
    const filtered = applyFilters(entries, {
      client: req.query?.client,
      task: req.query?.task,
      workOrder: req.query?.workOrder,
      user: req.query?.user,
      q: req.query?.q,
      isHoliday: parseBoolean(req.query?.isHoliday),
      nightOnly: req.query?.nightOnly
    });
    const summary = Object.values(
      filtered.reduce((acc, entry) => {
        const key = entry.userId;
        if (!acc[key]) {
          acc[key] = {
            userId: entry.userId,
            displayName: entry.userDisplayName || entry.username,
            username: entry.username,
            normalMinutes: 0,
            holidayMinutes: 0,
            nightMinutes: 0
          };
        }
        acc[key].holidayMinutes += entry.holidayMinutes || 0;
        acc[key].nightMinutes += entry.nightMinutes || 0;
        if (!entry.isHoliday) {
          const normal = Math.max((entry.durationMinutes || 0) - (entry.nightMinutes || 0), 0);
          acc[key].normalMinutes += normal;
        }
        return acc;
      }, {})
    ).sort((a, b) => a.displayName.localeCompare(b.displayName));
    res.json(summary);
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo generar el resumen' });
  }
};
