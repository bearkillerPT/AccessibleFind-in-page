import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select';
import type { Profile } from '@/lib/settings/types';

/** A labelled dropdown of all profiles, grouped into the user's own and built-in ones. */
export function ProfileSelect(props: {
  label: string;
  profiles: readonly Profile[];
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{props.label}</Label>
      <NativeSelect id={id} value={props.value} className="w-full" onChange={(e) => props.onChange(e.target.value)}>
        <NativeSelectOptGroup label="Your profiles">
          {props.profiles
            .filter((p) => !p.builtIn)
            .map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
        </NativeSelectOptGroup>
        <NativeSelectOptGroup label="Built-in">
          {props.profiles
            .filter((p) => p.builtIn)
            .map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
        </NativeSelectOptGroup>
      </NativeSelect>
    </div>
  );
}
