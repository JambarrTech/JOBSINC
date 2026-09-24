/// Configuration globale de l'application JOBSINC.
///
/// L'URL du backend n'est pas codée en dur dans les services : elle est lue
/// ici depuis `--dart-define=API_URL`. Sans défini, on retombe sur le localhost
/// de l'appareil, qui atteint le poste de dev via `adb reverse tcp:5000 tcp:5000`
/// (émulateur ou téléphone réel en USB).
class AppConfig {
  /// URL racine de l'API (suffixe `/api` inclus).
  /// Par défaut : backend en ligne Render (prod). Pour dev local :
  /// `flutter run --dart-define=API_URL=http://127.0.0.1:5000/api` (+ `adb reverse tcp:5000 tcp:5000` si device USB)
  /// ou LAN `http://192.168.1.9:5000/api`.
  static const apiBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://jobsinc.onrender.com/api',
  );
}