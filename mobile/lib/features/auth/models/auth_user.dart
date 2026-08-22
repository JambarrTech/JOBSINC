enum AccountStatus { candidate, employee, recruiter }

extension AccountStatusValue on AccountStatus {
  String get storageValue => switch (this) {
    AccountStatus.candidate => 'candidate',
    AccountStatus.employee => 'employee',
    AccountStatus.recruiter => 'recruiter',
  };
}

AccountStatus? accountStatusFromStorage(String? value) {
  switch (value?.trim().toLowerCase()) {
    case 'candidate':
      return AccountStatus.candidate;
    case 'employee':
      return AccountStatus.employee;
    case 'recruiter':
      return AccountStatus.recruiter;
    default:
      return null;
  }
}

class AuthUser {
  const AuthUser({required this.id, required this.firstName, required this.lastName, required this.email, required this.status, this.phone, this.birthDate, this.country, this.city, this.token, this.companyId, this.photoUrl, this.cvUrl, this.skills});
  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final AccountStatus status;
  final String? phone;
  final DateTime? birthDate;
  final String? country;
  final String? city;
  final String? token;
  final String? companyId;
  final String? photoUrl;
  final String? cvUrl;
  final String? skills;

  AuthUser copyWith({String? photoUrl, String? cvUrl, String? skills}) {
    return AuthUser(
      id: id,
      firstName: firstName,
      lastName: lastName,
      email: email,
      status: status,
      phone: phone,
      birthDate: birthDate,
      country: country,
      city: city,
      token: token,
      companyId: companyId,
      photoUrl: photoUrl ?? this.photoUrl,
      cvUrl: cvUrl ?? this.cvUrl,
      skills: skills ?? this.skills,
    );
  }
}
