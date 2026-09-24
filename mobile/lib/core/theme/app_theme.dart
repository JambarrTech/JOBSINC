import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_colors.dart';
import 'app_text_styles.dart';

abstract final class JobsincTheme {
  static ThemeData get light => ThemeData(
        useMaterial3: true,
        fontFamily: AppTextStyles.fontFamily,
        scaffoldBackgroundColor: AppColors.background,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          primary: AppColors.primary,
          secondary: AppColors.primaryLight,
          surface: AppColors.surface,
          error: AppColors.error,
          brightness: Brightness.light,
        ),
        textTheme: const TextTheme(
          displayLarge: AppTextStyles.display,
          headlineLarge: AppTextStyles.title,
          headlineMedium: AppTextStyles.heading,
          titleLarge: AppTextStyles.heading,
          titleMedium: AppTextStyles.subheading,
          bodyLarge: AppTextStyles.body,
          bodyMedium: AppTextStyles.bodyMedium,
          bodySmall: AppTextStyles.muted,
          labelLarge: AppTextStyles.button,
          labelMedium: AppTextStyles.buttonSmall,
          labelSmall: AppTextStyles.caption,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.background,
          foregroundColor: AppColors.text,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          systemOverlayStyle: SystemUiOverlayStyle.dark,
          titleTextStyle: TextStyle(
            fontFamily: AppTextStyles.fontFamily,
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppColors.text,
            letterSpacing: -0.2,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.surface,
          hintStyle: const TextStyle(fontFamily: AppTextStyles.fontFamily, color: AppColors.tertiaryText, fontSize: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.border, width: 1),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.border, width: 1),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.primary, width: 1.8),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.error, width: 1),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        ),
        cardTheme: CardThemeData(
          color: AppColors.surface,
          elevation: 0,
          margin: EdgeInsets.zero,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: AppColors.borderLight, width: 1),
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: AppColors.surface,
          elevation: 0,
          height: 76,
          indicatorColor: AppColors.primary.withValues(alpha: .08),
          labelTextStyle: WidgetStateProperty.all(
            const TextStyle(fontFamily: AppTextStyles.fontFamily, fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.secondaryText),
          ),
        ),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          backgroundColor: AppColors.navy,
          contentTextStyle: const TextStyle(fontFamily: AppTextStyles.fontFamily, color: Colors.white, fontSize: 14),
        ),
        dividerTheme: const DividerThemeData(
          color: AppColors.borderLight,
          thickness: 1,
          space: 1,
        ),
        chipTheme: ChipThemeData(
          backgroundColor: AppColors.background,
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          labelStyle: const TextStyle(fontFamily: AppTextStyles.fontFamily, fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryText),
        ),
      );

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        fontFamily: AppTextStyles.fontFamily,
        scaffoldBackgroundColor: AppColors.navy,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          primary: AppColors.primaryLight,
          surface: const Color(0xFF112542),
          error: AppColors.error,
          brightness: Brightness.dark,
        ),
        textTheme: const TextTheme(
          displayLarge: TextStyle(fontFamily: AppTextStyles.fontFamily, fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white, height: 1.1, letterSpacing: -0.5),
          headlineLarge: TextStyle(fontFamily: AppTextStyles.fontFamily, fontSize: 26, fontWeight: FontWeight.w800, color: Colors.white, height: 1.15),
          bodyLarge: TextStyle(fontFamily: AppTextStyles.fontFamily, fontSize: 14.5, height: 1.5, color: Colors.white),
          labelLarge: TextStyle(fontFamily: AppTextStyles.fontFamily, fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.navy,
          foregroundColor: Colors.white,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          systemOverlayStyle: SystemUiOverlayStyle.light,
        ),
        cardTheme: const CardThemeData(
          color: Color(0xFF112542),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16)), side: BorderSide(color: Color(0xFF1E3A5F))),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: AppColors.navy,
          elevation: 0,
          height: 76,
          indicatorColor: Color(0x333B8BFF),
        ),
      );
}
