import type { ReactNode } from 'react';

interface FormStepProps {
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
}

/** One numbered card of a multi-part form. */
export function FormStep({ step, title, hint, children }: FormStepProps) {
  return (
    <fieldset className="form-step">
      <legend>
        <span className="form-step-num" aria-hidden>
          {step}
        </span>
        {title}
      </legend>
      {hint && <p className="form-step-hint">{hint}</p>}
      <div className="form-step-body">{children}</div>
    </fieldset>
  );
}
