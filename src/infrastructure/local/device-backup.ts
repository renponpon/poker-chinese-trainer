export const DEVICE_BACKUP_KEY = "phrabit-before-sync-upgrade-20260906-v1";
export const DEVICE_RECOVERY_KEY = "phrabit-device-recovery-v1";
const OWNER_KEY = "phrabit-account-cache-owner-v1";
const RESCUE_PREFIX = "phrabit-before-device-restore-v1:";
let verifiedBackupRaw: string | null = null;
const DATA_KEYS = [
  "poker-chinese-local-phrases-v1", "poker-chinese-srs-v1",
  "poker-chinese-phrase-categories-v1", "poker-chinese-starter-phrases-v1",
  "poker-chinese-nickname-v1", "poker-chinese-owner-key-v1",
  "phrabit-translation-history-v1", "phrabit-learning-language-v1", OWNER_KEY,
];

export type DeviceBackup = {
  format: "phrabit-device-backup-v1";
  createdAt: string;
  origin: string;
  owner: string;
  entries: [string, string][];
};

function isDataKey(key: string): boolean {
  return DATA_KEYS.includes(key) || key.startsWith("phrabit-account-checkpoint-v1:") || key.startsWith("phrabit-account-merge-v1:");
}

export function captureDeviceData(storage: Storage = window.localStorage): DeviceBackup {
  const keys = new Set(DATA_KEYS);
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isDataKey(key)) keys.add(key);
  }
  return {
    format: "phrabit-device-backup-v1", createdAt: new Date().toISOString(),
    origin: window.location?.origin ?? "", owner: storage.getItem(OWNER_KEY) ?? "guest",
    entries: [...keys].sort().flatMap((key) => {
      const value = storage.getItem(key);
      return value === null ? [] : [[key, value] as [string, string]];
    }),
  };
}

export function parseDeviceBackup(raw: string): DeviceBackup {
  const backup = JSON.parse(raw) as DeviceBackup;
  if (backup?.format !== "phrabit-device-backup-v1" || typeof backup.origin !== "string"
    || typeof backup.owner !== "string" || !Number.isFinite(Date.parse(backup.createdAt))
    || !Array.isArray(backup.entries) || backup.entries.length > 10000) {
    throw new Error("バックアップの形式を確認できません。");
  }
  const keys = new Set<string>();
  for (const entry of backup.entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string"
      || typeof entry[1] !== "string" || !isDataKey(entry[0]) || keys.has(entry[0])) {
      throw new Error("バックアップに対応していない項目が含まれています。");
    }
    keys.add(entry[0]);
  }
  const owner = backup.entries.find(([key]) => key === OWNER_KEY)?.[1] ?? "guest";
  if (backup.owner !== owner) throw new Error("バックアップのアカウント情報が一致しません。");
  return backup;
}

export function isDeviceRecoveryActive(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(DEVICE_RECOVERY_KEY) !== null;
}

export function ensureDeviceBackup(): void {
  if (typeof window === "undefined") return;
  const storage = window.localStorage;
  if (isDeviceRecoveryActive()) throw new Error("復元確認中のため、編集とクラウド同期を停止しています。");
  const existing = storage.getItem(DEVICE_BACKUP_KEY);
  if (existing !== null) {
    if (existing !== verifiedBackupRaw) parseDeviceBackup(existing);
    verifiedBackupRaw = existing;
    return;
  }
  const raw = JSON.stringify(captureDeviceData(storage));
  storage.setItem(DEVICE_BACKUP_KEY, raw);
  if (storage.getItem(DEVICE_BACKUP_KEY) !== raw) throw new Error("更新前データを退避できませんでした。");
  verifiedBackupRaw = raw;
}

export function readDeviceBackup(): DeviceBackup | null {
  const raw = window.localStorage.getItem(DEVICE_BACKUP_KEY);
  return raw === null ? null : parseDeviceBackup(raw);
}

export function readPreRestoreBackup(): DeviceBackup | null {
  const recovery = window.localStorage.getItem(DEVICE_RECOVERY_KEY);
  if (recovery === null) return null;
  const { rescueKey } = JSON.parse(recovery) as { rescueKey?: string };
  if (typeof rescueKey !== "string" || !rescueKey.startsWith(RESCUE_PREFIX)) throw new Error("復元直前の退避先を確認できません。");
  const raw = window.localStorage.getItem(rescueKey);
  if (raw === null) throw new Error("復元直前の退避データが見つかりません。");
  return parseDeviceBackup(raw);
}

export function restoreDeviceBackup(backup: DeviceBackup): void {
  if (isDeviceRecoveryActive()) throw new Error("復元確認中のため、再度の復元は停止しています。");
  const validated = parseDeviceBackup(JSON.stringify(backup));
  const storage = window.localStorage;
  if (validated.origin !== window.location.origin || validated.owner !== (storage.getItem(OWNER_KEY) ?? "guest")) {
    throw new Error("同じサイト・同じアカウント状態のバックアップだけ復元できます。");
  }
  const current = captureDeviceData(storage);
  const rescueKey = RESCUE_PREFIX + crypto.randomUUID();
  const rawCurrent = JSON.stringify(current);
  storage.setItem(rescueKey, rawCurrent);
  if (storage.getItem(rescueKey) !== rawCurrent) throw new Error("現在のデータを退避できないため復元を停止しました。");
  const recovery = JSON.stringify({ restoredAt: new Date().toISOString(), rescueKey });
  storage.setItem(DEVICE_RECOVERY_KEY, recovery);
  if (storage.getItem(DEVICE_RECOVERY_KEY) !== recovery) throw new Error("同期停止を確認できないため復元を停止しました。");
  window.dispatchEvent(new Event("phrabit-device-safety-changed"));
  const desired = new Map(validated.entries);
  for (const [key, value] of desired) {
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error("復元の途中で保存に失敗しました。退避データを保持し、同期を停止しています。");
  }
  for (const [key] of current.entries) {
    if (!desired.has(key)) storage.removeItem(key);
  }
  for (const [key] of current.entries) {
    if (storage.getItem(key) !== (desired.get(key) ?? null)) throw new Error("復元後の照合に失敗しました。同期は停止したままです。");
  }
  window.dispatchEvent(new Event("phrabit-device-safety-changed"));
}

export function downloadDeviceBackup(backup: DeviceBackup, label: string): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `phrabit-${label}-${backup.createdAt.slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
