// ============================================================
// SCHÉMAS ZOD
// ============================================================
//
// `candidateRegisterSchema`, `companyRegisterSchema` et `paginationSchema`
// étaient exportés ici sans AUCUN appelant (vérifié par grep sur tout `src/`) :
// l'inscription passait par la validation de `services/authService.js`, et la
// pagination par `utils/pagination.js`.
//
// Ils ont été SUPPRIMÉS, et non branchés, pour trois raisons vérifiables :
//
//   1. Ils étaient DIVERGENTS du code réellement exécuté, donc les brancher
//      aurait cassé l'inscription :
//      - `companyRegisterSchema` attend `name`, alors que l'API lit
//        `companyName` (et que le client web envoie `companyName`) ;
//      - `candidateRegisterSchema` déclarait `phone`, `country`, `city` et
//        `birthDate` comme OPTIONNELS, alors que `createCandidate` les exige
//        via `validateRequired`. Les brancher aurait AFFAIBLI la validation.
//
//   2. La validation existante est au moins équivalente, souvent plus stricte :
//      `validateAge` applique la même borne 16-100 avec un calcul d'âge exact
//      (là où le `.refine` de zod approximait l'âge par une durée en
//      millisecondes), et `validateLength` borne chaque champ.
//
//   3. Superposer une seconde couche de validation devant une couche qui
//      fonctionne crée deux sources de vérité sur les règles d'inscription —
//      exactement la duplication qui a produit le bypass d'autorisation des
//      uploads (`getEffectiveDir`) et l'injection d'en-tête Host
//      (`absoluteUrl`).
//
// La frontière de validation reste donc unique : `services/authService.js` pour
// les comptes, `utils/pagination.js` pour les listes. Seul `jobCreateSchema`
// est branché — sur la route de création d'offre, qui n'avait pas d'équivalent.
// ============================================================

const z = require('zod');

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
  validate,
};
