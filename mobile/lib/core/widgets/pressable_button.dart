import 'package:flutter/material.dart';

class PressableButton extends StatefulWidget {
  const PressableButton({super.key, required this.child});
  final Widget child;

  @override
  State<PressableButton> createState() => _PressableButtonState();
}

class _PressableButtonState extends State<PressableButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 100),
        child: Opacity(
          opacity: _pressed ? 0.8 : 1.0,
          child: widget.child,
        ),
      ),
    );
  }
}
