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

// PATCH /api/auth/me. Every field is optional, but at least one must be sent.
// Checked and cleaned by parseProfileChanges (profile-changes.ts).
export class UpdateMeDto {
  name?: string;
  displayName?: string | null; // null or "" clears it
  phone?: string | null; // any US format; saved as E.164. null or "" removes it
  timeZone?: string; // IANA name, e.g. "America/Chicago"
}