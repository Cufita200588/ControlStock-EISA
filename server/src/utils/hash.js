import bcrypt from 'bcryptjs';
const ROUNDS = 10;

export const hash = async (plain) => bcrypt.hash(plain, ROUNDS);
export const compare = async (plain, hashed) => bcrypt.compare(plain, hashed);
