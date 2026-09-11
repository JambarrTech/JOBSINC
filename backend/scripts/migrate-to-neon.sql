-- Migration des données MySQL → PostgreSQL Neon
-- Désactiver temporairement les contraintes de clés étrangères

-- =============================================
-- USERS
-- =============================================
INSERT INTO "User" ("id", "email", "passwordHash", "role", "createdAt", "updatedAt") VALUES
('1a62186d-5b9d-461c-897b-f46c4d23c40d', 'hisbucodeur@gmail.com', '$2b$10$mP9kC3OEBMCIdk5SogwOgeiqVhFT5wZBCrBJWLEpNenN9nH70HUSW', 'ADMIN', '2026-08-21T03:24:42.168Z', '2026-08-21T03:24:42.168Z'),
('3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'mbowmatar00@gmail.com', '$2b$12$KKXt5aSJ3EVoYkBJ6l1LxOCUj/km5QOimUHPmPt0WB9nlViVPPS1W', 'RECRUITER', '2026-08-20T15:59:45.422Z', '2026-08-20T15:59:45.422Z'),
('c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'jambarrtech@gmail.com', '$2b$12$2yBRP1Ufc5wRCi2.qQ4BYOZ2fFkLxES4GzB7xLwL6mFRbW5EYxi/K', 'CANDIDATE', '2026-08-20T10:27:45.647Z', '2026-08-20T10:27:45.647Z'),
('7103419c-cc99-4926-a5fa-1bb96e831a2b', 'awa.ba@email.com', '$2b$12$2yBRP1Ufc5wRCi2.qQ4BYOZ2fFkLxES4GzB7xLwL6mFRbW5EYxi/K', 'CANDIDATE', '2026-08-23T14:49:05.177Z', '2026-08-23T14:49:05.177Z')
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- CANDIDATE PROFILES
-- =============================================
INSERT INTO "CandidateProfile" ("id", "userId", "firstName", "lastName", "phone", "birthDate", "country", "city", "avatarUrl", "cvUrl", "skills", "createdAt", "updatedAt", "experienceYears", "educationLevel", "educationField", "desiredContracts", "availableFrom") VALUES
('7e4aa325-74a3-4353-ae09-2517a54998eb', '7103419c-cc99-4926-a5fa-1bb96e831a2b', 'Awa', 'Ba', '771234567', '1998-05-10T00:00:00.000Z', 'Senegal', 'Dakar', NULL, NULL, NULL, '2026-08-23T14:49:05.177Z', '2026-08-23T14:49:05.177Z', NULL, NULL, NULL, NULL, NULL),
('ddf42499-2bef-48a3-918d-21cee2aa8bca', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'Matar', 'MBOW', '+221 787575341', '2004-06-06T00:00:00.000Z', 'Sénégal', 'Tivaouane', '/uploads/candidates/8e51544f-c39a-4e0a-863a-9514469f2795.jpg', '/uploads/cvs/0a6812af-f19f-46e2-8bb1-6c3c2912a699.pdf', 'Réseaux informatiques, systèmes informatiques, dev web, dev mobile', '2026-08-20T10:27:45.647Z', '2026-08-23T14:02:10.888Z', NULL, NULL, NULL, NULL, NULL)
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- COMPANIES
-- =============================================
INSERT INTO "Company" ("id", "userId", "name", "description", "website", "sector", "size", "country", "city", "address", "foundedYear", "isApproved", "createdAt", "updatedAt", "logo") VALUES
('c6bcb5e1-8717-4042-8f50-a3a1e1d2990d', '3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'jambarr tech', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, '2026-08-20T15:59:45.422Z', '2026-08-20T15:59:45.422Z', NULL)
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- COMPANY IMAGES
-- =============================================
INSERT INTO "CompanyImage" ("id", "companyId", "url", "isPrimary", "sortOrder", "createdAt", "updatedAt") VALUES
('339ef7ba-34c7-4208-bb6b-006c59ab9b1b', 'c6bcb5e1-8717-4042-8f50-a3a1e1d2990d', '/uploads/companies/1f1e9c21-9f6d-4e6a-8010-78e4f301cb66.jpg', true, 0, '2026-08-20T15:59:45.422Z', '2026-08-20T15:59:45.422Z')
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- JOBS
-- =============================================
INSERT INTO "Job" ("id", "companyId", "title", "description", "location", "jobType", "contractType", "department", "workMode", "experience", "salaryMin", "salaryMax", "currency", "deadline", "responsibilities", "skills", "isOpen", "createdAt", "updatedAt", "minExperienceYears", "maxExperienceYears", "educationLevel") VALUES
('395b80a8-85f6-4b41-96fa-6d50d3877699', 'c6bcb5e1-8717-4042-8f50-a3a1e1d2990d', 'Développeur Full Stack Junior', 'JambarrTech recherche un(e) Développeur(se) Full Stack Junior motivé(e) pour rejoindre son équipe et participer à la conception et au développement de solutions numériques innovantes.', 'Thiès, Sénégal', 'FULL_TIME', 'CDD', 'Technologie / Développement', 'Sur site', 'Intermédiaire', 250000, 500000, 'FCFA', '2026-09-30T00:00:00.000Z', 'Participer à la conception et au développement de nouvelles fonctionnalités.', 'Connaissances en développement web et/ou mobile.', true, '2026-08-20T15:59:45.422Z', '2026-08-24T02:34:25.000Z', NULL, NULL, NULL),
('f15065f0-cd64-4639-bb69-3317c6b23018', 'c6bcb5e1-8717-4042-8f50-a3a1e1d2990d', 'Stagiaire Sécurité des Systèmes d''Information (SSI)', 'Stage en sécurité des systèmes d''information', 'Thiès, Sénégal', 'INTERNSHIP', 'Stage', 'Sécurité', 'Sur site', 'Junior', NULL, NULL, NULL, '2026-09-30T00:00:00.000Z', 'Participer à la sécurisation des systèmes d''information.', 'Sécurité informatique, réseaux', true, '2026-08-20T15:59:45.422Z', '2026-08-24T02:34:25.000Z', NULL, NULL, NULL)
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- APPLICATIONS
-- =============================================
INSERT INTO "Application" ("id", "jobId", "candidateProfileId", "cvUrl", "coverLetter", "status", "createdAt", "updatedAt") VALUES
('24a09c0c-f2e3-4037-963f-08ed7286bec3', 'f15065f0-cd64-4639-bb69-3317c6b23018', 'ddf42499-2bef-48a3-918d-21cee2aa8bca', '/uploads/cvs/c12ae43e-e15d-4be3-9881-84caa209190b.pdf', 'Objet : Candidature au poste de Développeur Web & Mobile', 'UNDER_REVIEW', '2026-08-23T12:17:24.932Z', '2026-08-23T13:56:37.050Z'),
('c2e5725e-1465-4c31-9c68-0192d6451e65', '395b80a8-85f6-4b41-96fa-6d50d3877699', 'ddf42499-2bef-48a3-918d-21cee2aa8bca', '/uploads/cvs/c12ae43e-e15d-4be3-9881-84caa209190b.pdf', 'Candidature pour le poste de Développeur Full Stack Junior', 'INTERVIEW', '2026-08-21T03:15:55.097Z', '2026-08-21T03:15:55.097Z')
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- INTERVIEWS
-- =============================================
INSERT INTO "Interview" ("id", "applicationId", "mode", "scheduledAt", "duration", "streamingUrl", "location", "notes", "createdAt", "updatedAt", "status", "startedAt", "finishedAt") VALUES
('03cc6e91-e7ac-4efe-b2b3-1448e973d30b', '24a09c0c-f2e3-4037-963f-08ed7286bec3', 'ONLINE', '2026-08-30T15:00:00.000Z', 30, 'https://meet.google.com/yxj-wkpp-puc', NULL, 'Soit pret et soit dans un endroit calme', '2026-08-23T14:01:11.594Z', '2026-08-23T15:58:22.850Z', 'ANNULE', NULL, NULL),
('906131b0-254e-4dc6-a444-552d37f42d39', 'c2e5725e-1465-4c31-9c68-0192d6451e65', 'ONLINE', '2026-08-30T10:30:00.000Z', 30, 'https://meet.google.com/zuf-tfet-rfv', NULL, 'soit pret à l''heure et soit dans un endroit calme', '2026-08-21T03:15:55.097Z', '2026-08-21T03:15:55.097Z', 'PLANIFIE', NULL, NULL)
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- CONVERSATIONS
-- =============================================
INSERT INTO "Conversation" ("id", "subject", "companyUserId", "candidateUserId", "lastMessageAt", "createdAt", "updatedAt", "applicationId") VALUES
('8dc9843d-31d2-4d7e-b310-4a9bfe3a3a5d', 'Développeur Full Stack Junior', '3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', '2026-08-23T14:11:42.419Z', '2026-08-22T22:40:21.837Z', '2026-08-23T14:11:42.553Z', '24a09c0c-f2e3-4037-963f-08ed7286bec3')
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- MESSAGES
-- =============================================
INSERT INTO "Message" ("id", "conversationId", "senderId", "receiverId", "content", "isRead", "createdAt") VALUES
('4edb1689-ccea-4ad3-b3d8-c6bbd6d1e702', '8dc9843d-31d2-4d7e-b310-4a9bfe3a3a5d', '3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'salut', true, '2026-08-23T11:57:48.433Z'),
('ac1b9ef9-fae9-4dd3-af06-acc05c41c262', '8dc9843d-31d2-4d7e-b310-4a9bfe3a3a5d', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', '3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'Xv', true, '2026-08-23T11:58:08.590Z'),
('a6d773d4-f9b7-4e4b-a43e-488888eb19d7', '8dc9843d-31d2-4d7e-b310-4a9bfe3a3a5d', '3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'Votre candidature a été reçue avec succès', true, '2026-08-23T12:17:24.932Z'),
('262914a7-1b2e-492f-9401-a6d5ae1c4112', '8dc9843d-31d2-4d7e-b310-4a9bfe3a3a5d', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', '3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'Merci', true, '2026-08-23T12:18:32.471Z'),
('38aeee7d-136a-43ac-9c68-39d02eda0168', '8dc9843d-31d2-4d7e-b310-4a9bfe3a3a5d', '3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'salut', true, '2026-08-23T14:11:42.419Z')
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- DEVICE TOKENS
-- =============================================
INSERT INTO "DeviceToken" ("id", "userId", "token", "platform", "createdAt", "updatedAt") VALUES
('4f1cb569-cabe-41bf-8050-f44fd98a1aa2', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'fYeLEQGmS-eHOSUlKjTkcy:APA91bH2FleBGyDXYqgwIcWno5BHzW_C3FSx9aYaWLaJ-IrlysWbDNRKAhdXh6XdFWVca3CCgCr2Z8m3nIKbmb30gepbkkAet_R-qMvk94N6S1m1mEGVsQM', 'android', '2026-08-23T00:53:45.400Z', '2026-08-23T17:41:16.826Z')
ON CONFLICT ("id") DO NOTHING;

-- =============================================
-- NOTIFICATIONS
-- =============================================
INSERT INTO "Notification" ("id", "userId", "title", "body", "type", "link", "isRead", "createdAt") VALUES
('700c8c3b-b6a4-4b23-a316-a736953fbe8c', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'Nouveau message', 'Vous avez reçu un nouveau message de jambarr tech.', 'MESSAGE', '/messages', true, '2026-08-23T11:57:48.448Z'),
('166bc5a3-a9cf-47b6-b3dd-6153916a4bb0', '3dd454f2-d25e-4270-8bcf-dd5093cd06c4', 'Nouveau message', 'Vous avez reçu un nouveau message de Matar MBOW.', 'MESSAGE', '/messages', true, '2026-08-23T12:18:32.483Z'),
('0c5355e3-95b9-431e-80ef-051289ae39de', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'Nouveau message', 'Vous avez reçu un nouveau message de jambarr tech.', 'MESSAGE', '/messages', true, '2026-08-23T12:17:24.949Z'),
('7b10b1ef-dd07-4f5b-ad16-db1fe8f3d6d3', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'Candidature en cours d''examen', 'Votre candidature pour "Stagiaire Sécurité des Systèmes d''Information (SSI)" chez jambarr tech est maintenant : En cours d''examen.', 'APPLICATION', '/applications', true, '2026-08-23T13:56:37.050Z'),
('3507e618-2453-42d1-8d60-6667f3fc1571', 'c85bcc5a-6d9e-4134-a14c-b81cc12c76d5', 'Entretien annulé', 'Votre entretien avec jambarr tech a été annulé.', 'INTERVIEW', '/applications', true, '2026-08-23T15:58:22.878Z'),
('6469eded-b57b-483c-8b0d-459f6bb0a6d7', '7103419c-cc99-4926-a5fa-1bb96e831a2b', 'Bienvenue sur JOBSINC !', 'Bienvenue Awa ! Créez votre profil complet pour maximiser vos chances.', 'GENERAL', NULL, false, '2026-08-23T14:49:05.229Z'),
('84d3d235-e7e4-415a-ae51-0a368ef831aa', '7103419c-cc99-4926-a5fa-1bb96e831a2b', 'Complétez votre profil', 'Ajoutez votre CV et vos compétences pour attirer les recruteurs.', 'GENERAL', NULL, false, '2026-08-23T14:49:05.229Z'),
('34605161-ec17-4449-b663-bfb58d33f3e9', '7103419c-cc99-4926-a5fa-1bb96e831a2b', 'Explorez les offres', 'Des milliers d''offres d''emploi vous attendent. Commencez votre recherche maintenant !', 'APPLICATION', NULL, false, '2026-08-23T14:49:05.229Z'),
('365298bf-1794-4d3b-880c-4b3239a4afb9', '7103419c-cc99-4926-a5fa-1bb96e831a2b', 'Candidature entretien', 'Votre candidature pour "Dev Test Visio" chez Visio Test est maintenant : Entretien.', 'INTERVIEW', '/applications', false, '2026-08-23T14:50:12.840Z')
ON CONFLICT ("id") DO NOTHING;
