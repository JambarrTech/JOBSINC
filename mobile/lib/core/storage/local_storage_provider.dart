import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api_client.dart';
import 'local_storage.dart';

final localStorageProvider = FutureProvider<LocalStorage>((ref) async {
  return LocalStorage.create();
});

final apiClientRawProvider = Provider<ApiClient>((ref) => ApiClient());

final apiClientProvider = Provider((ref) {
  // ApiClient singleton injectable via Riverpod pour testabilité
  // Les repos doivent préférer ce provider plutôt que new ApiClient()
  return ref.watch(apiClientRawProvider);
});
