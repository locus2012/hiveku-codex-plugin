---
name: hiveku-fix-preview
description: "Repair a broken Hiveku live preview - Module not found errors, blank pages, dead interactivity, a preview stuck installing, or a page serving the starter template. Classify the error FIRST; only one class is fixed by editing code. Never add a starter package to the project's package.json, never hand-edit container files."
---
The live preview is an ephemeral container hydrated from the saved project. When it breaks, the fix
is a tool call in every class but one. Classify before touching anything.

## Step 0: read the state, never guess
- `preview_overview({ project_id })` - status, ready, blockers, hints. `ready: true` is gated
  server-side: dev server compiled AND the project's files landed on this machine.
- `preview_health({ project_id })` - the boot phase. `installing` / `downloading` means a dependency
  install is running (2-5 minutes after a package.json change): **wait and re-check, that is a
  healthy preview mid-boot, not a failure.** A stopped machine is answered without waking it
  (`phase: "stopped"`); start it with `preview_start`, never by polling.
- `preview_runtime_errors({ project_id })` for the actual error text.

## The four classes
1. **The error names a file NOT in the project** (check the project file list first) - e.g.
   `Module not found: Can't resolve '@radix-ui/react-label'` from `./components/ui/label.tsx` when
   the project has no such file. Starter leftover in the container: run `preview_force_recompile`.
   If the identical error persists, run it ONCE more with `refresh_image: true` (only the full
   recreate prunes leftovers). FORBIDDEN: adding the starter's package to the customer's
   package.json to silence it, and deleting or editing the container file by hand - container
   edits reverse-sync into the saved project.
2. **The error comes from inside `node_modules/<pkg>/`** - broken install: `preview_reinstall_deps`.
   It is async: poll `preview_read_file({ path: '/tmp/hiveku-reinstall.log', tail_lines: 40 })`
   every ~15s until a `hiveku-reinstall: exit=` line appears (installs run 1-4 minutes).
3. **The error names a project-owned file** - fix the code. The only editing class. Sub-case: a
   persistent module-not-found on a file the project DOES own means the project imports a package
   it never declared - add it to package.json; recreating cannot fix a manifest defect.
4. **Blank page / HTML serves but interactivity is dead** - `preview_client_errors({ project_id })`
   (hydration and client exceptions never reach the server log). `capture_installed: false` means
   an old container image: `preview_force_recompile({ refresh_image: true })`.

## After the fix
Poll `preview_overview` until ready, then `preview_screenshot({ path })` to confirm what the page
actually renders. A recreated machine installs exactly what package.json declares - no routine
reinstall after `refresh_image: true`.
