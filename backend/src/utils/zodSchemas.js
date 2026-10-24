// ============================================================
// SCHÉMAS ZOD
// ============================================================
//
// `candidateRegisterSchema` et `companyRegisterSchema` sont ALIGNÉS avec
// `services/authService.js` (frontière unique conservée) : chaque champ exigé
// par `createCandidate` / `createCompany` via `validateRequired` est exigé
// ici, avec les mêmes bornes (`validateLength`, `validateAge`, `validatePhone`).
// L'historique (schémas supprimés) attendait `name` au lieu de `companyName`
// et déclarait `phone/country/city/birthDate` optionnels : les brancher
// aurait cassé 100 % des inscriptions entreprise et affaibli la validation
// candidat. Ces schémas corrigent les deux divergences.
//
// Usage en défense en profondeur : `authService` appelle `validate()` EN
// PREMIER (garde de forme), puis conserve ses contrôles stricts existants
// (messages métier précis). Zod ne remplace rien : il rejette tôt les formes
// invalides, `authService` garde le dernier mot. `paginationSchema` reste
// supprimé (doublon de `utils/pagination.js`).
//
// Seul `jobCreateSchema` préexistait et reste branché sur la création d'offre.
// ============================================================

const z = require('zod');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[\d\s\+\-\(\)]{8,}$/;

function phoneDigits(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '').length : 0;
}

function ageFor(birthDate) {
  const date = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(date.getTime())) return NaN;
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const birthdayThisYear = new Date(Date.UTC(now.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const nowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (nowUtc < birthdayThisYear) age -= 1;
  return age;
}

const emailField = z
  .string({ required_error: 'Email est requis.' })
  .trim()
  .min(1, 'Email est requis.')
  .regex(emailPattern, 'Email invalide.');

const passwordField = z
  .string({ required_error: 'Mot de passe est requis.' })
  .min(1, 'Mot de passe est requis.')
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.');

const birthDateField = z
  .any()
  .refine(
    (value) => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''),
    { message: 'Date de naissance est requis.' },
  )
  .refine(
    (value) => {
      const date = value instanceof Date ? value : new Date(value);
      return !Number.isNaN(date.getTime());
    },
    { message: 'Date de naissance invalide.' },
  )
  .refine(
    (value) => {
      const age = ageFor(value);
      return !Number.isNaN(age) && age >= 16 && age <= 100;
    },
    { message: 'Vous devez avoir entre 16 et 100 ans.' },
  );

const candidateRegisterSchema = z
  .object({
    email: emailField,
    password: passwordField,
    firstName: z
      .string({ required_error: 'Prénom est requis.' })
      .trim()
      .min(1, 'Prénom est requis.')
      .min(2, 'Prénom doit contenir au moins 2 caractères.')
      .max(50, 'Prénom ne doit pas dépasser 50 caractères.'),
    lastName: z
      .string({ required_error: 'Nom est requis.' })
      .trim()
      .min(1, 'Nom est requis.')
      .min(2, 'Nom doit contenir au moins 2 caractères.')
      .max(50, 'Nom ne doit pas dépasser 50 caractères.'),
    phone: z
      .string({ required_error: 'Téléphone est requis.' })
      .trim()
      .min(1, 'Téléphone est requis.')
      .refine((value) => phonePattern.test(value) && phoneDigits(value) >= 8, {
        message: 'Numéro de téléphone invalide.',
      }),
    country: z
      .string({ required_error: 'Pays est requis.' })
      .trim()
      .min(1, 'Pays est requis.'),
    city: z
      .string({ required_error: 'Ville est requis.' })
      .trim()
      .min(1, 'Ville est requis.'),
    birthDate: birthDateField,
    avatarUrl: z.string().nullable().optional(),
  })
  .passthrough();

const companyRegisterSchema = z
  .object({
    email: emailField,
    password: passwordField,
    companyName: z
      .string({ required_error: "Nom de l'entreprise est requis." })
      .trim()
      .min(1, "Nom de l'entreprise est requis.")
      .min(2, "Nom de l'entreprise doit contenir au moins 2 caractères.")
      .max(100, "Nom de l'entreprise ne doit pas dépasser 100 caractères."),
    logo: z.string().nullable().optional(),
    companyImages: z
      .array(z.object({ url: z.string().min(1) }).passthrough())
      .optional(),
  })
  .passthrough();

const jobCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(20).max(20000),
  location: z.string().trim().min(2).max(200),
  jobType: z.enum(['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'FREELANCE']).optional(),
  contractType: z.string().max(80).optional(),
  department: z.string().max(80).optional(),
  workMode: z.string().max(40).optional(),
  experience: z.string().max(80).optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
  salaryMax: z.coerce.number().int().min(0).optional(),
  currency: z.string().max(10).optional(),
  deadline: z.coerce.date().optional(),
  skills: z.string().max(5000).optional(),
  minExperienceYears: z.coerce.number().int().min(0).max(50).optional(),
  maxExperienceYears: z.coerce.number().int().min(0).max(50).optional(),
  educationLevel: z.string().max(80).optional(),
  startsAt: z.coerce.date().optional(),
}).refine((d) => d.salaryMax == null || d.salaryMin == null || d.salaryMax >= d.salaryMin, {
  message: 'salaryMax doit être >= salaryMin',
  path: ['salaryMax'],
});

function validate(schema, data) {
  const res = schema.safeParse(data);
  if (!res.success) {
    const { ValidationError } = require('./errors');
    const details = res.error.flatten();
    throw new ValidationError('Validation échouée', details);
  }
  return res.data;
}

module.exports = {
  jobCreateSchema,
  candidateRegisterSchema,
  companyRegisterSchema,
  validate,
};
