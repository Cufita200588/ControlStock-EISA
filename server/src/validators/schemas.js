import Joi from 'joi';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const userSchema = Joi.object({
  username: Joi.string().min(3).max(40).required(),
  displayName: Joi.string().min(1).max(80).required(),
  password: Joi.string().min(4).max(128).required(),
  roles: Joi.array().items(Joi.string()).default([]),
  avatarUrl: Joi.string().allow('', null)
});

export const roleSchema = Joi.object({
  name: Joi.string().min(2).max(40).required(),
  permissions: Joi.object().required()
});

export const materialSchema = Joi.object({
  Descripcion: Joi.string().required(),
  Cantidad: Joi.number().required(),
  Unidad: Joi.string().required(),
  Rubro: Joi.string().valid(
    'Albanileria','Instalacion sanitaria','Instalacion electrica','Instalacion de gas',
    'Fijaciones','Pinturas','Herrajes','Impermeabilizacion','Aislaciones',
    'Placas y paneles','Revestimientos','Perfiles metalicos','Consumibles','Otros'
  ).required(),
  Material: Joi.string().allow(''),
  'Ubicacion Fisica / Coordenadas': Joi.string().allow(''),
  Proveedor: Joi.string().allow(''),
  Comprador: Joi.string().allow(''),
  Observaciones: Joi.string().allow(''),
  Condicion: Joi.string().valid('Nuevo','Usado','Danado','En reparacion','Saldo').required(),
  Obra: Joi.string().allow(''),
  Fecha: Joi.date().required()
});

export const toolSchema = Joi.object({
  Nombre: Joi.string().required(),
  'Fecha de compra': Joi.date().required(),
  'Numero Interno': Joi.string().required(),
  'Ubicacion / Coordenada': Joi.string().allow(''),
  'Designacion Generica': Joi.string().allow(''),
  Descripcion: Joi.string().allow(''),
  Marca: Joi.string().allow(''),
  Modelo: Joi.string().allow(''),
  Proveedor: Joi.string().allow(''),
  Estado: Joi.string().valid('Operativo','En reparacion','Danado','Baja').required(),
  Observaciones: Joi.string().allow('')
});

export const timesheetSchema = Joi.object({
  userId: Joi.string().optional(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  startTime: Joi.string().pattern(TIME_PATTERN).required(),
  endTime: Joi.string().pattern(TIME_PATTERN).required(),
  client: Joi.string().allow('').trim().default(''),
  task: Joi.string().allow('').trim().default(''),
  workOrder: Joi.string().allow('').trim().default(''),
  isHoliday: Joi.boolean().default(false)
});

export const timesheetUpdateSchema = timesheetSchema.fork(
  ['date', 'startTime', 'endTime'],
  (schema) => schema.optional()
);
