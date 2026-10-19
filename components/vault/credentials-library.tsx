"use client";

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import {
  sendVaultCode,
  verifyVaultCode,
  lockVault,
  revealCredential,
  saveCredential,
  deleteCredential,
  grantVaultAccess,
  revokeVaultAccess,
  type Secrets,
  type VaultResult,
} from "@/lib/vault/actions";
import type { VaultAccessInfo, VaultEntry, VaultHistoryRow, VaultView } from "@/lib/vault/data";

/** A shown entry hides itself again after this long. */
const SHOW_MS = 60_000;
/** A copied value is cleared from the clipboard after this long. */
const CLIPBOARD_MS = 120_000;
const MASK = "••••••••";
/** One column template for the header and every row, so they line up. */
const COLS = "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_10rem]";

// ---- Clipboard ---------------------------------------------------------------
// Copied secrets are wiped from the clipboard after two minutes. Browsers only
// let a page touch the clipboard while its tab has focus, so if the person is
// elsewhere when the time's up, the wipe happens as soon as they come back.
// Anything copied in the meantime (another secret, or text on this page)
// cancels the pending wipe, so we never clear something newer. Where the
// browser already allows reading the clipboard, we also check it still holds
// our value first.

let copyEpoch = 0;
if (typeof document !== "undefined") {
  document.addEventListener("copy", () => {
    copyEpoch++;
  });
}

async function clipboardReadable(): Promise<boolean> {
  try {
    const p = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
    return p.state === "granted";
  } catch {
    return false;
  }
}

async function wipeClipboard(value: string) {
  if (await clipboardReadable()) {
    const now = await navigator.clipboard.readText().catch(() => null);
    if (now !== null && now !== value) return; // something else is there now — leave it
  }
  await navigator.clipboard.writeText("");
}

async function copySecret(value: string) {
  await navigator.clipboard.writeText(value);
  const mine = ++copyEpoch;
  window.setTimeout(() => {
    if (copyEpoch !== mine) return;
    const run = () => {
      if (copyEpoch === mine) void wipeClipboard(value).catch(() => {});
    };
    if (document.hasFocus()) run();
    else window.addEventListener("focus", run, { once: true });
  }, CLIPBOARD_MS);
}

// ---- The library ---------------------------------------------------------------

/**
 * A project's credentials library — one component for the team's pages and the
 * client portal. It never receives a secret as a prop: entries arrive as title
 * + login URL, and a username / password / notes is fetched only when someone
 * presses Show on that entry, then hidden again after a minute.
 */
