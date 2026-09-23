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
  const AuthUser({required this.id, required this.firstName, required this.lastName, required this.email, required this.status, this.phone, this.birthDate, this.country, this.city, this.token, this.refreshToken, this.companyId, this.photoUrl, this.cvUrl, this.skills});
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
  final String? refreshToken;
  final String? companyId;
  final String? photoUrl;
  final String? cvUrl;
  final String? skills;

  AuthUser copyWith({String? firstName, String? lastName, String? phone, String? country, String? city, String? photoUrl, String? cvUrl, String? skills, String? token, String? refreshToken}) {
    return AuthUser(
      id: id,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      email: email,
      status: status,
      phone: phone ?? this.phone,
      birthDate: birthDate,
      country: country ?? this.country,
      city: city ?? this.city,
      token: token ?? this.token,
      refreshToken: refreshToken ?? this.refreshToken,
      companyId: companyId,
      photoUrl: photoUrl ?? this.photoUrl,
      cvUrl: cvUrl ?? this.cvUrl,
      skills: skills ?? this.skills,
    );
  }
}
