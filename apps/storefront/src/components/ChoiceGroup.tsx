export interface Choice<T extends string> {
  value: T;
  title: string;
  meta?: string;
}

interface ChoiceGroupProps<T extends string> {
  name: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `cards` for a grid of tiles, `pills` for a compact segmented row. */
  variant?: 'cards' | 'pills';
}

/** Native radio group styled as selectable tiles -- keyboard and screen-reader behavior for free. */
export function ChoiceGroup<T extends string>({
  name,
  choices,
  value,
  onChange,
  variant = 'cards',
}: ChoiceGroupProps<T>) {
  return (
    <div className={`choice-group choice-group--${variant}`}>
      {choices.map((choice) => (
        <label key={choice.value} className="choice">
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={choice.value === value}
            onChange={() => onChange(choice.value)}
          />
          <span className="choice-title">{choice.title}</span>
          {choice.meta && <span className="choice-meta">{choice.meta}</span>}
        </label>
      ))}
    </div>
  );
}
