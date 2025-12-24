const fromTimestamp = (ts) => {
  if (!ts) return "";
  if (typeof ts.toDate === "function") {
    return ts.toDate();
  }
  const seconds = typeof ts.seconds === "number" ? ts.seconds : ts._seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000);
  }
  return null;
};

const normalizeDate = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return "";
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return "";
  }
  const fromTs = fromTimestamp(value);
  if (fromTs instanceof Date && !Number.isNaN(fromTs.getTime())) {
    return fromTs.toISOString().slice(0, 10);
  }
  return "";
};

export const toDateInputValue = (value) => normalizeDate(value);
