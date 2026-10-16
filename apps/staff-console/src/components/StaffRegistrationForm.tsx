'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BASE_PATH } from '../lib/base-path';

export function StaffRegistrationForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`${BASE_PATH}/api/admin/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (response.status === 201) {
        setMessage(`${email.trim().toLowerCase()} can now sign in through Auth0 as staff.`);
        setEmail('');
        router.refresh();
      } else if (response.status === 409) {
        setError('That email is already linked to a non-staff account. It was not changed.');
      } else if (response.status === 400) {
        setError('Enter a valid @ua.edu or @crimson.ua.edu email address.');
      } else {
        setError('Could not register this staff member. Try again.');
      }
    } catch {
      setError('Network error while registering staff. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="staff-registration-form" onSubmit={submit}>
      <label htmlFor="staff-email">UA email address</label>
      <input
        id="staff-email"
        type="email"
        autoComplete="email"
        placeholder="name@ua.edu"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <p className="muted">
        Registration creates a passwordless staff account linked to this email. The staff member
        signs in using the same verified email through Auth0.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Registering…' : 'Register staff member'}
      </button>
    </form>
  );
}