export function CredentialsLibrary({ view }: { view: VaultView }) {
  const router = useRouter();
  const unlocked = view.hasAccess && view.configured && view.entries !== null;
  const [verify, setVerify] = useState<{ then: () => void } | null>(null);
  const [editor, setEditor] = useState<{ entry: VaultEntry | null; values: Secrets | null } | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [pending, start] = useTransition();

  // Lock on time: when the unlock runs out, re-render from the server, which
  // drops the entries — and with them anything that was shown.
  useEffect(() => {
    if (!view.viewUntil) return;
    const ms = Date.parse(view.viewUntil) - Date.now();
    const t = window.setTimeout(() => router.refresh(), Math.max(0, ms) + 500);
    return () => window.clearTimeout(t);
  }, [view.viewUntil, router]);

  /** Run `then` once the edit check is live — asking for a code first if it isn't. */
  function withEdit(then: () => void, force = false) {
    const live = !force && !!view.editUntil && Date.parse(view.editUntil) > Date.now();
    if (live) then();
    else setVerify({ then });
  }

  /** The gate answers every action can give: locked, needs the edit code, or an error. */
  function handle(res: VaultResult, retry: () => void): boolean {
    if (res.ok) return true;
    if (res.locked) {
      toast.error("The library has locked. Unlock it again to continue.");
      router.refresh();
    } else if (res.needEdit) {
      withEdit(retry, true);
    } else {
      toast.error(res.error ?? "Something went wrong.");
    }
    return false;
  }

  function openEditor(entry: VaultEntry) {
    const run = () =>
      start(async () => {
        const res = await revealCredential(entry.id);
        if (handle(res, run) && res.values) setEditor({ entry, values: res.values });
      });
    withEdit(run);
  }

  function remove(entry: VaultEntry) {
    const run = () =>
      void (async () => {
        const ok = await confirmDialog({
          title: "Delete this login?",
          message: `“${entry.title}” will be deleted for everyone on this project. This can't be undone.`,
          tone: "danger",
          confirmLabel: "Delete",
        });
        if (!ok) return;
        start(async () => {
          const res = await deleteCredential(entry.id);
          if (handle(res, run)) {
            toast.success("Deleted");
            router.refresh();
          }
        });
      })();
    withEdit(run);
  }

  function lockNow() {
    start(async () => {
      await lockVault();
      router.refresh();
    });
  }

  let body: ReactNode;
  if (!view.configured) {
    body = (
      <Notice icon="shield">
        The credentials library isn&apos;t set up yet. An admin needs to add its encryption key to the server
        settings.
      </Notice>
    );
  } else if (!view.hasAccess) {
    body = (
      <Notice icon="lock">
        You&apos;re not on this project&apos;s credentials list. Project managers can add people — including
        themselves — under <span className="font-medium text-content">Manage access</span>.
      </Notice>
    );
  } else if (!unlocked) {
    body = <LockScreen view={view} onUnlocked={() => router.refresh()} />;
  } else {
    body = (
      <>
        <EntryList
          key={view.viewUntil}
          entries={view.entries ?? []}
          handle={handle}
          onEdit={openEditor}
          onDelete={remove}
        />
        <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
          <Icon name="shield" className="size-3.5" />
          {view.editUntilLabel
            ? `Changes allowed until ${view.editUntilLabel}.`
            : "Adding, editing or deleting asks for a second code."}
        </p>
        <History rows={view.history ?? []} />
      </>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Icon name="key" className="size-4 text-faint" />
          <h3 className="text-sm font-semibold text-content">Credentials</h3>
          {view.hasAccess && view.configured && (
            <Badge tone={unlocked ? "green" : "gray"}>
              {unlocked ? `Unlocked until ${view.viewUntilLabel}` : "Locked"}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view.canManageAccess && view.configured && (
            <Button size="sm" variant="ghost" onClick={() => setAccessOpen(true)}>
              <Icon name="users" className="size-4" />
              Manage access
            </Button>
          )}
          {unlocked && (
            <>
              <Button size="sm" variant="ghost" onClick={lockNow} disabled={pending}>
                <Icon name="lock" className="size-4" />
                Lock now
              </Button>
              <Button size="sm" onClick={() => withEdit(() => setEditor({ entry: null, values: null }))}>
                <Icon name="plus" className="size-4" />
                Add
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="p-5">{body}</div>

      {verify && (
        <Modal title="Confirm it's you" onClose={() => setVerify(null)}>
          <CodeForm
            purpose="EDIT"
            intro={`Changes need a second code. We'll email it to ${view.emailHint}; it allows changes for ${view.editMinutes} minutes on this device.`}
            submitLabel="Confirm"
            onVerified={() => {
              const then = verify.then;
              setVerify(null);
              router.refresh();
              then();
            }}
          />
        </Modal>
      )}

      {editor && (
        <EntryEditor
          projectId={view.projectId}
          entry={editor.entry}
          values={editor.values}
          handle={handle}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            toast.success(editor.entry ? "Saved" : "Added");
            router.refresh();
          }}
        />
      )}

      {accessOpen && view.access && (
        <AccessModal
          projectId={view.projectId}
          access={view.access}
          withEdit={withEdit}
          handle={handle}
          onClose={() => setAccessOpen(false)}
        />
      )}
    </Card>
  );
}

function Notice({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm text-muted">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-faint" />
      <p>{children}</p>
    </div>
  );
}

// ---- Locked ------------------------------------------------------------------------

function LockScreen({ view, onUnlocked }: { view: VaultView; onUnlocked: () => void }) {
  return (
    <div className="mx-auto max-w-md py-2 text-center">
      <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
        <Icon name="lock" className="size-5" />
      </span>
      <p className="text-sm font-semibold text-content">
        {view.count ? `${view.count} saved login${view.count === 1 ? "" : "s"}, locked` : "Locked"}
      </p>
      <CodeForm
        purpose="VIEW"
        intro={`We'll email a 6-digit code to ${view.emailHint}. It keeps the library open on this device for ${view.viewMinutes} minutes.`}
        submitLabel="Unlock"
        onVerified={onUnlocked}
      />
    </div>
  );
}

/** Send a code, then type it in. Shared by the lock screen and the edit check. */
function CodeForm({
  purpose,
  intro,
  submitLabel,
  onVerified,
}: {
  purpose: "VIEW" | "EDIT";
  intro: string;
  submitLabel: string;
  onVerified: () => void;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const res = await sendVaultCode(purpose);
      if (res.ok) {
        setSentTo(res.sentTo ?? "your email");
        setCode("");
      } else {
        setError(res.error ?? "Couldn't send the code.");
      }
    });
  }

  function verify(value: string) {
    if (value.length !== 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await verifyVaultCode(purpose, value);
      if (res.ok) onVerified();
      else setError(res.error ?? "That code didn't work.");
    });
  }

  if (!sentTo) {
    return (
      <div className="mt-2 space-y-4 text-center">
        <p className="text-sm text-muted">{intro}</p>
        <Button onClick={send} disabled={pending}>
          <Icon name="mail" className="size-4" />
          {pending ? "Sending…" : "Email me a code"}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <form
      className="mt-2 space-y-4 text-center"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        verify(code);
      }}
    >
      <p className="text-sm text-muted">
        We sent a code to <span className="font-medium text-content">{sentTo}</span>. It works for 10 minutes.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Input
          autoFocus
          aria-label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(next);
            if (next.length === 6) verify(next);
          }}
          className="w-40 text-center font-mono text-lg tracking-[0.4em]"
        />
        <Button type="submit" disabled={pending || code.length !== 6}>
          {pending ? "Checking…" : submitLabel}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="text-xs font-medium text-muted underline-offset-2 hover:text-content hover:underline disabled:opacity-50"
      >
        Send a new code
      </button>
    </form>
  );
}

