/// Configuration globale de l'application JOBSINC.
///
/// L'URL du backend n'est pas codée en dur dans les services : elle est lue
/// ici depuis `--dart-define=API_URL`. Défaut : backend local
/// (`http://127.0.0.1:5000/api`, serveur `npm run dev` + `adb reverse`
/// sur device USB). Pour la prod Render :
/// `flutter run --dart-define=API_URL=https://jobsinc.onrender.com/api`.
class AppConfig {
  /// URL racine de l'API (suffixe `/api` inclus).
  static const apiBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://127.0.0.1:5000/api',
  );
}