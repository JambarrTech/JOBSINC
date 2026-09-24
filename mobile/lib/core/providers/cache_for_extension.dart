import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Extension qui garde un provider en cache pendant [duration] après que le
/// dernier listener se soit désabonné. Implémente le pattern
/// `ref.keepAlive()` + `Timer` recommandé par Riverpod.
///
/// - Pour les providers `autoDispose`, garde réellement en cache puis libère
///   après [duration].
/// - Pour les providers non-autoDispose, le cache est naturel (pas de dispose)
///   : l'extension est no-op côté keepAlive mais reste appelable pour
///   uniformiser les call-sites.
extension CacheForExtension on Ref {
  void cacheFor(Duration duration) {
    try {
      final dynamic self = this;
      final KeepAliveLink link = self.keepAlive() as KeepAliveLink;
      Timer(duration, link.close);
    } catch (_) {
      // Provider non-autoDispose : déjà en cache permanent.
    }
  }
}

// Compatibilité : pour les providers encore déclarés en autoDispose,
// on expose la même extension sur l'ancien type (deprecated).
// ignore: deprecated_member_use
extension AutoDisposeCacheForExtension on AutoDisposeRef {
  void cacheFor(Duration duration) {
    final link = keepAlive();
    Timer(duration, link.close);
  }
}
