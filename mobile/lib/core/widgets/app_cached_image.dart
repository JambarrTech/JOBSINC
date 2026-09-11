import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../services/api_client.dart';
import '../theme/app_colors.dart';

class AppCachedImage extends StatelessWidget {
  const AppCachedImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.borderRadius,
    this.fit = BoxFit.cover,
    this.placeholder,
    this.errorWidget,
  });

  final String? url;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;
  final BoxFit fit;
  final Widget Function(BuildContext, String)? placeholder;
  final Widget Function(BuildContext, String, Object)? errorWidget;

  @override
  Widget build(BuildContext context) {
    final resolved = ApiClient.resolveUrl(url);

    if (resolved.isEmpty) {
      return _fallback();
    }

    final image = CachedNetworkImage(
      imageUrl: resolved,
      width: width,
      height: height,
      fit: fit,
      placeholder: placeholder ?? (_, __) => _loading(),
      errorWidget: errorWidget ?? (_, __, ___) => _fallback(),
      memCacheWidth: width?.toInt(),
      memCacheHeight: height?.toInt(),
    );

    if (borderRadius != null) {
      return ClipRRect(borderRadius: borderRadius!, child: image);
    }

    return image;
  }

  Widget _loading() {
    return Container(
      width: width,
      height: height,
      color: AppColors.background,
      child: const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
        ),
      ),
    );
  }

  Widget _fallback() {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: .10),
        borderRadius: borderRadius,
      ),
      child: Icon(
        Icons.business_outlined,
        color: AppColors.primary,
        size: (width ?? 40) * 0.45,
      ),
    );
  }
}
