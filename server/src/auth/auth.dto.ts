export class SignupDto {
  name!: string;
  email!: string;
  phone?: string;
  password!: string;
  marketingOptIn?: boolean;
}

// Send either email OR phone, matching the Email/Phone toggle on the login screen.
export class LoginDto {
  email?: string;
  phone?: string;
  password!: string;
}