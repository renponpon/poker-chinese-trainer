import assert from "node:assert/strict";
import test from "node:test";
import { reserveAiBudget, AiBudgetError, withAiBudgetSettlements } from "./ai-budget";

test("budget guard fails closed and never retries an ambiguous reservation", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://budget-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  let calls = 0;
  try {
    for (const result of ["unconfigured", "duplicate", "exceeded", null]) {
      globalThis.fetch = async () => { calls += 1; return Response.json(result); };
      await assert.rejects(reserveAiBudget("test", 1), AiBudgetError);
    }
    assert.equal(calls, 4);
    globalThis.fetch = async () => { calls += 1; throw new Error("network failure"); };
    await assert.rejects(reserveAiBudget("test", 1), AiBudgetError);
    assert.equal(calls, 5);
    await assert.rejects(reserveAiBudget("test", 0), AiBudgetError);
    assert.equal(calls, 5);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await assert.rejects(reserveAiBudget("test", 1), AiBudgetError);
    assert.equal(calls, 5);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("settlement scheduling preserves reservation safety and request isolation", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalWarn = console.warn;
  const originalError = console.error;
  context.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://budget-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  let blockSettlement = Promise.resolve();
  let settlementFails = false;
  console.warn = () => {};
  console.error = () => {};
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").at(-1)!;
    calls.push({ method, body: JSON.parse(String(init?.body)) });
    if (method === "reserve_ai_budget") return Response.json("reserved");
    assert.equal(method, "settle_ai_budget");
    await blockSettlement;
    if (settlementFails) throw new Error("settlement offline");
    return Response.json("settled");
  };

  await context.test("ordinary settlement returns without waiting, and is scheduled once", async () => {
    calls.length = 0;
    const tasks: Array<() => Promise<void>> = [];
    await withAiBudgetSettlements((task) => { tasks.push(task); }, async () => {
      const budget = await reserveAiBudget("test", 100);
      await budget.settle(2);
      await budget.settle(2);
    });
    assert.equal(calls.length, 1);
    assert.equal(tasks.length, 1);
    await tasks[0]();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.reservation_id, calls[0].body.reservation_id);
    assert.equal(calls[1].body.actual_units, 2);
  });
  await context.test("each simultaneous request captures its own scheduler", async () => {
    const firstTasks: Array<() => Promise<void>> = [];
    const secondTasks: Array<() => Promise<void>> = [];
    const [first, second] = await Promise.all([
      withAiBudgetSettlements((task) => { firstTasks.push(task); }, () => reserveAiBudget("first", 100)),
      withAiBudgetSettlements((task) => { secondTasks.push(task); }, () => reserveAiBudget("second", 100)),
    ]);
    await Promise.all([first.settle(1), second.settle(2)]);
    assert.equal(firstTasks.length, 1);
    assert.equal(secondTasks.length, 1);
    await firstTasks[0]();
    assert.equal(calls.at(-1)!.body.actual_units, 1);
    await secondTasks[0]();
    assert.equal(calls.at(-1)!.body.actual_units, 2);
  });
  await context.test("under-reservation is settled immediately, never deferred", async () => {
    let release = () => {};
    blockSettlement = new Promise<void>((resolve) => { release = resolve; });
    const tasks: Array<() => Promise<void>> = [];
    let finished = false;
    const operation = withAiBudgetSettlements((task) => { tasks.push(task); }, async () => {
      const budget = await reserveAiBudget("test", 1);
      await budget.settle(2);
      finished = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(finished, false);
    assert.equal(tasks.length, 0);
    assert.equal(calls.at(-1)!.method, "settle_ai_budget");
    release();
    await operation;
    blockSettlement = Promise.resolve();
  });
  await context.test("missing request context falls back to awaited settlement", async () => {
    const budget = await reserveAiBudget("test", 100);
    await budget.settle(2);
    assert.equal(calls.at(-1)!.method, "settle_ai_budget");
  });
  await context.test("scheduler failure falls back without bypassing accounting", async () => {
    const countBefore = calls.length;
    await withAiBudgetSettlements(() => { throw new Error("no after context"); }, async () => {
      const budget = await reserveAiBudget("test", 100);
      await budget.settle(2);
    });
    assert.equal(calls.length, countBefore + 2);
    assert.equal(calls.at(-1)!.method, "settle_ai_budget");
  });
  await context.test("failed settlement is not retried or replaced with a zero refund", async () => {
    settlementFails = true;
    const countBefore = calls.length;
    const budget = await reserveAiBudget("test", 100);
    await budget.settle(2);
    await budget.settle(2);
    assert.equal(calls.length, countBefore + 2);
    assert.equal(calls.at(-1)!.body.actual_units, 2);
    settlementFails = false;
  });
  await context.test("invalid units do not schedule work or poison a later valid settlement", async () => {
    const tasks: Array<() => Promise<void>> = [];
    await withAiBudgetSettlements((task) => { tasks.push(task); }, async () => {
      const budget = await reserveAiBudget("test", 100);
      for (const units of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) await budget.settle(units);
      assert.equal(tasks.length, 0);
      await budget.settle(2);
    });
    assert.equal(tasks.length, 1);
    await tasks[0]();
  });
});
