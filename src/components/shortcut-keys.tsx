import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { shortcutKeys } from '@/lib/shortcuts';

/** "Ctrl+Shift+F" (or macOS "⇧⌘F") rendered as separate keys; "Enter" stays one key. */
export function ShortcutKeys({ shortcut }: { shortcut: string }) {
  return (
    <KbdGroup aria-label={shortcut}>
      {shortcutKeys(shortcut).map((k, i) => (
        <Kbd key={i} className="h-7 min-w-7 px-2 text-sm">
          {k}
        </Kbd>
      ))}
    </KbdGroup>
  );
}