// ---- Unlocked ----------------------------------------------------------------------

type Handle = (res: VaultResult, retry: () => void) => boolean;

function EntryList({
  entries,
  handle,
  onEdit,
  onDelete,
}: {
  entries: VaultEntry[];
  handle: Handle;
  onEdit: (e: VaultEntry) => void;
  onDelete: (e: VaultEntry) => void;
}) {
  if (!entries.length) {
    return (
      <p className="py-4 text-center text-sm text-muted">
        No saved logins yet. Add the first one — the WordPress admin, Tag Manager, an ads account…
      </p>
    );
  }
  return (
    <div>
      <div className={cn("hidden gap-x-4 border-b border-line pb-2 text-xs font-medium uppercase tracking-wide text-faint md:grid", COLS)}>
        <span>Title</span>
        <span>Login URL</span>
        <span>Username</span>
        <span>Password</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} handle={handle} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
    </div>
  );
}

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function EntryRow({
  entry,
  handle,
  onEdit,
  onDelete,
}: {
  entry: VaultEntry;
  handle: Handle;
  onEdit: (e: VaultEntry) => void;
  onDelete: (e: VaultEntry) => void;
}) {
  const [values, setValues] = useState<Secrets | null>(null);
  const [loading, start] = useTransition();

  // Shown values don't linger on screen.
  useEffect(() => {
    if (!values) return;
    const t = window.setTimeout(() => setValues(null), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [values]);

  function toggle() {
    if (values) {
      setValues(null);
      return;
    }
    start(async () => {
      const res = await revealCredential(entry.id);
      if (handle(res, toggle) && res.values) setValues(res.values);
    });
  }

  return (
    <li className="py-3">
      <div className={cn("grid items-center gap-x-4 gap-y-1.5", COLS)}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content">{entry.title}</p>
          <p className="truncate text-xs text-faint">{entry.updated}</p>
        </div>
        <div className="min-w-0 text-sm">
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-accent-strong hover:underline"
            >
              <span className="truncate">{prettyUrl(entry.url)}</span>
              <Icon name="externalLink" className="size-3.5 shrink-0" />
            </a>
          ) : (
            <span className="text-faint">No login URL</span>
          )}
        </div>
        <SecretCell label="Username" value={values?.username} />
        <SecretCell label="Password" value={values?.password} />
        <div className="flex items-center gap-1 pt-1 md:justify-end md:pt-0">
          <Button size="sm" variant="secondary" onClick={toggle} disabled={loading} className="w-[5.5rem]">
            <Icon name={values ? "eyeOff" : "eye"} className="size-4" />
            {loading ? "…" : values ? "Hide" : "Show"}
          </Button>
          <RowButton label={`Edit ${entry.title}`} icon="pencil" onClick={() => onEdit(entry)} />
          <RowButton label={`Delete ${entry.title}`} icon="trash" danger onClick={() => onDelete(entry)} />
        </div>
      </div>
      {values?.notes && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-canvas px-3 py-2">
          <span className="w-20 shrink-0 pt-px text-xs text-faint">Notes</span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-content">{values.notes}</p>
          <CopyButton value={values.notes} what="notes" />
        </div>
      )}
    </li>
  );
}

