import 'package:flutter/material.dart';

/// Enveloppe purement VISUELLE : applique un effet d'enfoncement à son enfant.
///
/// Ce n'est pas un bouton, et c'est délibéré.
///
/// 1. Aucun `Semantics(button: true)`. Le composant ne possède pas le tap :
///    l'enfant le possède (un `IconButton`, un `FilledButton`...). En
///    annonçant `button: true`, on créait un second nœud de sémantique IMBRIQUÉ
///    dans celui de l'enfant. Sur le favori de `job_feed_card.dart`, un lecteur
///    d'écran annonçait donc « bouton, bouton, Sauvegarder cette offre » : la
///    double annonce est le symptôme, et les deux nœuds étaient imbriqués, donc
///    non focusables au clavier de façon fiable.
///
/// 2. Aucun `GestureDetector`. `GestureDetector` enregistre des
///    `TapGestureRecognizer` dans l'arène de gestes du POINTER, en concurrence
///    directe avec ceux de l'enfant : imbriqué dans un `IconButton`, il pouvait
///    faire annuler la reconnaissance du parent, et l'appui pouvait être
///    entièrement mangé selon l'ordre d'arrivée. On utilise `Listener`, qui ne
///    crée AUCUN recognizer : il ne fait qu'observer le flux de pointers brut.
///    Un seul gestionnaire de tap existe désormais dans l'arbre, celui de
///    l'enfant.
///
/// Le `setState` reste borné à trois transitions (down / up / cancel).
class PressableButton extends StatefulWidget {
  const PressableButton({super.key, required this.child});
  final Widget child;

  @override
  State<PressableButton> createState() => _PressableButtonState();
}

class _PressableButtonState extends State<PressableButton> {
  bool _pressed = false;

  void _setPressed(bool value) {
    // Garde-fou : `onPointerUp` / `onPointerCancel` peuvent être routés après
    // un démontage de l'arbre (navigation depuis l'appui lui-même). Sans ce
    // test, le `setState` lève `setState() called after dispose()` en prod.
    if (!mounted || _pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => _setPressed(true),
      onPointerUp: (_) => _setPressed(false),
      onPointerCancel: (_) => _setPressed(false),
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
