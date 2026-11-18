import { z } from 'zod';

export type Role = 'admin' | 'agent';

const Email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

export const RegisterBody = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80),
  email: Email,
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
  organisation: z.string().trim().min(1, 'Name your team or company.').max(80)
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  email: Email,
  // Capped like registration so a huge password cannot tie up the hasher.
  password: z.string().min(1, 'Enter your password.').max(200)
});
export type LoginBody = z.infer<typeof LoginBody>;

export interface Profile {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; isDemo: boolean };
  role: Role;
}
