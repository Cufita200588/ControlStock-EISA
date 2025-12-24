import { db, FieldValue } from '../config/firebase.js';

/**
 * Registra un movimiento de auditoria.
 * entity: "material" | "tool"
 * type:   valores sugeridos: "create" | "update" | "delete" | "stock_in" | "stock_out" | "transfer"
 * payload: datos adicionales (delta, before, after, notas, etc.)
 * by:     req.user.username
 */
export const logMovement = async ({ entity, entityId, type, payload = {}, by = 'system' }) => {
  await db.collection('movements').add({
    entity,
    entityId,
    type,
    payload,
    by,
    at: FieldValue.serverTimestamp()
  });
};
