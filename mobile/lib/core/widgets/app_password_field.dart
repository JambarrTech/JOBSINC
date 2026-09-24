import 'package:flutter/material.dart';

class AppPasswordField extends StatefulWidget {
  const AppPasswordField({super.key, required this.label, required this.controller, this.validator, this.onChanged, this.textInputAction, this.autofillHints, this.autocorrect = true});
  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final bool autocorrect;
  @override State<AppPasswordField> createState() => _AppPasswordFieldState();
}

class _AppPasswordFieldState extends State<AppPasswordField> {
  bool obscure = true;
  @override
  Widget build(BuildContext context) => TextFormField(
        controller: widget.controller,
        obscureText: obscure,
        validator: widget.validator,
        onChanged: widget.onChanged,
        textInputAction: widget.textInputAction,
        autofillHints: widget.autofillHints,
        autocorrect: widget.autocorrect,
        decoration: InputDecoration(labelText: widget.label, prefixIcon: const Icon(Icons.lock_outline), suffixIcon: IconButton(onPressed: () => setState(() => obscure = !obscure), icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined), tooltip: obscure ? 'Afficher le mot de passe' : 'Masquer le mot de passe')),
      );
}
