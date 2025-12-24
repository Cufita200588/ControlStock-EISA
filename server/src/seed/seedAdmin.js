import { db } from '../config/firebase.js';
import { hash } from '../utils/hash.js';

export const ensureAdminAndRoles = async () => {
  // Rol admin (todos los permisos en true)
  const adminRole = {
    name: 'admin',
    permissions: {
      users: { manage: true },
      roles: { manage: true },
      materials: { create: true, read: true, update: true, delete: true },
      tools: { create: true, read: true, update: true, delete: true },
      timesheets: { submit: true, read: true, manage: true, viewAll: true }
    }
  };
  await db.collection('roles').doc('admin').set(adminRole, { merge: true });

  // Usuario cufita si no existe
  const q = await db.collection('users').where('username', '==', 'cufita').limit(1).get();
  if (q.empty) {
    const passwordHash = await hash('1969');
    await db.collection('users').add({
      username: 'cufita',
      displayName: 'Administrador',
      passwordHash,
      roles: ['admin']
    });
    console.log('Usuario admin (cufita/1969) creado.');
  }
};
