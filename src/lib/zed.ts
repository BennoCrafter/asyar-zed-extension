import type { IShellService, SpawnParams } from 'asyar-sdk/contracts';
import { cleanError } from './recents.js';

export type Platform = 'macos' | 'linux' | 'windows';

/**
 * One interpreter per OS: osascript, sh, PowerShell. Paths never enter the
 * script source: they go in as argv (osascript, sh) or as JSON on stdin
 * (PowerShell, whose -Command would splice extra args into the source).
 * `background` keeps successful runs out of the launcher list and notifications.
 */
function spawnParams(platform: Platform, script: string, argv: string[]): SpawnParams {
  if (platform === 'macos') return { program: '/usr/bin/osascript', args: ['-', ...argv], stdin: script, background: true };
  if (platform === 'linux') return { program: '/bin/sh', args: ['-c', script, 'sh', ...argv], background: true };
  return {
    program: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', script],
    stdin: JSON.stringify(argv),
    background: true,
  };
}

export function run(shell: IShellService, platform: Platform, script: string, argv: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const out: string[] = [];
    const err: string[] = [];
    const handle = shell.spawn(spawnParams(platform, script, argv));
    handle.onChunk((c) => (c.stream === 'stdout' ? out : err).push(c.data));
    handle.onDone((code) =>
      code === 0 || code == null
        ? resolve(out.join('\n').trim())
        : reject(new Error(cleanError(err.join('\n')) || `Exited with code ${code}`)),
    );
    handle.onError((e) => reject(new Error(e.message)));
  });
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e);

export const fileManagerName: Record<Platform, string> = { macos: 'Finder', windows: 'Explorer', linux: 'File Manager' };

// shortcut: stable channel only and local projects only (remote/SSH skipped); add 0-preview if needed.
const query = "select paths from workspaces where paths != '' and remote_connection_id is null order by timestamp desc";

// Zed's CLI, not `open -a` and friends, because only the CLI can pass -n (always open a new window).
export const scripts: Record<Platform, { recents: string; open: string }> = {
  macos: {
    recents: `set db to POSIX path of (path to home folder) & "Library/Application Support/Zed/db/0-stable/db.sqlite"
return do shell script "/usr/bin/sqlite3 -readonly -json " & quoted form of db & " " & quoted form of "${query}"`,
    open: `on run argv
  set cmd to quoted form of (POSIX path of (path to application "Zed") & "Contents/MacOS/cli") & " -n"
  repeat with p in argv
    set cmd to cmd & " " & quoted form of (p as text)
  end repeat
  do shell script cmd
end run`,
  },
  linux: {
    recents: `exec sqlite3 -readonly -json "\${XDG_DATA_HOME:-$HOME/.local/share}/zed/db/0-stable/db.sqlite" "${query}"`,
    // Distros package the CLI as zeditor; the official installer puts zed in ~/.local/bin, often not on the launcher's PATH.
    open: `z=$(command -v zed || command -v zeditor || echo "$HOME/.local/bin/zed")
exec "$z" -n "$@"`,
  },
  windows: {
    recents: `if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) { [Console]::Error.WriteLine('Recent projects need sqlite3 on PATH: winget install SQLite.SQLite'); exit 1 }
sqlite3 -readonly -json (Join-Path $env:LOCALAPPDATA 'Zed\\db\\0-stable\\db.sqlite') "${query}"`,
    open: `$paths = [Console]::In.ReadToEnd() | ConvertFrom-Json
$zed = (Get-Command zed -ErrorAction SilentlyContinue).Source
if (-not $zed) { $zed = Join-Path $env:LOCALAPPDATA 'Programs\\Zed\\bin\\zed.exe' }
& $zed -n $paths
exit $LASTEXITCODE`,
  },
};

// Finder's icon for each path (custom folder icons included) as base64 PNG, one per line.
// macOS only: the SDK exposes no file icons, so other OSes keep the bundled folder.png.
export const folderIconsScript = `use framework "AppKit"
use scripting additions
on run argv
  set out to {}
  set ws to current application's NSWorkspace's sharedWorkspace()
  repeat with p in argv
    set img to (ws's iconForFile:(p as text))
    set rep to (current application's NSBitmapImageRep's alloc()'s initWithBitmapDataPlanes:(missing value) pixelsWide:64 pixelsHigh:64 bitsPerSample:8 samplesPerPixel:4 hasAlpha:true isPlanar:false colorSpaceName:(current application's NSDeviceRGBColorSpace) bytesPerRow:0 bitsPerPixel:0)
    current application's NSGraphicsContext's saveGraphicsState()
    current application's NSGraphicsContext's setCurrentContext:(current application's NSGraphicsContext's graphicsContextWithBitmapImageRep:rep)
    img's drawInRect:{{0, 0}, {64, 64}}
    current application's NSGraphicsContext's restoreGraphicsState()
    set png to (rep's representationUsingType:(current application's NSBitmapImageFileTypePNG) |properties|:(current application's NSDictionary's dictionary()))
    set end of out to (png's base64EncodedStringWithOptions:0) as text
  end repeat
  set AppleScript's text item delimiters to linefeed
  return out as text
end run`;

// Selected items win; with nothing selected, the folder the front Finder window shows.
// macOS only: elsewhere the worker reads the selection through the SDK's selection service.
export const openFinderScript = `tell application "Finder"
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
return picked as text`;
