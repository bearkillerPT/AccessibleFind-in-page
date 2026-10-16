import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SettingsApi } from '@/hooks/use-settings';
import { downloadJson, pickTextFile } from '@/lib/files';
import { MAX_PROFILES } from '@/lib/settings/defaults';
import { importProfile, replaceAll } from '@/lib/settings/store';
import { backupFile, fileName, profileFile, readBackup, readProfile } from '@/lib/settings/transfer';

type Message = { error: boolean; text: string } | null;

function Status({ message }: { message: Message }) {
  return (
    <p role="status" className={message?.error ? 'text-sm font-semibold text-destructive' : 'text-sm text-muted-foreground'}>
      {message?.text}
    </p>
  );
}

/** Save all settings and profiles to a file and restore them, and share single profiles. */
export function BackupSection({ api }: { api: SettingsApi }) {
  const [pending, setPending] = useState<{ name: string; records: Record<string, unknown>; count: number } | null>(null);
  const [backupMessage, setBackupMessage] = useState<Message>(null);
  const [shareMessage, setShareMessage] = useState<Message>(null);
  const state = api.state;
  if (!state) return null;
  const active = state.active;
  const tooMany = { error: true, text: `You already have ${MAX_PROFILES} profiles. Delete one to import another.` };

  const download = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(fileName('backup', date), backupFile(state));
    setBackupMessage({ error: false, text: 'Backup saved to your downloads.' });
  };

  const choose = async () => {
    const file = await pickTextFile();
    if (!file) return;
    const result = readBackup(file.text);
    if (!result.ok) {
      setBackupMessage({ error: true, text: result.error });
      return;
    }
    setBackupMessage(null);
    setPending({ name: file.name, records: result.value.records, count: result.value.profileCount });
  };

  const restore = async () => {
    if (!pending) return;
    await replaceAll(pending.records);
    setBackupMessage({
      error: false,
      text: `Restored ${pending.count} ${pending.count === 1 ? 'profile' : 'profiles'} and your settings.`,
    });
    setPending(null);
  };

  const exportProfile = () => {
    downloadJson(fileName('profile', active.name), profileFile(active));
    setShareMessage({ error: false, text: `Saved “${active.name}” as a file you can share.` });
  };

  const importFromFile = async () => {
    if (state.profiles.filter((p) => !p.builtIn).length >= MAX_PROFILES) {
      setShareMessage(tooMany);
      return;
    }
    const file = await pickTextFile();
    if (!file) return;
    const result = readProfile(file.text);
    if (!result.ok) {
      setShareMessage({ error: true, text: result.error });
      return;
    }
    const name = await importProfile(result.value.name, result.value.appearance);
    setShareMessage(name ? { error: false, text: `Added “${name}” to your profiles and switched to it.` } : tooMany);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Backup</CardTitle>
          <CardDescription>
            A backup holds all your profiles and settings, to keep them safe or move them to another computer. Your
            recent searches aren’t included; they stay on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={download}>
              <Download aria-hidden />
              Download a backup
            </Button>
            <Button variant="outline" onClick={() => void choose()}>
              <Upload aria-hidden />
              Restore a backup
            </Button>
          </div>
          <Status message={backupMessage} />
          <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace your settings?</AlertDialogTitle>
                <AlertDialogDescription>
                  The {pending?.count} {pending?.count === 1 ? 'profile' : 'profiles'} and settings in “{pending?.name}”
                  will replace all your current ones. Download a backup first if you might want them back.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my settings</AlertDialogCancel>
                <AlertDialogAction onClick={() => void restore()}>Replace</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Share a profile</CardTitle>
          <CardDescription>
            Save the profile you’re using, “{active.name}”, as a file to give to someone, or add a profile someone
            shared with you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportProfile}>
              <Download aria-hidden />
              Export this profile
            </Button>
            <Button variant="outline" onClick={() => void importFromFile()}>
              <Upload aria-hidden />
              Import a profile
            </Button>
          </div>
          <Status message={shareMessage} />
        </CardContent>
      </Card>
    </>
  );
}
