import { after } from "next/server";
import { withAiBudgetSettlements } from "../../infrastructure/server/ai-budget";

export function withDeferredBudgetSettlement(handler: (request: Request) => Promise<Response>) {
  return (request: Request): Promise<Response> => withAiBudgetSettlements(after, () => handler(request));
}
