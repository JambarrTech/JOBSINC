import 'package:flutter/material.dart';

import 'app_colors.dart';

abstract final class AppTextStyles {
  static const fontFamily = 'Inter';
  static const display = TextStyle(fontFamily: fontFamily, fontSize: 32, fontWeight: FontWeight.w900, color: AppColors.text, height: 1.1, letterSpacing: -0.5);
  static const title = TextStyle(fontFamily: fontFamily, fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.text, height: 1.15, letterSpacing: -0.3);
  static const heading = TextStyle(fontFamily: fontFamily, fontSize: 19, fontWeight: FontWeight.w700, color: AppColors.text, height: 1.25);
  static const subheading = TextStyle(fontFamily: fontFamily, fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.text, height: 1.35);
  static const body = TextStyle(fontFamily: fontFamily, fontSize: 14.5, height: 1.5, color: AppColors.text, fontWeight: FontWeight.w400);
  static const bodyMedium = TextStyle(fontFamily: fontFamily, fontSize: 14, height: 1.45, color: AppColors.text, fontWeight: FontWeight.w500);
  static const muted = TextStyle(fontFamily: fontFamily, fontSize: 13, height: 1.4, color: AppColors.secondaryText);
  static const caption = TextStyle(fontFamily: fontFamily, fontSize: 12, height: 1.35, color: AppColors.secondaryText, fontWeight: FontWeight.w500);
  static const label = TextStyle(fontFamily: fontFamily, fontSize: 12, height: 1.3, color: AppColors.secondaryText, fontWeight: FontWeight.w700, letterSpacing: 0.4);
  static const button = TextStyle(fontFamily: fontFamily, fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 0.1);
  static const buttonSmall = TextStyle(fontFamily: fontFamily, fontSize: 13, fontWeight: FontWeight.w600);
}
