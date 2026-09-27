#!/usr/bin/env node
/**
 * Migre les uploads locaux vers le bucket S3.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Avec `STORAGE_DRIVER=local` sur Render, les uploads sont écrits sur le
 * DISQUE DU SERVICE, qui est éphémère : chaque redéploiement efface les CV, CV
 * et photos, qui répondent alors `Cannot GET /uploads/…` (404 d'Express, donc
 * indiscernable d'une faute de frappe). Constaté en production : les 16 logos
 * d'entreprises référencés en base répondaient tous 404.
 *
 * Les CHEMINS en base sont, eux, toujours valides. Seuls les OCTETS manquent.
 * Ce script ré-écrit ces octets depuis une copie locale, sans toucher à la
 * base : rien n'y est à migrer, et rien n'y doit l'être.
 *
 * IL SUIT LA LOGIQUE DE LA PLATEFORME, IL NE L'INVENTE PAS
 * --------------------------------------------------------
 *   - la clé S3 est `<sous-dossier>/<nom>`, exactement ce que produit
 *     `multipartParser.saveFile` (`${sub}/${filename}`) et ce que déduit
 *     `s3KeyFromStoredUrl` de `/uploads/<sous-dossier>/<nom>` ;
 *   - le `ContentType` est déduit des MAGIC BYTES, pas de l'extension, avec
 *     les mêmes signatures que `utils/uploadValidation.js`. Une extension
 *     menteuse produirait un objet que `streamS3Object` refuse ensuite en 415,
 *     parce que `isStreamableContentType` ne connaît pas ce type ;
 *   - l'upload utilise le même `S3Client` et le même `PutObjectCommand` que
 *     `storageService.saveS3`, donc mêmes clés, mêmes en-têtes ;
 *   - rien n'est supprimé en local : le script est réversible, et un échec
 *     partiel ne coûte aucune donnée.
 *
 * L'IDEMPOTENCE vient de `HeadObject` : un objet déjà présent est ignoré, donc
 * relancer le script après une coupure ne duplique rien et n'écrase rien sans
 * `--force`.
 *
 * USAGE
 *   node scripts/migrate-uploads-to-s3.js            # inventaire seul, n'ecrit rien
 *   node scripts/migrate-uploads-to-s3.js --apply    # televerse
 *   node scripts/migrate-uploads-to-s3.js --apply --force   # reecrase
 *
 * Variables requises (comme en production) :
 *   STORAGE_DRIVER=s3, AWS_S3_BUCKET, AWS_S3_REGION,
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY [, AWS_S3_ENDPOINT]
 *
 * SANS `--apply`, le script n'exige AUCUNE credentiel : c'est le cas par
 * defaut, et c'est ce qui permet de l'exécuter sans risque avant de configurer
 * quoi que ce soit.
 */

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

const appliquer = process.argv.includes('--apply');
const forcer = process.argv.includes('--force');

/**
 * Signatures MAGIC BYTES — les MÊMES que `utils/uploadValidation.js`.
 * Volontairement dupliquées dans un script hors ligne : exiger
 * `../src/utils/uploadValidation` tirerait `utils/errors` et donc tout le graphe
 * Prisma dans un outil qui n'a besoin que de `fs`. Le prix est un risque de
 * dérive, couvert par l'invariant vérifié en fin de script (l'extension doit
 * correspondre au type déduit).
 */
function sniffMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return 'application/msword';
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

/**
 * Les types que `streamS3Object` SAIT servir (`isStreamableContentType`).
 * Un type hors de cette liste produirait un objet stocké puis refusé en 415 à
 * la lecture : mieux vaut le signaler au téléversement.
 */
const SERVABLE = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Extension attendue pour un type — miroir de `EXTENSIONS` dans uploadValidation. */
const EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

const SOUS_DOSSIERS = ['cvs', 'candidates', 'companies'];

function clientS3() {
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.AWS_S3_REGION || 'eu-west-1',
    endpoint: process.env.AWS_S3_ENDPOINT,
  });
}

