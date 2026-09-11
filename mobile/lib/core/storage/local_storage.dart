import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/storage_keys.dart';

class LocalStorage {
  LocalStorage(this._preferences, this._secureStorage);
  final SharedPreferences _preferences;
  final FlutterSecureStorage _secureStorage;

  static const _secureStorageStatic = FlutterSecureStorage();

  static Future<LocalStorage> create() async {
    final prefs = await SharedPreferences.getInstance();
    return LocalStorage(prefs, _secureStorageStatic);
  }

  bool get onboardingCompleted => _preferences.getBool(StorageKeys.onboardingCompleted) ?? false;
  Future<void> setOnboardingCompleted(bool value) => _preferences.setBool(StorageKeys.onboardingCompleted, value);

  Future<String?> get authToken async => await _secureStorage.read(key: StorageKeys.authToken);
  String? get userId => _preferences.getString(StorageKeys.userId);
  String? get accountStatus => _preferences.getString(StorageKeys.accountStatus) ?? _preferences.getString(StorageKeys.userRole);
  String? get firstName => _preferences.getString(StorageKeys.firstName);
  String? get lastName => _preferences.getString(StorageKeys.lastName);
  String? get email => _preferences.getString(StorageKeys.email);
  String? get phone => _preferences.getString(StorageKeys.phone);
  DateTime? get birthDate {
    final value = _preferences.getString(StorageKeys.birthDate);
    return value == null ? null : DateTime.tryParse(value);
  }
  String? get country => _preferences.getString(StorageKeys.country);
  String? get city => _preferences.getString(StorageKeys.city);
  String? get photoUrl => _preferences.getString(StorageKeys.photoUrl);
  String? get cvUrl => _preferences.getString(StorageKeys.cvUrl);

  Future<void> saveSession({required String token, required String id, required String status, required String firstName, String? lastName, String? email, String? phone, DateTime? birthDate, String? country, String? city, String? photoUrl, String? cvUrl}) async {
    await _secureStorage.write(key: StorageKeys.authToken, value: token);
    await _preferences.setString(StorageKeys.userId, id);
    await _preferences.setString(StorageKeys.accountStatus, status);
    await _preferences.setString(StorageKeys.firstName, firstName);
    if (lastName != null) await _preferences.setString(StorageKeys.lastName, lastName);
    if (email != null) await _preferences.setString(StorageKeys.email, email);
    if (phone != null) await _preferences.setString(StorageKeys.phone, phone);
    if (birthDate != null) await _preferences.setString(StorageKeys.birthDate, birthDate.toIso8601String());
    if (country != null) await _preferences.setString(StorageKeys.country, country);
    if (city != null) await _preferences.setString(StorageKeys.city, city);
    if (photoUrl != null) await _preferences.setString(StorageKeys.photoUrl, photoUrl);
    if (cvUrl != null) await _preferences.setString(StorageKeys.cvUrl, cvUrl);
  }

  Future<void> clearSession() async {
    await _secureStorage.delete(key: StorageKeys.authToken);
    await _preferences.remove(StorageKeys.userId);
    await _preferences.remove(StorageKeys.accountStatus);
    await _preferences.remove(StorageKeys.userRole);
    await _preferences.remove(StorageKeys.firstName);
    await _preferences.remove(StorageKeys.lastName);
    await _preferences.remove(StorageKeys.email);
    await _preferences.remove(StorageKeys.phone);
    await _preferences.remove(StorageKeys.birthDate);
    await _preferences.remove(StorageKeys.country);
    await _preferences.remove(StorageKeys.city);
    await _preferences.remove(StorageKeys.photoUrl);
    await _preferences.remove(StorageKeys.cvUrl);
  }
}