function SecretCell({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="w-20 shrink-0 text-xs text-faint md:hidden">{label}</span>
      {value === undefined ? (
        <span className="tracking-widest text-faint">{MASK}</span>
      ) : value === "" ? (
        <span className="text-faint">—</span>
      ) : (
        <>
          <span className="min-w-0 truncate font-mono text-content">{value}</span>
          <CopyButton value={value} what={label.toLowerCase()} />
        </>
      )}
    </div>
  );
}

function CopyButton({ value, what }: { value: string; what: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 1500);
    return () => window.clearTimeout(t);
  }, [done]);

  return (
    <button
      type="button"
      aria-label={`Copy ${what}`}
      title={`Copy ${what}`}
      onClick={async () => {
        try {
          await copySecret(value);
          setDone(true);
          toast.success(`Copied the ${what} — it clears from the clipboard in 2 minutes.`);
        } catch {
          toast.error("Couldn't copy — the browser blocked the clipboard.");
        }
      }}
      className="shrink-0 rounded p-1 text-faint transition-colors hover:bg-canvas hover:text-content"
    >
      <Icon name={done ? "check" : "copy"} className={cn("size-3.5", done && "text-accent-strong")} />
    </button>
  );
}

function RowButton({
  label,
  icon,
  danger,
  onClick,
}: {
  label: string;
  icon: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "rounded-lg p-2 text-faint transition-colors",
        danger
          ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"
          : "hover:bg-canvas hover:text-content",
      )}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

