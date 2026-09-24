import 'package:flutter/material.dart';

abstract final class AppColors {
  // ── Charte JOBSINC unifiée : bleu + blanc ──
  static const primary = Color(0xFF0B5FE0);
  static const primaryDark = Color(0xFF0644B0);
  static const primaryLight = Color(0xFF3B8BFF);
  static const navy = Color(0xFF071D3A);
  static const navyLight = Color(0xFF0C2D54);

  /// Accent bleu clair (ex-vert / turquoise) — unique couleur d'accent.
  static const accent = primaryLight;

  static const background = Color(0xFFF4F7FB);
  static const surface = Color(0xFFFFFFFF);
  static const white = Colors.white;
  static const text = Color(0xFF0B1A2E);
  static const secondaryText = Color(0xFF5A6E88);
  static const tertiaryText = Color(0xFF7A8FA8);

  // Sémantique : vert distinct de l'accent bleu pour succès
  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFF7B731);
  static const error = Color(0xFFE74C3C);

  static const border = Color(0xFFE0E8F0);
  static const borderLight = Color(0xFFF0F4F8);
  static const shadow = Color(0x0D0B1A2E);
  static const shadowMedium = Color(0x1A0B1A2E);

  static const gradient = LinearGradient(
    colors: [primary, primaryLight],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const gradientNavy = LinearGradient(
    colors: [navy, navyLight],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
}