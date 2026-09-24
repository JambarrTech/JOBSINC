import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/storage/local_storage.dart';
import '../../../core/constants/app_assets.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_feedback.dart';
import '../../../core/widgets/app_password_field.dart';
import '../../../core/widgets/app_text_field.dart';
import '../models/auth_user.dart';
import '../providers/auth_provider.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  bool _navigated = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final storage = await LocalStorage.create();

    await ref.read(authProvider.notifier).initialize();

    if (!mounted || _navigated) return;
    _navigated = true;

    final auth = ref.read(authProvider);

    if (auth.status == AuthStatus.authenticated && auth.user != null) {
      final status = auth.user!.status;

      if (status == AccountStatus.recruiter) {
        context.go('/recruiter/dashboard');
      } else if (status == AccountStatus.employee) {
        context.go('/employee/dashboard');
      } else {
        context.go('/candidate/home');
      }
    } else {
      if (storage.onboardingCompleted) {
        context.go('/login');
      } else {
        context.go('/onboarding');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            color: AppColors.primary,
          ),
        ),
      ),
    );
  }
}

// ============================================================
// ONBOARDING
// ============================================================

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  late final PageController controller;

  final pages = const [
    (
      'Connectez-vous aux bonnes opportunités',
      'Découvrez un réseau professionnel qui rapproche les talents et les entreprises.',
      AppAssets.introTeam,
      'Équipe professionnelle réunie autour d’un projet',
    ),
    (
      'Trouvez un emploi qui vous correspond',
      'Recherchez rapidement des offres selon votre métier, vos compétences et votre localisation.',
      AppAssets.heroTeam,
      'Professionnels réunis autour d’un ordinateur',
    ),
    (
      'Suivez votre parcours professionnel',
      'Envoyez vos candidatures et suivez chaque étape de votre recrutement depuis JOBSINC.',
      AppAssets.heroRecruitment,
      'Entretien professionnel et recrutement',
    ),
    (
      'Construisez votre avenir professionnel',
      'Explorez les opportunités et suivez votre parcours avec JOBSINC.',
      AppAssets.introCompany,
      'Environnement professionnel moderne',
    ),
  ];

  int index = 0;

  @override
  void initState() {
    super.initState();
    controller = PageController();
  }

  Future<void> _finish() async {
    final storage = await LocalStorage.create();

    await storage.setOnboardingCompleted(true);

    if (!mounted) return;

    context.go('/login');
  }

  void _next() {
    if (index == pages.length - 1) {
      _finish();
      return;
    }

    controller.nextPage(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: controller,
                itemCount: pages.length,
                onPageChanged: (value) {
                  setState(() {
                    index = value;
                  });
                },
                itemBuilder: (_, i) {
                  return _OnboardingPage(
                    data: pages[i],
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                pages.length,
                (i) {
                  return Semantics(
                    selected: i == index,
                    label: 'Page ${i + 1} sur 4',
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.symmetric(
                        horizontal: 4,
                      ),
                      width: i == index ? 24 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: i == index ? AppColors.primary : AppColors.border,
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                24,
                24,
                24,
                12,
              ),
              child: AppButton(
                label: index == pages.length - 1 ? 'Commencer' : 'Suivant',
                icon: index == pages.length - 1
                    ? Icons.check
                    : Icons.arrow_forward,
                onPressed: _next,
              ),
            ),
            TextButton(
              onPressed: _finish,
              child: const Text('Passer'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _OnboardingPage extends StatelessWidget {
  const _OnboardingPage({
    required this.data,
  });

  final (String, String, String, String) data;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        20,
        32,
        20,
        20,
      ),
      child: Column(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: AspectRatio(
              aspectRatio: 1.55,
              child: Image.asset(
                data.$3,
                fit: BoxFit.cover,
                semanticLabel: data.$4,
              ),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            data.$1,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          Text(
            data.$2,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: AppColors.secondaryText,
                ),
          ),
          const Spacer(),
        ],
      ),
    );
  }
}

// ============================================================
// LOGIN
// ============================================================

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final formKey = GlobalKey<FormState>();

  final email = TextEditingController();
  final password = TextEditingController();

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) {
      return;
    }

    final success = await ref.read(authProvider.notifier).signIn(
          email: email.text.trim(),
          password: password.text,
        );

    if (!mounted || !success) {
      return;
    }

    final user = ref.read(authProvider).user;

    if (user == null) {
      return;
    }

    if (user.status == AccountStatus.candidate) {
      context.go('/candidate/home');
    } else if (user.status == AccountStatus.recruiter) {
      context.go('/recruiter/dashboard');
    } else {
      context.go('/employee/dashboard');
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return AuthLayout(
      title: 'Connexion',
      subtitle: 'Retrouvez les opportunités qui vous correspondent.',
      child: Form(
        key: formKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: Column(
          children: [
            AppTextField(
              label: 'Adresse email',
              controller: email,
              keyboardType: TextInputType.emailAddress,
              prefixIcon: Icons.email_outlined,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.next,
              autocorrect: false,
              validator: Validators.email,
            ),
            const SizedBox(height: 16),
            AppPasswordField(
              label: 'Mot de passe',
              controller: password,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.done,
              autocorrect: false,
              validator: Validators.password,
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () {
                  context.go('/forgot-password');
                },
                child: const Text(
                  'Mot de passe oublié ?',
                ),
              ),
            ),
            if (authState.status == AuthStatus.error &&
                authState.message != null) ...[
              const SizedBox(height: 8),
              _InlineAuthError(
                message: authState.message!,
              ),
            ],
            const SizedBox(height: 20),
            _AuthButton(
              label: 'Se connecter',
              loadingLabel: 'Connexion...',
              onPressed: _submit,
              ref: ref,
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text(
                  'Pas encore de compte ?',
                  style: TextStyle(
                    color: Colors.white,
                  ),
                ),
                TextButton(
                  onPressed: () {
                    context.go('/register');
                  },
                  child: const Text('Inscription'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// REGISTER
// ============================================================

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final formKey = GlobalKey<FormState>();

  final firstName = TextEditingController();
  final lastName = TextEditingController();
  final birthDateController = TextEditingController();
  final email = TextEditingController();
  final phone = TextEditingController();
  final city = TextEditingController();
  final password = TextEditingController();
  final confirmation = TextEditingController();

  static const countryCodes = <String, String>{
    'Sénégal': '+221',
    'Côte d’Ivoire': '+225',
    'Mali': '+223',
    'Burkina Faso': '+226',
    'France': '+33',
    'Canada': '+1',
  };

  File? _avatar;
  DateTime? birthDate;

  String country = 'Sénégal';

  int step = 0;
  int passwordStrength = 0;

  bool acceptedTerms = false;

  String? termsError;

  @override
  void dispose() {
    firstName.dispose();
    lastName.dispose();
    birthDateController.dispose();
    email.dispose();
    phone.dispose();
    city.dispose();
    password.dispose();
    confirmation.dispose();
    super.dispose();
  }

  // ----------------------------------------------------------
  // DATE DE NAISSANCE ET AVATAR
  // ----------------------------------------------------------

  Future<void> _pickAvatar() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      maxHeight: 2048,
    );
    if (picked != null) {
      final file = File(picked.path);
      final size = await file.length();
      if (size > 15 * 1024 * 1024) {
        if (!mounted) return;
        AppFeedback.error(context, 'L\'image ne doit pas dépasser 15 Mo.');
        return;
      }
      setState(() {
        _avatar = file;
      });
    }
  }

  Future<void> _pickBirthDate() async {
    final today = DateTime.now();

    final selected = await showDatePicker(
      context: context,
      initialDate: birthDate ??
          DateTime(
            today.year - 25,
            today.month,
            today.day,
          ),
      firstDate: DateTime(
        today.year - 100,
        today.month,
        today.day,
      ),
      lastDate: DateTime(
        today.year,
        today.month,
        today.day,
      ),
      locale: const Locale('fr', 'FR'),
      helpText: 'Sélectionnez votre date de naissance',
      cancelText: 'Annuler',
      confirmText: 'Valider',
    );

    if (selected == null || !mounted) {
      return;
    }

    setState(() {
      birthDate = selected;
      birthDateController.text = _formatDate(selected);
    });
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/'
        '${date.year}';
  }

  int _age(DateTime date) {
    final today = DateTime.now();

    var age = today.year - date.year;

    if (today.month < date.month ||
        (today.month == date.month && today.day < date.day)) {
      age--;
    }

    return age;
  }

  String? _birthDateValidator() {
    if (birthDate == null) {
      return 'La date de naissance est obligatoire.';
    }

    final age = _age(birthDate!);

    if (age < 16) {
      return 'Vous devez avoir au moins 16 ans pour utiliser JOBSINC.';
    }

    if (age > 100) {
      return 'Veuillez vérifier votre date de naissance.';
    }

    return null;
  }

  // ----------------------------------------------------------
  // TELEPHONE
  // ----------------------------------------------------------

  String _normalizePhone() {
    final countryPrefix = countryCodes[country] ?? '+221';

    final prefix = countryPrefix.replaceAll('+', '');

    var digits = phone.text.replaceAll(
      RegExp(r'\D'),
      '',
    );

    if (digits.startsWith(prefix)) {
      digits = digits.substring(prefix.length);
    }

    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }

    return '+$prefix$digits';
  }

  // ----------------------------------------------------------
  // MOT DE PASSE
  // ----------------------------------------------------------

  int _getPasswordStrength(String value) {
    if (value.isEmpty) {
      return 0;
    }

    var score = 0;

    if (value.length >= 8) {
      score++;
    }

    if (RegExp(r'[A-Za-z]').hasMatch(value)) {
      score++;
    }

    if (RegExp(r'\d').hasMatch(value)) {
      score++;
    }

    if (RegExp(r'[^A-Za-z0-9]').hasMatch(value)) {
      score++;
    }

    return score;
  }

  // ----------------------------------------------------------
  // ETAPE 1
  // ----------------------------------------------------------

  void _continue() {
    final valid = formKey.currentState?.validate() ?? false;

    final birthError = _birthDateValidator();

    if (!valid || birthError != null) {
      setState(() {});
      return;
    }

    setState(() {
      step = 1;
    });
  }

  // ----------------------------------------------------------
  // INSCRIPTION
  // ----------------------------------------------------------

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) {
      return;
    }

    if (birthDate == null) {
      setState(() {});
      return;
    }

    if (!acceptedTerms) {
      setState(() {
        termsError = 'Veuillez accepter les conditions pour continuer.';
      });

      return;
    }

    final success = await ref.read(authProvider.notifier).register(
          firstName: firstName.text.trim(),
          lastName: lastName.text.trim(),
          birthDate: birthDate!,
          email: email.text.trim(),
          phone: _normalizePhone(),
          country: country,
          city: city.text.trim(),
          password: password.text,
          avatar: _avatar,
        );

    if (!mounted || !success) {
      return;
    }

    context.go('/candidate/home');
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return AuthLayout(
      title: 'Créer votre compte',
      subtitle:
          'Rejoignez JOBSINC et trouvez votre prochaine opportunité professionnelle.',
      child: Form(
        key: formKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: step == 0 ? _buildPersonalStep() : _buildAccountStep(authState),
      ),
    );
  }

  // ----------------------------------------------------------
  // ETAPE PERSONNELLE
  // ----------------------------------------------------------

  Widget _buildPersonalStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _RegisterProgress(step: 0),
        const SizedBox(height: 24),
        const Text(
          'Parlez-nous de vous',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Ces informations nous aideront à personnaliser votre expérience.',
          style: TextStyle(
            color: Colors.white70,
          ),
        ),
        const SizedBox(height: 22),
        Center(
          child: Semantics(
            label: 'Modifier la photo de profil',
            button: true,
            child: GestureDetector(
              onTap: _pickAvatar,
              child: CircleAvatar(
                radius: 40,
                backgroundColor: AppColors.border,
                backgroundImage: _avatar != null ? FileImage(_avatar!) : null,
                child: _avatar == null ? const Icon(Icons.add_a_photo, size: 30, color: Colors.white70) : null,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        AppTextField(
          label: 'Prénom *',
          controller: firstName,
          prefixIcon: Icons.person_outline,
          textCapitalization: TextCapitalization.words,
          validator: (value) {
            return Validators.name(
              value,
              label: 'Le prénom',
            );
          },
        ),
        const SizedBox(height: 16),
        AppTextField(
          label: 'Nom *',
          controller: lastName,
          prefixIcon: Icons.badge_outlined,
          textCapitalization: TextCapitalization.words,
          validator: (value) {
            return Validators.name(
              value,
              label: 'Le nom',
            );
          },
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: birthDateController,
          readOnly: true,
          onTap: _pickBirthDate,
          validator: (_) => _birthDateValidator(),
          decoration: const InputDecoration(
            labelText: 'Date de naissance *',
            prefixIcon: Icon(Icons.calendar_month_outlined),
            suffixIcon: Icon(Icons.keyboard_arrow_down_outlined),
          ),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: country,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Pays *',
            prefixIcon: Icon(
              Icons.public_outlined,
            ),
          ),
          items: countryCodes.keys.map(
            (value) {
              return DropdownMenuItem<String>(
                value: value,
                child: Text(value),
              );
            },
          ).toList(),
          onChanged: (value) {
            if (value == null) {
              return;
            }

            setState(() {
              country = value;
            });
          },
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Le pays est obligatoire.';
            }

            return null;
          },
        ),
        const SizedBox(height: 16),
        AppTextField(
          label: 'Ville / commune *',
          controller: city,
          prefixIcon: Icons.location_city_outlined,
          textCapitalization: TextCapitalization.words,
          validator: (value) {
            return Validators.required(
              value,
              label: 'La ville',
            );
          },
        ),
        const SizedBox(height: 24),
        AppButton(
          label: 'Continuer',
          icon: Icons.arrow_forward,
          onPressed: _continue,
        ),
        const SizedBox(height: 8),
        Center(
          child: TextButton(
            onPressed: () {
              context.go('/login');
            },
            child: const Text(
              'Déjà un compte ? Se connecter',
            ),
          ),
        ),
      ],
    );
  }

  // ----------------------------------------------------------
  // ETAPE COMPTE
  // ----------------------------------------------------------

  Widget _buildAccountStep(AuthState authState) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _RegisterProgress(step: 1),
        const SizedBox(height: 24),
        const Text(
          'Créez votre compte',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Vos coordonnées resteront associées à votre compte candidat.',
          style: TextStyle(
            color: Colors.white70,
          ),
        ),
        const SizedBox(height: 22),
        AppTextField(
          label: 'Adresse e-mail *',
          controller: email,
          keyboardType: TextInputType.emailAddress,
          prefixIcon: Icons.email_outlined,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.email],
          autocorrect: false,
          validator: Validators.email,
        ),
        const SizedBox(height: 16),
        AppTextField(
          label: 'Téléphone *',
          controller: phone,
          keyboardType: TextInputType.phone,
          prefixIcon: Icons.phone_outlined,
          prefixText: '${countryCodes[country]}  ',
          hintText: '77 123 45 67',
          validator: Validators.phone,
        ),
        const SizedBox(height: 16),
        AppPasswordField(
          label: 'Mot de passe *',
          controller: password,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.newPassword],
          autocorrect: false,
          onChanged: (value) {
            setState(() {
              passwordStrength = _getPasswordStrength(value);
            });
          },
          validator: Validators.password,
        ),
        const SizedBox(height: 8),
        _PasswordStrengthIndicator(
          strength: passwordStrength,
        ),
        const SizedBox(height: 16),
        AppPasswordField(
          label: 'Confirmation du mot de passe *',
          controller: confirmation,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.newPassword],
          autocorrect: false,
          validator: (value) {
            return Validators.confirmation(
              value,
              password.text,
            );
          },
        ),
        const SizedBox(height: 8),
        const Text(
          '8 caractères minimum, avec au moins une lettre et un chiffre.',
          style: TextStyle(
            fontSize: 12,
            color: Colors.white70,
          ),
        ),
        const SizedBox(height: 16),
        CheckboxListTile(
          value: acceptedTerms,
          onChanged: (value) {
            setState(() {
              acceptedTerms = value ?? false;
              termsError = null;
            });
          },
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text(
            'J’accepte les conditions d’utilisation et la politique de confidentialité.',
            style: TextStyle(
              color: Colors.white,
              fontSize: 13,
            ),
          ),
        ),
        if (termsError != null)
          Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Text(
              termsError!,
              style: const TextStyle(
                color: Color(0xFFFFD1D1),
                fontSize: 12,
              ),
            ),
          ),
        if (authState.status == AuthStatus.error &&
            authState.message != null) ...[
          const SizedBox(height: 12),
          _InlineAuthError(
            message: authState.message!,
          ),
        ],
        const SizedBox(height: 20),
        _AuthButton(
          label: 'Créer mon compte',
          loadingLabel: 'Création du compte...',
          onPressed: _submit,
          ref: ref,
          enabled: acceptedTerms,
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextButton(
                onPressed: () {
                  setState(() {
                    step = 0;
                  });
                },
                child: const Text('Retour'),
              ),
            ),
            Expanded(
              child: TextButton(
                onPressed: () {
                  context.go('/login');
                },
                child: const Text(
                  'Se connecter',
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ============================================================
// PROGRESSION INSCRIPTION
// ============================================================

class _RegisterProgress extends StatelessWidget {
  const _RegisterProgress({
    required this.step,
  });

  final int step;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Étape ${step + 1} sur 2',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _ProgressBar(
                active: step >= 0,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ProgressBar(
                active: step >= 1,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({
    required this.active,
  });

  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 5,
      decoration: BoxDecoration(
        color: active ? Colors.white : Colors.white38,
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }
}

// ============================================================
// FORCE MOT DE PASSE
// ============================================================

class _PasswordStrengthIndicator extends StatelessWidget {
  const _PasswordStrengthIndicator({
    required this.strength,
  });

  final int strength;

  @override
  Widget build(BuildContext context) {
    final label = strength >= 4
        ? 'Fort'
        : strength >= 2
            ? 'Moyen'
            : 'Faible';

    final color = strength >= 4
        ? AppColors.success
        : strength >= 2
            ? AppColors.warning
            : const Color(0xFFFFB4AB);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: strength / 4,
            minHeight: 6,
            backgroundColor: Colors.white38,
            color: color,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          'Sécurité du mot de passe : $label',
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

// ============================================================
// ERREUR AUTHENTIFICATION
// ============================================================

class _InlineAuthError extends StatelessWidget {
  const _InlineAuthError({
    required this.message,
  });

  final String message;

  @override
  Widget build(BuildContext context) {
    return AppInlineMessage(message: message, type: FeedbackType.error);
  }
}

// ============================================================
// MOT DE PASSE OUBLIE
// ============================================================

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final formKey = GlobalKey<FormState>();

  final email = TextEditingController();

  bool submitted = false;
  bool isLoading = false;
  String? error;

  @override
  void dispose() {
    email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      isLoading = true;
      error = null;
    });

    // L'appel réseau est porté par AuthController (pas de ApiClient() créé
    // dans un widget) pour centraliser la couche d'accès.
    final result = await ref.read(authProvider.notifier).forgotPassword(
          email.text.trim(),
        );
    if (!mounted) return;

    setState(() {
      isLoading = false;
      if (result == null) {
        submitted = true;
      } else {
        error = result;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AuthLayout(
      title: 'Mot de passe oublié',
      subtitle: 'Saisissez votre email pour récupérer votre compte.',
      child: Form(
        key: formKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: Column(
          children: [
            AppTextField(
              label: 'Adresse email',
              controller: email,
              keyboardType: TextInputType.emailAddress,
              prefixIcon: Icons.email_outlined,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.done,
              autocorrect: false,
              validator: Validators.email,
            ),
            const SizedBox(height: 24),
            AppButton(
              label: isLoading ? 'Envoi en cours...' : 'Envoyer le lien',
              onPressed: isLoading ? null : _submit,
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.error),
                ),
              ),
            if (submitted)
              const Padding(
                padding: EdgeInsets.only(top: 16),
                child: Text(
                  'Si cet email existe, un lien de réinitialisation a été envoyé.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.success,
                  ),
                ),
              ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () {
                context.go('/login');
              },
              child: const Text(
                'Retour à la connexion',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// LAYOUT AUTHENTIFICATION
// ============================================================

class AuthLayout extends StatelessWidget {
  const AuthLayout({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            AppAssets.authBackground,
            fit: BoxFit.cover,
          ),

          // Overlay navy 55% (0x8C082B52 ~ 140/255) pour contraste AA texte blanc sur image.
          ColoredBox(
            color: AppColors.navy.withValues(
              alpha: 0.55, // 0x8C082B52
            ),
          ),

          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: 520,
                ),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    16,
                    20,
                    16,
                    20,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      24,
                      28,
                      24,
                      24,
                    ),
                    child: Theme(
                      data: Theme.of(context).copyWith(
                        textButtonTheme: TextButtonThemeData(
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: Theme.of(
                              context,
                            ).textTheme.headlineMedium?.copyWith(
                                  color: Colors.white,
                                ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            subtitle,
                            style: Theme.of(
                              context,
                            ).textTheme.bodyLarge?.copyWith(
                                  color: Colors.white.withValues(
                                    alpha: 0.92,
                                  ),
                                ),
                          ),
                          const SizedBox(height: 28),
                          child,
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// BOUTON AUTHENTIFICATION
// ============================================================

class _AuthButton extends ConsumerWidget {
  const _AuthButton({
    required this.label,
    required this.onPressed,
    required this.ref,
    this.loadingLabel,
    this.enabled = true,
  });

  final String label;
  final Future<void> Function() onPressed;
  final WidgetRef ref;
  final String? loadingLabel;
  final bool enabled;

  @override
  Widget build(
    BuildContext context,
    WidgetRef ref,
  ) {
    final loading = ref.watch(authProvider).status == AuthStatus.loading;

    return AppButton(
      label: loading ? (loadingLabel ?? 'Chargement...') : label,
      onPressed: loading || !enabled
          ? null
          : () {
              onPressed();
            },
    );
  }
}


