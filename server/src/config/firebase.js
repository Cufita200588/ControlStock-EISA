import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const useApplicationDefault = () => {
  try {
    return admin.credential.applicationDefault();
  } catch {
    return null;
  }
};

const loadServiceAccount = () => {
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json';
  const absoluteCreds = path.resolve(__dirname, '..', '..', credsPath);
  if (!existsSync(absoluteCreds)) return null;
  const content = readFileSync(absoluteCreds, 'utf8');
  return admin.credential.cert(JSON.parse(content));
};

const credential = loadServiceAccount() || useApplicationDefault();

if (!admin.apps.length) {
  admin.initializeApp({
    credential,
    projectId: process.env.FIRESTORE_PROJECT_ID
  });
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const FieldPath = admin.firestore.FieldPath;
