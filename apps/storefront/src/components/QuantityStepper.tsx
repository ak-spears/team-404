'use client';

import { useId, useState } from 'react';

interface QuantityStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}

/** − / number / + control. Typing is free-form (the box may be briefly empty); the committed
 * value is only ever a whole number ≥ min, and blur snaps the text back to it. */
export function QuantityStepper({ label, value, onChange, min = 1 }: QuantityStepperProps) {
  const id = useId();
  const [text, setText] = useState(String(value));

  const commit = (next: number) => {
    const clamped = Math.max(min, Math.floor(next));
    onChange(clamped);
    setText(String(clamped));
  };

  return (
    <div className="stepper-field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => commit(value - 1)}
        >
          &minus;
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          step={1}
          required
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const next = e.target.valueAsNumber;
            if (Number.isInteger(next) && next >= min) onChange(next);
          }}
          onBlur={() => setText(String(value))}
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => commit(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