function History({ rows }: { rows: VaultHistoryRow[] }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-faint hover:text-content"
        aria-expanded={open}
      >
        <Icon name="chevronRight" className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        History
      </button>
      {open && (
        <ul className="mt-3 max-h-72 space-y-2.5 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
              <div>
                <p className="text-content">
                  <span className="font-medium">{r.actor}</span> {r.action}
                </p>
                <p className="text-xs text-faint">{r.at}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Add / edit ------------------------------------------------------------------------

function EntryEditor({
  projectId,
  entry,
  values,
  handle,
  onClose,
  onSaved,
}: {
  projectId: string;
  entry: VaultEntry | null;
  values: Secrets | null;
  handle: Handle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: entry?.title ?? "",
    url: entry?.url ?? "",
    username: values?.username ?? "",
    password: values?.password ?? "",
    notes: values?.notes ?? "",
  });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function save() {
    start(async () => {
      const res = await saveCredential({ id: entry?.id, projectId, ...form });
      if (handle(res, save)) onSaved();
    });
  }

  return (
    <Modal title={entry ? `Edit “${entry.title}”` : "Add a login"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Title" htmlFor="cred-title" required hint="Shown to everyone on the project, so keep secrets out of it.">
          <Input id="cred-title" value={form.title} onChange={set("title")} placeholder="WordPress admin" maxLength={120} autoFocus />
        </Field>
        <Field label="Login URL" htmlFor="cred-url">
          <Input id="cred-url" value={form.url} onChange={set("url")} placeholder="https://example.com/wp-admin" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username or email" htmlFor="cred-user">
            <Input id="cred-user" value={form.username} onChange={set("username")} />
          </Field>
          <Field label="Password" htmlFor="cred-pass">
            <PasswordInput id="cred-pass" value={form.password} onChange={set("password")} autoComplete="new-password" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="cred-notes" hint="Anything else: API keys, backup codes, security answers.">
          <Textarea id="cred-notes" value={form.notes} onChange={set("notes")} rows={3} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !form.title.trim()}>
            {pending ? "Saving…" : entry ? "Save" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Access --------------------------------------------------------------------------

function AccessModal({
  projectId,
  access,
  withEdit,
  handle,
  onClose,
}: {
  projectId: string;
  access: VaultAccessInfo;
  withEdit: (then: () => void) => void;
  handle: Handle;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!pick) return;
    const run = () =>
      start(async () => {
        const res = await grantVaultAccess(projectId, pick);
        if (handle(res, run)) {
          setPick("");
          router.refresh();
        }
      });
    withEdit(run);
  }

  function remove(employeeId: string) {
    const run = () =>
      start(async () => {
        const res = await revokeVaultAccess(projectId, employeeId);
        if (handle(res, run)) router.refresh();
      });
    withEdit(run);
  }

  /** Put a removed category owner back on the automatic rule. */
  function restore(employeeId: string) {
    const run = () =>
      start(async () => {
        const res = await grantVaultAccess(projectId, employeeId);
        if (handle(res, run)) router.refresh();
      });
    withEdit(run);
  }

  return (
    <Modal title="Who can use these credentials" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <p className="text-muted">
          Everyone on the client&apos;s portal has access to their own projects. On the team, these people do:
        </p>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Automatic</p>
          <ul className="space-y-1">
            {access.automatic.map((a) => (
              <li key={a.employeeId ?? a.name} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-medium text-content">{a.name}</span>
                  <span className="ml-2 text-xs text-faint">{a.why}</span>
                </span>
                {a.employeeId && (
                  <AccessButton onClick={() => remove(a.employeeId!)} disabled={pending} danger>
                    Remove
                  </AccessButton>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Added by a manager</p>
          {access.added.length === 0 ? (
            <p className="text-muted">Nobody yet.</p>
          ) : (
            <ul className="space-y-1">
              {access.added.map((a) => (
                <li key={a.employeeId} className="flex items-center justify-between gap-3">
                  <span className="font-medium text-content">{a.name}</span>
                  <AccessButton onClick={() => remove(a.employeeId)} disabled={pending} danger>
                    Remove
                  </AccessButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        {access.removed.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Removed by a manager</p>
            <ul className="space-y-1">
              {access.removed.map((a) => (
                <li key={a.employeeId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-muted line-through decoration-faint">{a.name}</span>
                    <span className="ml-2 text-xs text-faint">{a.why}</span>
                  </span>
                  <AccessButton onClick={() => restore(a.employeeId)} disabled={pending}>
                    Restore
                  </AccessButton>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex items-end gap-2 border-t border-line pt-4">
          <div className="min-w-0 flex-1">
            <Combobox
              options={access.candidates.map((c) => ({ value: c.id, label: c.name }))}
              value={pick}
              onChange={setPick}
              placeholder="Add a team member…"
              searchPlaceholder="Search people…"
            />
          </div>
          <Button onClick={add} disabled={!pick || pending}>
            Add
          </Button>
        </section>
        <p className="text-xs text-faint">
          Changing access asks for the same second code as editing. Super Admins always have access.
        </p>
      </div>
    </Modal>
  );
}

function AccessButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted disabled:opacity-50",
        danger
          ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"
          : "hover:bg-canvas hover:text-content",
      )}
    >
      {children}
    </button>
  );
}
