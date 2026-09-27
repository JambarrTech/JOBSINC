import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/storage_keys.dart';

/// Persistance locale de la session.
///
/// Les TOKENS et les DONNÉES PERSONNELLES (nom, email, téléphone, date de
/// naissance…) sont stockés en `FlutterSecureStorage` (Keychain iOS / EncryptedSharedPreferences
/// Android). Auparavant, seuls les tokens y étaient : le PII était écrit en
/// clair dans `SharedPreferences`, donc lisible sur un appareil rooté et
/// présent dans les sauvegardes de l'application.
///
/// `SharedPreferences` ne conserve plus que des drapeaux non sensibles
/// (`onboardingCompleted`) et l'identifiant de compte.
///
/// Les lectures du PII restent SYNCHRONES via un cache mémoire hydraté par
/// [hydrate], ce qui évite de casser les dizaines d'appels existants aux
/// getters. [hydrate] doit être appelé avant toute lecture — c'est le cas de
/// `AuthController.initialize()`, seul point d'entrée de la restauration.
class LocalStorage {
  LocalStorage(this._preferences, this._secureStorage);

  final SharedPreferences _preferences;
  final FlutterSecureStorage _secureStorage;

  static const _secureStorageStatic = FlutterSecureStorage();

  /// Cache mémoire des données PII, alimenté par [hydrate].
  Map<String, String> _secureCache = const {};

  static Future<LocalStorage> create() async {
    final prefs = await SharedPreferences.getInstance();
    return LocalStorage(prefs, _secureStorageStatic);
  }

  /// Charge le profil chiffré en mémoire. À appeler une fois au démarrage,
  /// avant toute lecture des getters PII.
  Future<void> hydrate() async {
    try {
      final values = await Future.wait<String?>([
        _secureStorage.read(key: StorageKeys.firstName),
        _secureStorage.read(key: StorageKeys.lastName),
        _secureStorage.read(key: StorageKeys.email),
        _secureStorage.read(key: StorageKeys.phone),
        _secureStorage.read(key: StorageKeys.birthDate),
        _secureStorage.read(key: StorageKeys.country),
        _secureStorage.read(key: StorageKeys.city),
        _secureStorage.read(key: StorageKeys.photoUrl),
        _secureStorage.read(key: StorageKeys.cvUrl),
      ]);
      const keys = [
        StorageKeys.firstName,
        StorageKeys.lastName,
        StorageKeys.email,
        StorageKeys.phone,
        StorageKeys.birthDate,
        StorageKeys.country,
        StorageKeys.city,
        StorageKeys.photoUrl,
        StorageKeys.cvUrl,
      ];
      _secureCache = {
        for (var i = 0; i < keys.length; i++)
          if (values[i] != null) keys[i]: values[i]!,
      };
    } catch (e) {
      // Jamais bloquant : on démarre sans profil local, l'utilisateur devra se
      // reconnecter si ses données ne sont pas lisibles.
      _secureCache = const {};
    }

    // Purge des PII en clair, AU DEMARRAGE.
    //
    // `_purgeLegacyPlaintextProfile` n'était appelée que depuis `saveSession`,
    // c'est-à-dire après un login / register / refresh réussi. Conséquence :
    // un utilisateur ayant installé une version antérieure à la migration vers
    // le secure storage conservait son nom, son email, son téléphone et sa date
    // de naissance EN CLAIR dans SharedPreferences — indéfiniment, tant qu'il
    // ne se reconnectait pas. Sur un appareil rooted, ou via une sauvegarde de
    // l'app, ces données restaient lisibles.
    //
    // La purge est idempotente : sans donnée en clair, elle ne fait rien. Elle
    // est donc sans risque ici, et c’est le seul endroit où elle est
    // réellement garantie : le premier démarrage suffit à nettoyer le stockage.
    await _purgeLegacyPlaintextProfile();
  }

  String? _read(String key) => _secureCache[key];

  Future<void> _write(String key, String? value) async {
    if (value == null) return;
    _secureCache = {..._secureCache, key: value};
    await _secureStorage.write(key: key, value: value);
  }

  bool get onboardingCompleted =>
      _preferences.getBool(StorageKeys.onboardingCompleted) ?? false;
  Future<void> setOnboardingCompleted(bool value) =>
      _preferences.setBool(StorageKeys.onboardingCompleted, value);

  Future<String?> get authToken async =>
      await _secureStorage.read(key: StorageKeys.authToken);
  Future<String?> get refreshToken async =>
      await _secureStorage.read(key: StorageKeys.refreshToken);
  String? get userId => _preferences.getString(StorageKeys.userId);
  String? get accountStatus =>
      _preferences.getString(StorageKeys.accountStatus) ??
      _preferences.getString(StorageKeys.userRole);
  String? get firstName => _read(StorageKeys.firstName);
  String? get lastName => _read(StorageKeys.lastName);
  String? get email => _read(StorageKeys.email);
  String? get phone => _read(StorageKeys.phone);
  DateTime? get birthDate {
    final value = _read(StorageKeys.birthDate);
    return value == null ? null : DateTime.tryParse(value);
  }