function credencialesManquantes() {
  return ['AWS_S3_BUCKET', 'AWS_S3_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
    .filter((k) => !process.env[k]);
}

async function inventorier() {
  const inventaire = [];
  if (!fs.existsSync(UPLOADS_DIR)) return inventaire;
  for (const sub of SOUS_DOSSIERS) {
    const dir = path.join(UPLOADS_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const nom of await fsp.readdir(dir)) {
      const chemin = path.join(dir, nom);
      const st = await fsp.stat(chemin);
      if (!st.isFile()) continue;
      if (nom.startsWith('.')) continue; // fichier de sonde / temporaire
      const buffer = await fsp.readFile(chemin);
      const mime = sniffMime(buffer);
      inventaire.push({
        sousDossier: sub,
        nom,
        cle: `${sub}/${nom}`,
        chemin,
        octets: st.size,
        mime,
        extensionConnue: mime ? EXTENSION[mime] : null,
        extensionReelle: path.extname(nom).toLowerCase(),
        servable: Boolean(mime && SERVABLE.has(mime)),
        provenance: `/${'uploads'}/${sub}/${nom}`,
      });
    }
  }
  return inventaire;
}

async function main() {
  console.log('=== Migrage des uploads vers S3 ===');
  console.log(`  mode          : ${appliquer ? (forcer ? 'APPLY + FORCE' : 'APPLY') : 'INVENTAIRE (rien n\u2019est ecrit)'}`);
  console.log(`  dossier source: ${UPLOADS_DIR}`);

  const inventaire = await inventorier();
  if (!inventaire.length) {
    console.log('\n  Aucun fichier local. Si les octets sont deja perdus, il n\u2019y a plus rien a migrer :');
    console.log('  il faut les re-deposer depuis l\u2019interface.');
    return;
  }

  const total = inventaire.reduce((a, f) => a + f.octets, 0);
  const parSous = new Map();
  for (const f of inventaire) {
    const e = parSous.get(f.sousDossier) || { n: 0, o: 0 };
    e.n += 1; e.o += f.octets;
    parSous.set(f.sousDossier, e);
  }
  console.log(`\n  ${inventaire.length} fichiers, ${(total / 1024 / 1024).toFixed(2)} Mio`);
  for (const [sub, e] of parSous) console.log(`    ${sub.padEnd(12)} ${String(e.n).padStart(3)} fichier(s)  ${(e.o / 1024).toFixed(0)} Ko`);

  // Anomalies : ce qui echouerait a la LECTURE apres un upload reussi.
  const sansType = inventaire.filter((f) => !f.mime);
  const nonServables = inventaire.filter((f) => f.mime && !f.servable);
  const extensionFausse = inventaire.filter((f) => f.mime && f.extensionConnue && f.extensionConnue !== f.extensionReelle);

  console.log(`\n  type non reconnu (magic bytes) : ${sansType.length}`);
  console.log(`  type non servi par le backend  : ${nonServables.length}`);
  console.log(`  extension != type              : ${extensionFausse.length}`);
  for (const f of sansType.concat(nonServables).concat(extensionFausse)) {
    console.log(`    ${f.cle}  mime=${f.mime || 'inconnu'}  ext=${f.extensionReelle}`);
  }
  if (!sansType.length && !nonServables.length && !extensionFausse.length) {
    console.log('    aucune : chaque fichier est servi tel qu\u2019il est.');
  }

  if (!appliquer) {
    console.log('\n  --- Fin de l\u2019inventaire. Rien n\u2019a ete ecrit. ---');
    const manquantes = credencialesManquantes();
    if (manquantes.length) {
      console.log(`  Pour telecharger, il manque : ${manquantes.join(', ')}`);
    } else {
      console.log('  Variables AWS presentes : relancez avec --apply.');
    }
    console.log(`\n  Cles qui seront ecrites, pour recoupement avec la base :`);
    for (const f of inventaire.slice(0, 8)) console.log(`    ${f.provenance}`);
    if (inventaire.length > 8) console.log(`    ... et ${inventaire.length - 8} autres`);
    return;
  }

  const bucket = process.env.AWS_S3_BUCKET;
  const { PutObjectCommand, HeadBucketCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
  const client = clientS3();

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`\n  Bucket joignable : ${bucket}`);
  } catch (e) {
    console.error(`\n  ABANDON : bucket ${bucket} injoignable (${e?.name || e?.message}).`);
    console.error('  Verifiez AWS_S3_BUCKET, AWS_S3_REGION et les credentials.');
    process.exitCode = 1;
    return;
  }

  let envoyes = 0, ignores = 0, forces = 0;
  const echecs = [];
  for (const f of inventaire) {
    try {
      if (!forcer) {
        try {
          await client.send(new HeadObjectCommand({ Bucket: bucket, Key: f.cle }));
          ignores += 1;
          continue;
        } catch { /* absent : on televerse */ }
      }
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: f.cle,
        Body: await fsp.readFile(f.chemin),
        ContentType: f.mime || 'application/octet-stream',
      }));
      if (forcer) forces += 1; else envoyes += 1;
      console.log(`  + ${f.cle}  (${(f.octets / 1024).toFixed(0)} Ko, ${f.mime})`);
    } catch (e) {
      echecs.push({ cle: f.cle, erreur: e?.name || e?.message || String(e) });
      console.error(`  !! ${f.cle}  ${e?.name || e?.message}`);
    }
  }

  console.log(`\n  === bilan ===`);
  console.log(`  televerses : ${envoyes}${forces ? ` (dont ${forces} reecrits --force)` : ''}`);
  console.log(`  deja la    : ${ignores}`);
  console.log(`  echecs     : ${echecs.length}`);
  if (echecs.length) {
    console.error('\n  Reexecutez : le script est idempotent, il ne recommencera que les absences.');
    process.exitCode = 1;
  } else {
    console.log('\n  Rien n\u2019a ete supprime en local : la migration est reversible.');
  }
}

main().catch((e) => {
  console.error('Echec du script :', e);
  process.exitCode = 1;
});
