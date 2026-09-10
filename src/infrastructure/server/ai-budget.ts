import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createTimedRequest } from "../../lib/timed-request";

type SettlementScheduler = (task: () => Promise<void>) => void;
const settlementScheduler = new AsyncLocalStorage<SettlementScheduler>();

export function withAiBudgetSettlements<Result>(schedule: SettlementScheduler, task: () => Result): Result {
  return settlementScheduler.run(schedule, task);
}

export class AiBudgetError extends Error {
  readonly retryable = false;
  constructor(public readonly code: "ai_budget_exceeded" | "ai_budget_unavailable") {
    super(code === "ai_budget_exceeded"
      ? "サービス全体の生成予算に達しました。保存済みフレーズの閲覧・復習・同期は利用できます。"
      : "生成予算を確認できないため、一時的に生成を停止しています。保存済みフレーズは利用できます。");
    this.name = "AiBudgetError";
  }
  get status() { return this.code === "ai_budget_exceeded" ? 429 : 503; }
}

async function budgetRpc(name: string, body: Record<string, unknown>): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AiBudgetError("ai_budget_unavailable");
  try {
    return await createTimedRequest(8_000).run(async (signal) => {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal, cache: "no-store",
      });
      if (!response.ok) throw new AiBudgetError("ai_budget_unavailable");
      const result: unknown = await response.json();
      if (typeof result !== "string") throw new AiBudgetError("ai_budget_unavailable");
      return result;
    });
  } catch {
    throw new AiBudgetError("ai_budget_unavailable");
  }
}

export async function reserveAiBudget(operation: string, units: number) {
  if (!Number.isSafeInteger(units) || units < 1) throw new AiBudgetError("ai_budget_unavailable");
  const reservationId = randomUUID();
  const status = await budgetRpc("reserve_ai_budget", {
    reservation_id: reservationId, operation_name: operation, requested_units: units,
  });
  if (status !== "reserved") {
    throw new AiBudgetError(status === "exceeded" ? "ai_budget_exceeded" : "ai_budget_unavailable");
  }
  const schedule = settlementScheduler.getStore();
  let settlementStarted = false;
  return {
    async settle(actualUnits: number): Promise<void> {
      if (!Number.isSafeInteger(actualUnits) || actualUnits < 1 || actualUnits > 2_147_483_647 || settlementStarted) return;
      settlementStarted = true;
      const settle = async () => {
        try {
          const result = await budgetRpc("settle_ai_budget", { reservation_id: reservationId, actual_units: actualUnits });
          if (result !== "settled") console.error("[ai-budget] settlement requires operator review", { reservationId, result });
        } catch {
          console.warn("[ai-budget] reservation retained after settlement failure", { reservationId });
        }
      };
      if (schedule && actualUnits <= units) {
        try {
          schedule(settle);
          return;
        } catch {
          console.warn("[ai-budget] settling inline because background scheduling is unavailable", { reservationId });
        }
      }
      await settle();
    },
  };
}
