import { Ban, ExternalLink, FileText, Globe, Keyboard, LockKeyhole, Pin, TriangleAlert } from 'lucide-react';
import { SwitchField } from '@/components/settings-fields';
import { ShortcutKeys } from '@/components/shortcut-keys';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommandShortcut } from '@/hooks/use-command-shortcut';
import { useEverySite } from '@/hooks/use-every-site';
import { OPEN_COMMAND } from '@/lib/messages';
import { ctrlFLabel, isCtrlF, isFirefox, nativeFindHint, openShortcutSettings } from '@/lib/platform';

const LIMITS = [
  { icon: Ban, text: 'The browser’s own pages: settings, history, downloads, the new tab page.' },
  isFirefox
    ? { icon: Ban, text: 'Firefox’s add-on store, and some other Mozilla sites (support, accounts).' }
    : { icon: Ban, text: 'The extension store (Chrome Web Store, Edge Add-ons).' },
  { icon: FileText, text: 'PDFs shown in the browser’s built-in PDF viewer.' },
  isFirefox
    ? { icon: FileText, text: 'Files on your computer, unless “Ctrl+F on every website” is on.' }
    : { icon: FileText, text: 'Files on your computer, unless you allow file access on the extension’s details page.' },
  { icon: Ban, text: 'Text inside embedded frames and form fields (not searched yet).' },
];

/** Ctrl+F on every website, the keyboard shortcut, the toolbar button, and where none of them work. */
export function OpeningSection() {
  const shortcut = useCommandShortcut(OPEN_COMMAND);
  const everySite = useEverySite();
  const ctrlF = ctrlFLabel();
  const shortcutIsCtrlF = shortcut !== null && isCtrlF(shortcut);

  return (
    <>
      <Card className={everySite.granted ? '' : 'border-2 border-primary'}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Globe className="size-6 text-signal" aria-hidden />
            <CardTitle className="text-xl">{ctrlF} on every website</CardTitle>
            <Badge>Recommended</Badge>
          </div>
          <CardDescription className="text-base">
            Accessible Find opens when you press <ShortcutKeys shortcut={ctrlF} /> on any website. On pages it can’t
            run on, the browser’s own find opens instead, so {ctrlF} always does something.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchField
            label={`Use ${ctrlF} on every website`}
            description="Your browser will ask to let the extension “read and change data on all websites”."
            checked={everySite.granted === true}
            onCheckedChange={(on) => void everySite.set(on)}
          />
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
            The extension has to be present on each page to notice {ctrlF}. It only reads a page when you search it,
            and your searches never leave your device.
          </p>
          {everySite.granted && shortcutIsCtrlF && (
            <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
              <TriangleAlert aria-hidden />
              <AlertTitle>Your keyboard shortcut is still {ctrlF}</AlertTitle>
              <AlertDescription className="text-warning-foreground">
                <p>
                  The shortcut takes priority, so on pages Accessible Find can’t run on, the browser’s own find only
                  opens on the second press.
                  Change it to another key, like Alt+Shift+F, or remove it.
                </p>
                <Button variant="outline" className="mt-2" onClick={() => openShortcutSettings()}>
                  Open shortcut settings
                  <ExternalLink aria-hidden />
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Keyboard className="size-5 text-signal" aria-hidden />
              <CardTitle className="text-lg">Keyboard shortcut</CardTitle>
            </div>
            <CardDescription>
              Works without access to every website.{' '}
              {everySite.granted
                ? 'A second way to open Accessible Find.'
                : `To make ${ctrlF} open Accessible Find without that access, set the shortcut to ${ctrlF}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">Current:</span>
              {shortcut === null ? null : shortcut ? (
                <ShortcutKeys shortcut={shortcut} />
              ) : (
                <span className="font-semibold">None</span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              In the browser’s shortcut page, look for “Open Accessible Find”.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => openShortcutSettings()}>
              Change shortcut
              <ExternalLink aria-hidden />
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Pin className="size-5 text-signal" aria-hidden />
              <CardTitle className="text-lg">Toolbar button</CardTitle>
            </div>
            <CardDescription>
              Click the Accessible Find icon next to the address bar. Pin it from the puzzle-piece menu so it’s always
              visible.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card id="limits">
        <CardHeader>
          <CardTitle className="text-lg">Where it can’t run</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {LIMITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter className="text-muted-foreground">
          On those pages, use the browser’s own find: {nativeFindHint()}.
        </CardFooter>
      </Card>
    </>
  );
}
