# Modèle métier JOBSINC

Ce document décrit le domaine métier effectif, tel que défini par le schéma
Prisma (`backend/prisma/schema.prisma`, base **PostgreSQL**).

## Compte utilisateur et rôles

Un utilisateur possède un seul compte (`User`), avec un rôle parmi :

```prisma
enum Role {
  CANDIDATE
  EMPLOYEE
  RECRUITER
  ADMIN
}
```

- Un **CANDIDATE** est décrit par `CandidateProfile` (CV, compétences, localisation, disponibilité).
- Un **RECRUITER** est lié à une `Company` (1:1 via `Company.userId`).
- Un **EMPLOYEE** est un ancien candidat recruté (voir `Employment`).
- Les **ADMIN** accèdent à un panneau de modération côté web (`/admin`).

La sécurité est renforcée par :
- `tokenVersion` sur `User` : révoque toutes les sessions lors d'un changement de mot de passe / déconnexion.
- `PasswordReset` et `EmailVerification` : jetons à usage unique avec expiration.

## Offres et candidatures

```prisma
enum JobType {
  FULL_TIME
  PART_TIME
  INTERNSHIP
  FREELANCE
}

enum ApplicationStatus {
  RECEIVED
  UNDER_REVIEW
  INTERVIEW
  ACCEPTED
  REJECTED
}
```

- `Job` : appartient à une `Company` (`Job.companyId`), associe une liste de
  compétences via `JobSkill` (relation vers le référentiel `Skill`).
- `Application` : relie un `CandidateProfile` à un `Job`
  (`@@unique([jobId, candidateProfileId])`), porte un `cvUrl` et un statut.
- `Skill` / `CandidateSkill` / `JobSkill` : référentiel de compétences alimentant
  le moteur de matching.

## Entretiens et emplois

```prisma
enum InterviewMode {
  ONLINE
  PRESENTIEL
}

enum InterviewStatus {
  PLANIFIE
  EN_COURS
  TERMINE
  ANNULE
}

enum EmploymentStatus {
  ACTIVE
  INACTIVE
}
```

- `Interview` : lié à une candidature (1:1 via `Application.interview`). Le mode
  ONLINE fournit un `streamingUrl` (visioconférence).
- `Employment` : créé lors d'un recrutement confirmé, relie un candidat à une
  entreprise et une offre. Les fins/suspensions modifient uniquement
  `Employment.status`, ce qui conserve l'historique professionnel du candidat.

## Messagerie

```prisma
enum NotificationType {
  APPLICATION
  INTERVIEW
  MESSAGE
  GENERAL
}
```

- `Conversation` : conversations **recruteur ↔ candidat**, toujours rattachées à
  une `Application` autorisée (statuts `INTERVIEW` ou `ACCEPTED`).
  Contrainte d'unicité `@@unique([companyUserId, candidateUserId])`.
- `Message` : ligne horodatée avec `senderId`, `receiverId` et `isRead`.
  Lecteur partagé entre `/api/conversations` et l'endpoint legacy
  `/api/company/messages` (`conversationService`).
- Les notifications (`Notification`) et les push FCM (`DeviceToken`) alertent les
  utilisateurs des événements clés (nouveau message, statut d'application, etc.).

## FAQ et feedback

- `Faq` (table `FAQ`) : questions/réponses par entreprise, publication modérée (`isPublished`).
- `Feedback` (table `Feedback`) : témoignages d'entreprises, publication modérée.
- `SavedJob` : offres épinglées par un utilisateur (`@@unique([userId, jobId])`).

## Relations principales

- `User` 1—1 `CandidateProfile` / 1—1 `Company`
- `Company` 1—n `Job`, 1—n `Faq`, 1—n `Feedback`
- `Job` 1—n `Application`, 1—n `JobSkill`
- `CandidateProfile` 1—n `Application`, 1—n `CandidateSkill`, 1—n `Employment`
- `Application` 1—1 `Interview`, 1—1 `Conversation`, 1—1 `Employment`
- `Conversation` 1—n `Message` (2 autres participants `User`)

## Endpoints principaux

Tous les endpoints sont servis sous `/api` (voir `server.js` pour le montage complet) :
- Auth : `/auth/register/candidate`, `/auth/register/company`, `/auth/login`,
  `/auth/login/candidate`, `/auth/login/company`, `/auth/me`,
  `/auth/forgot-password`, `/auth/reset-password`
- Entreprise : `/company/*` (dashboard, profil, offres, candidatures, matching, messagerie, FAQ, feedback)
- Public : `/companies`, `/jobs`, `/stats`, `/faq/public`, `/feedback/public`
- Candidatures : `/applications/*`, entretiens : `/interviews/*`
- Messagerie : `/conversations/*`, legacy `/company/messages`
- Admin : `/admin/*`