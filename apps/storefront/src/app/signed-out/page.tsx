export default function SignedOutPage() {
  return (
    <div>
      <h1>You&apos;ve Been Signed Out</h1>
      <p>You can sign in again whenever you&apos;re ready.</p>
      <a href="/auth/login" className="btn-primary">
        Sign in
      </a>
    </div>
  );
}