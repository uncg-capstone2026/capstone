export class SignupDto {
  name!: string;
  email!: string;
  phone?: string;
  password!: string;
  marketingOptIn?: boolean;
  timeZone?: string; // IANA name from the device, e.g. "America/Chicago"; optional
}

// Send either email OR phone, matching the Email/Phone toggle on the login screen.
export class LoginDto {
  email?: string;
  phone?: string;
  password!: string;
}

// PATCH /api/auth/me. The app sends the device's time zone when it changes.
export class UpdateMeDto {
  timeZone?: string;
}