  String? get country => _read(StorageKeys.country);
  String? get city => _read(StorageKeys.city);
  String? get photoUrl => _read(StorageKeys.photoUrl);
  String? get cvUrl => _read(StorageKeys.cvUrl);

  Future<void> saveSession({
    required String token,
    String? refreshToken,
    required String id,
    required String status,
    required String firstName,
    String? lastName,
    String? email,
    String? phone,
    DateTime? birthDate,
    String? country,
    String? city,
    String? photoUrl,
    String? cvUrl,
  }) async {
    // Écritures groupées pour limiter les fenêtres d'incohérence si kill entre deux writes
    await Future.wait([
      _secureStorage.write(key: StorageKeys.authToken, value: token),
      if (refreshToken != null)
        _secureStorage.write(key: StorageKeys.refreshToken, value: refreshToken),
    ]);

    await _preferences.setString(StorageKeys.userId, id);
    await _preferences.setString(StorageKeys.accountStatus, status);

    await Future.wait([
      _write(StorageKeys.firstName, firstName),
      if (lastName != null) _write(StorageKeys.lastName, lastName),
      if (email != null) _write(StorageKeys.email, email),
      if (phone != null) _write(StorageKeys.phone, phone),
      if (birthDate != null)
        _write(StorageKeys.birthDate, birthDate.toIso8601String()),
      if (country != null) _write(StorageKeys.country, country),
      if (city != null) _write(StorageKeys.city, city),
      if (photoUrl != null) _write(StorageKeys.photoUrl, photoUrl),
      if (cvUrl != null) _write(StorageKeys.cvUrl, cvUrl),
    ]);

    // Nettoie l'ancienne clé legacy
    await _preferences.remove(StorageKeys.userRole);

    // Migration : une ancienne version de l'app a pu laisser du PII en clair
    // dans SharedPreferences. On l'efface après avoir migré vers le stockage
    // chiffré.
    await _purgeLegacyPlaintextProfile();
  }

  /// Supprime le PII éventuellement resté en clair dans SharedPreferences
  /// (installations antérieures à la migration vers le secure storage).
  Future<void> _purgeLegacyPlaintextProfile() async {
    const legacyKeys = [
      StorageKeys.firstName,
      StorageKeys.lastName,
      StorageKeys.email,
      StorageKeys.phone,
      StorageKeys.birthDate,
      StorageKeys.country,
      StorageKeys.city,
      StorageKeys.photoUrl,
      StorageKeys.cvUrl,
    ];
    final present =
        legacyKeys.where((key) => _preferences.getString(key) != null).toList();
    // Si une donnée n'existe que en clair (absente du stockage chiffré), on la
    // migre avant de purger.
    for (final key in present) {
      if (_secureCache.containsKey(key)) continue;
      final value = _preferences.getString(key);
      if (value != null && value.isNotEmpty) {
        await _secureStorage.write(key: key, value: value);
        _secureCache = {..._secureCache, key: value};
      }
    }
    if (present.isEmpty) return;
    await _preferences.remove(legacyKeys.first);
    for (final key in legacyKeys.skip(1)) {
      await _preferences.remove(key);
    }
  }

  Future<void> clearSession() async {
    await Future.wait([
      _secureStorage.delete(key: StorageKeys.authToken),
      _secureStorage.delete(key: StorageKeys.refreshToken),
      _secureStorage.delete(key: StorageKeys.firstName),
      _secureStorage.delete(key: StorageKeys.lastName),
      _secureStorage.delete(key: StorageKeys.email),
      _secureStorage.delete(key: StorageKeys.phone),
      _secureStorage.delete(key: StorageKeys.birthDate),
      _secureStorage.delete(key: StorageKeys.country),
      _secureStorage.delete(key: StorageKeys.city),
      _secureStorage.delete(key: StorageKeys.photoUrl),
      _secureStorage.delete(key: StorageKeys.cvUrl),
    ]);
    _secureCache = const {};
    await _preferences.remove(StorageKeys.userId);
    await _preferences.remove(StorageKeys.accountStatus);
    await _preferences.remove(StorageKeys.userRole);
  }

  /// Met à jour UNIQUEMENT les tokens après un refresh, sans toucher au
  /// profil. Nécessaire quand le user state n'est pas encore reconstruit
  /// (ex. refresh pendant initialize()) pour ne pas perdre la rotation.
  Future<void> updateTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _secureStorage.write(key: StorageKeys.authToken, value: accessToken);
    await _secureStorage.write(
        key: StorageKeys.refreshToken, value: refreshToken);
  }
}
