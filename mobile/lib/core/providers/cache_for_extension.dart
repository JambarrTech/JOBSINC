import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Extension qui garde un provider en cache pendant [duration] après que le
/// dernier listener se soit désabonné. Implémente le pattern
/// `ref.keepAlive()` + `Timer` recommandé par Riverpod.
///
/// - Pour les providers `autoDispose`, garde réellement en cache puis libère
///   après [duration].
///
/// - Pour les providers NON-autoDispose, l'appel est un NO-OP : ces providers
///   ne sont jamais libérés, donc ils sont déjà en cache — indéfiniment, pas
///   [duration]. C'est le comportement voulu, mais il faut le dire clairement :
///   les 9 appelants actuels (`homeDashboardProvider`, `jobsProvider`,
///   `savedJobsProvider`, `similarJobsProvider`, `applicationsProvider`,
///   `messagesProvider`, `notificationsProvider`, `candidateProfileProvider`)
///   sont tous des `FutureProvider` / `NotifierProvider` classiques, donc
///   `cacheFor` y est sans effet. La durée de 5 minutes qu'ils passent est
///   COSMÉTIQUE : elle ne borne rien.
///
///   Écrire `ref.cacheFor(Duration(minutes: 5))` sur un provider non-autoDispose
///   laisse croire à une expiration qui n'a pas lieu. Les deux options honnêtes
///   sont : passer le provider en `autoDispose` (vrai cache, avec libération),
///   ou retirer l'appel. On ne change rien ici : c'est un contrat de durée de
///   vie, pas une correction de bug, et rendre ces providers autoDispose
///   augmenterait le nombre de requêtes réseau.
extension CacheForExtension on Ref {
  void cacheFor(Duration duration) {
    try {
      final dynamic self = this;
      final KeepAliveLink link = self.keepAlive() as KeepAliveLink;
      Timer(duration, link.close);
    } catch (_) {
      // Provider non-autoDispose : jamais.dispose, donc déjà en cache
      // permanent. La durée demandée ne s'applique pas — voir la doc ci-dessus.
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
