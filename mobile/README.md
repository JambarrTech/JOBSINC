# JOBSINC Mobile

Frontend Flutter pour les candidats et les employés/recruteurs de JOBSINC.

## Phase 1

- Design system centralisé JOBSINC
- Splash animé et onboarding
- Inscription automatique en statut candidat
- Espace employé activé uniquement après un statut retourné par le backend
- Modèle utilisateur et provider d’authentification local
- Navigation `go_router` adaptée au statut `CANDIDATE` ou `EMPLOYEE`
- Dashboards candidat et employé avec bottom navigation

> Note historique : à ce stade les écrans affichaient des placeholders UI.
> Depuis, tous les écrans sont alimentés par l'API backend (aucune donnée
> codée en dur dans l'UI).

## Lancer le projet

```bash
flutter pub get
flutter run
```

L'API par défaut pointe sur `127.0.0.1:5000` (le localhost de l'appareil). Le
backend étant sur votre PC, la façon la plus simple de le joindre depuis un
appareil Android (émulateur ou téléphone réel en USB) est le port-renvoi adb :

```bash
adb reverse tcp:5000 tcp:5000
flutter run
```

Sans `adb reverse` (ex. téléphone réel non branché en USB), indiquez l'adresse
IP de la machine qui exécute le backend :

```bash
flutter run --dart-define=API_URL=http://192.168.1.10:5000/api
```

Note : la cleartext HTTP est autorisée sur Android (`usesCleartextTraffic`);
sur iOS le trafic HTTP vers un IP LAN exige d'ajouter une exception ATS.
