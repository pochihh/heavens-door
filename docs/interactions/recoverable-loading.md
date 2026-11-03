# Recoverable workspace loading

A workspace is a collection of files that can be edited by other apps. Opening it must load as much supported content as possible. An invalid file or an optional service must not reject the whole workspace.

| Problem | Behavior |
| --- | --- |
| Invalid card, tag or whiteboard | Keep it in navigation. Show its error when opened, with source inspection, History, reload and Move to Trash. Continue loading other files; never replace the original with an empty document. |
| Duplicate card identity | Address affected files by exact path for repair; do not silently pick a winner. |
| Unsupported or invalid settings | Use supported fields and safe defaults in memory. Show the warning in Settings. Preserve unknown and unmodified fields on writes; back up unreadable settings before replacing them. |
| Saved camera outside current interaction limits | Accept positive finite persisted zoom; clamp only the displayed camera. Rendering limits are not a file compatibility boundary. |
| Corrupt derived SQLite index | Preserve the cache under an unreadable filename and rebuild from source files. |
| History or watcher initialization fails | Open content and record the service problem. Show History failures in History and service diagnostics in Developer Settings. |
| Invalid workspace registry | List valid registrations where possible. Manual folder opening still works; do not overwrite a broken registry implicitly. |
| Interrupted transaction cannot recover | Open readable content, preserve the journal and keep writes paused to prevent partial operations from destroying files. |

Workspace-wide property renames still require readable affected metadata so references are not silently missed.

Read tolerance does not relax writes: retain revision and file-stamp conflict checks, path containment, symlink restrictions, destination collision checks, valid outgoing document structure and recovery journals. Unreadable roots and unavailable permissions can still prevent access. Never bypass an operating-system access failure by creating a replacement workspace.

Warnings belong to the affected file or feature, rather than a persistent app-wide banner for every scan issue. User drafts must survive failures. Recovery actions reuse existing History and undoable Trash operations.

Regression coverage: `tests/tolerant-loading.test.ts`, `tests/workspace-worker.test.ts`, `tests/docks.test.tsx` and `tests/file-problem.test.tsx`.
