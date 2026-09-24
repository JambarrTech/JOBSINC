import 'package:flutter/material.dart';

class AppTextField extends StatelessWidget {
  const AppTextField({super.key, required this.label, required this.controller, this.obscureText = false, this.keyboardType, this.prefixIcon, this.prefixText, this.hintText, this.validator, this.textInputAction, this.textCapitalization = TextCapitalization.none, this.onChanged, this.readOnly = false, this.onTap, this.autofillHints, this.autocorrect = true});
  final String label;
  final TextEditingController controller;
  final bool obscureText;
  final TextInputType? keyboardType;
  final IconData? prefixIcon;
  final String? prefixText;
  final String? hintText;
  final String? Function(String?)? validator;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final ValueChanged<String>? onChanged;
  final bool readOnly;
  final VoidCallback? onTap;
  final Iterable<String>? autofillHints;
  final bool autocorrect;
  @override
  Widget build(BuildContext context) => TextFormField(controller: controller, obscureText: obscureText, keyboardType: keyboardType, validator: validator, textInputAction: textInputAction, textCapitalization: textCapitalization, onChanged: onChanged, readOnly: readOnly, onTap: onTap, autofillHints: autofillHints, autocorrect: autocorrect, decoration: InputDecoration(labelText: label, hintText: hintText, prefixIcon: prefixIcon == null ? null : Icon(prefixIcon), prefixText: prefixText));
}
