const { ValidationError } = require('./errors');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[\d\s\+\-\(\)]{8,}$/;

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return emailPattern.test(email.trim());
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8;
}

function validatePassword(password, minLength = 8) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= minLength;
}

function validateRequired(value, fieldName) {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new ValidationError(`${fieldName} est requis.`);
  }
}

function validateLength(value, fieldName, min, max) {
  if (value && typeof value === 'string') {
    if (value.length < min) throw new ValidationError(`${fieldName} doit contenir au moins ${min} caractères.`);
    if (max && value.length > max) throw new ValidationError(`${fieldName} ne doit pas dépasser ${max} caractères.`);
  }
}

function validateAge(birthDate, minAge = 16, maxAge = 100) {
  if (!birthDate) throw new ValidationError('Date de naissance requise.');
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) throw new ValidationError('Date de naissance invalide.');
  
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const birthdayThisYear = new Date(Date.UTC(now.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (now < birthdayThisYear) age -= 1;
  
  if (age < minAge || age > maxAge) {
    throw new ValidationError(`Vous devez avoir entre ${minAge} et ${maxAge} ans.`);
  }
  return age;
}

function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

module.exports = {
  validateEmail,
  validatePhone,
  validatePassword,
  validateRequired,
  validateLength,
  validateAge,
  sanitizeString,
  sanitizeEmail,
};