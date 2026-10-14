import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select';
import type { SettingsApi } from '@/hooks/use-settings';
import { MAX_PROFILES } from '@/lib/settings/defaults';
import { NAME_MAX } from '@/lib/settings/sanitize';
import { isChangedBuiltIn } from '@/lib/settings/schema';

/**
 * Pick, duplicate, rename and delete profiles, and reset a built-in one the user changed.
 * Uses a native select so it also works inside the find bar iframe, where a pop-up list
 * could be cut off. Sharing profiles as files is on the settings page's Backup page.
 */
export function ProfilePicker({ api, compact = false }: { api: SettingsApi; compact?: boolean }) {
  const id = useId();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);
  const state = api.state;
  if (!state) return null;
  const users = state.profiles.filter((p) => !p.builtIn);
  const builtIns = state.profiles.filter((p) => p.builtIn);
  const active = state.active;

  const duplicate = () => {
    if (users.length >= MAX_PROFILES) {
      setMessage(`You can have up to ${MAX_PROFILES} profiles. Delete one to make room for another.`);
    } else {
      setMessage('');
      void api.duplicateProfile();
    }
  };

  const finishRename = (save: boolean) => {
    if (save && name.trim()) void api.renameProfile(active.id, name);
    setRenaming(false);
  };

  if (renaming) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>Profile name</Label>
          <Input
            id={`${id}-name`}
            ref={renameRef}
            value={name}
            maxLength={NAME_MAX}
            className="w-64"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename(true);
              if (e.key === 'Escape') {
                e.stopPropagation();
                finishRename(false);
              }
            }}
          />
        </div>
        <Button onClick={() => finishRename(true)}>Save</Button>
        <Button variant="outline" onClick={() => finishRename(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={id}>Profile</Label>
          <NativeSelect
            id={id}
            value={active.id}
            className={compact ? 'w-full' : 'min-w-64'}
            onChange={(e) => {
              setMessage('');
              void api.selectProfile(e.target.value);
            }}
          >
            <NativeSelectOptGroup label="Your profiles">
              {users.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Built-in">
              {builtIns.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          </NativeSelect>
        </div>
        <Button variant="outline" onClick={duplicate} title="Make a copy of this profile">
          <Copy aria-hidden />
          Duplicate
        </Button>
        {isChangedBuiltIn(active) && (
          <Button variant="outline" onClick={() => void api.resetProfile(active.id)}>
            <RotateCcw aria-hidden />
            Reset to original
          </Button>
        )}
        {!compact && !active.builtIn && (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setName(active.name);
                setRenaming(true);
              }}
            >
              <Pencil aria-hidden />
              Rename
            </Button>
            {users.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{active.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Its colors and effects will be lost. This can’t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void api.deleteProfile(active.id)}>
                      Delete profile
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}
      </div>
      {/* Always in the page, so screen readers announce the message when it appears. */}
      <p role="status" className="text-sm font-semibold text-destructive not-empty:mt-2">
        {message}
      </p>
      {!compact && active.builtIn && (
        <p className="mt-2 text-sm text-muted-foreground">
          This profile comes with Accessible Find. Your changes to it are saved, and you can always reset it to the
          original.
        </p>
      )}
    </div>
  );
}
