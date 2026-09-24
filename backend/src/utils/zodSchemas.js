const { z } = require('zod');

const emailSchema = z.string().email('Email invalide').max(254);
const passwordSchema = z.string().min(8, '8 caractères minimum').max(128);
const phoneSchema = z.string().regex(/^\+?[0-9\s\-().]{7,20}$/, 'Téléphone invalide');
const nameSchema = z.string().trim().min(1).max(120);

const candidateRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
  birthDate: z.coerce.date().refine((d) => {
    const age = Math.floor((Date.now() - d.getTime()) / 31557600000);
    return age >= 16 && age <= 100;
  }, 'Âge 16-100').optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  skills: z.string().max(2000).optional(),
  experienceYears: z.coerce.number().int().min(0).max(50).optional(),
  educationField: z.string().max(120).optional(),
});

const companyRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  sector: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
  website: z.string().url().max(200).optional().or(z.literal('')),
  description: z.string().max(5000).optional(),
});

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

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
  status: z.string().max(40).optional(),
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
  candidateRegisterSchema,
  companyRegisterSchema,
  jobCreateSchema,
  paginationSchema,
  validate,
};
