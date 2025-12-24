export const sanitizeText = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\uFFFD\uFFFDn/g, 'on')
    .replace(/\uFFFD\uFFFDa/g, 'na')
    .replace(/\uFFFD\uFFFDm/g, 'um')
    .replace(/\uFFFD\uFFFDi/g, 'ni')
    .replace(/\uFFFD\uFFFD/g, 'n')
    .replace(/\u01F8/g, 'e');
};
