import type { IShellService } from 'asyar-sdk/contracts';
import { cleanError } from './recents.js';

/**
 * Run an AppleScript through /usr/bin/osascript. Paths are passed as argv
 * (`on run argv`), never spliced into the source. sqlite3 and `open` run via
 * `do shell script`, so osascript is the only binary the user has to trust.
 *
 * Runs in the view: launcher 0.1.1-54 posts shell output only to iframes, so
 * spawns from the Web Worker never see their output or exit code.
 */
export function osascript(shell: IShellService, script: string, argv: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const out: string[] = [];
    const err: string[] = [];
    const handle = shell.spawn({ program: '/usr/bin/osascript', args: ['-', ...argv], stdin: script });
    handle.onChunk((c) => (c.stream === 'stdout' ? out : err).push(c.data));
    handle.onDone((code) =>
      code === 0 || code == null
        ? resolve(out.join('\n').trim())
        : reject(new Error(cleanError(err.join('\n')) || `osascript exited with code ${code}`)),
    );
    handle.onError((e) => reject(new Error(e.message)));
  });
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e);

// Zed's bundled CLI, because `open -a` can't pass -n (always open a new window).
export const scripts = {
  // shortcut: stable channel only and local projects only (remote/SSH skipped); add 0-preview if needed.
  recents: `set db to POSIX path of (path to home folder) & "Library/Application Support/Zed/db/0-stable/db.sqlite"
set q to "select paths from workspaces where paths != '' and remote_connection_id is null order by timestamp desc"
return do shell script "/usr/bin/sqlite3 -readonly -json " & quoted form of db & " " & quoted form of q`,

  open: `on run argv
  set cmd to quoted form of (POSIX path of (path to application "Zed") & "Contents/MacOS/cli") & " -n"
  repeat with p in argv
    set cmd to cmd & " " & quoted form of (p as text)
  end repeat
  do shell script cmd
end run`,

  // Selected items win; with nothing selected, the folder the front Finder window shows.
  openFinder: `tell application "Finder"
  set picked to {}
  repeat with a in (selection as alias list)
    set end of picked to POSIX path of a
  end repeat
  if picked is {} then
    if (count of Finder windows) = 0 then error "No Finder window open."
    try
      set end of picked to POSIX path of (target of front Finder window as alias)
    on error
      error "The front Finder window isn't a folder."
    end try
  end if
end tell
set cmd to quoted form of (POSIX path of (path to application "Zed") & "Contents/MacOS/cli") & " -n"
repeat with p in picked
  set cmd to cmd & " " & quoted form of p
end repeat
do shell script cmd
set AppleScript's text item delimiters to ", "
return picked as text`,
};
