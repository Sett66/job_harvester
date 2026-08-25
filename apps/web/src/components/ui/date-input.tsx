import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

type DateInputProps = Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
};

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function DateInput({ value, onChange, ...props }: DateInputProps) {
  return (
    <Input
      type="date"
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (next === value) {
          return;
        }
        onChange(next);
        // Only dismiss after a full date is picked — not when browsing months.
        if (DATE_VALUE_PATTERN.test(next)) {
          requestAnimationFrame(() => {
            event.currentTarget.blur();
          });
        }
      }}
      {...props}
    />
  );
}
