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
    this.semanticLabel,
  });

  final String? url;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;
  final BoxFit fit;
  final Widget Function(BuildContext, String)? placeholder;
  final Widget Function(BuildContext, String, Object)? errorWidget;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final resolved = ApiClient.resolveUrl(url);

    if (resolved.isEmpty) {
      return _fallback();
    }

    final dpr = MediaQuery.maybeOf(context)?.devicePixelRatio ?? 1.0;
    final image = CachedNetworkImage(
      imageUrl: resolved,
      width: width,
      height: height,
      fit: fit,
      placeholder: placeholder ?? (_, __) => _loading(),
      errorWidget: errorWidget ?? (_, __, ___) => _fallback(),
      memCacheWidth: width != null ? (width! * dpr).toInt() : null,
      memCacheHeight: height != null ? (height! * dpr).toInt() : null,
      imageBuilder: semanticLabel != null ? (context, imageProvider) => Semantics(label: semanticLabel, image: true, child: Image(image: imageProvider, width: width, height: height, fit: fit)) : null,
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
