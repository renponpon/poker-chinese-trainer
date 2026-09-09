import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import test from "node:test";

test("Notion follow-up uses uncached native fetch without changing saved content", async (context) => {
  const previousKey = process.env.NOTION_API_KEY;
  const previousDatabase = process.env.NOTION_DATABASE_ID;
  process.env.NOTION_API_KEY = "offline-notion-key";
  process.env.NOTION_DATABASE_ID = "offline-database";
  context.after(() => {
    if (previousKey === undefined) delete process.env.NOTION_API_KEY;
    else process.env.NOTION_API_KEY = previousKey;
    if (previousDatabase === undefined) delete process.env.NOTION_DATABASE_ID;
    else process.env.NOTION_DATABASE_ID = previousDatabase;
  });
  const refuseNetwork = () => { throw new Error("Real network requests are forbidden in this test"); };
  context.mock.method(http, "request", refuseNetwork);
  context.mock.method(https, "request", refuseNetwork);
  context.mock.method(console, "warn", () => {});
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = [];
  let queryResults: { id: string }[] = [{ id: "offline-page" }];
  let failurePath = "";
  let networkFailure = false;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, "https://api.notion.com");
    assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer offline-notion-key");
    assert.equal(headers.get("notion-version"), "2022-06-28");
    requests.push({ path: url.pathname, method: init?.method ?? "GET", body: JSON.parse(String(init?.body ?? "{}")) });
    if (networkFailure) throw new TypeError("offline network failure");
    if (url.pathname === failurePath) {
      return Response.json({ object: "error", status: 403, code: "restricted_resource", message: "offline denied" }, { status: 403 });
    }
    return url.pathname.endsWith("/query")
      ? Response.json({ object: "list", results: queryResults, has_more: false, next_cursor: null })
      : Response.json({ object: "page", id: "offline-page" });
  });
  const { updatePhraseFollowUp } = await import("./notion");

  await context.test("keeps schema setup, phrase lookup and explanation/pinyin update", async () => {
    assert.equal(await updatePhraseFollowUp("offline-phrase", { explanation: "元の解説と句読点を維持。", pinyin: "zhǐ xū yào" }), true);
    assert.deepEqual(requests.map(({ method, path }) => ({ method, path })), [
      { method: "PATCH", path: "/v1/databases/offline-database" },
      { method: "POST", path: "/v1/databases/offline-database/query" },
      { method: "PATCH", path: "/v1/pages/offline-page" },
    ]);
    assert.ok(requests[0].body.properties);
    assert.deepEqual(requests[1].body, { filter: { property: "Phrase ID", rich_text: { equals: "offline-phrase" } }, page_size: 1 });
    assert.deepEqual(requests[2].body, { properties: {
      Grammar: { rich_text: [{ text: { content: "元の解説と句読点を維持。" } }] },
      Pinyin: { rich_text: [{ text: { content: "zhǐ xū yào" } }] },
    } });
  });

  await context.test("does not overwrite pinyin when only an explanation is provided", async () => {
    requests.length = 0;
    assert.equal(await updatePhraseFollowUp("offline-phrase", { explanation: "解説だけ更新" }), true);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].body, { properties: { Grammar: { rich_text: [{ text: { content: "解説だけ更新" } }] } } });
  });

  await context.test("returns false without creating a missing phrase", async () => {
    requests.length = 0;
    queryResults = [];
    assert.equal(await updatePhraseFollowUp("missing-phrase", { explanation: "保存しない" }), false);
    assert.equal(requests.length, 1);
  });

  await context.test("preserves Notion permission errors instead of reporting success", async () => {
    requests.length = 0;
    queryResults = [{ id: "offline-page" }];
    failurePath = "/v1/pages/offline-page";
    await assert.rejects(updatePhraseFollowUp("offline-phrase", { explanation: "拒否される更新" }), { code: "restricted_resource", status: 403 });
    assert.equal(requests.length, 2);
    failurePath = "";
  });

  await context.test("propagates network failures without an automatic duplicate request", async () => {
    requests.length = 0;
    networkFailure = true;
    await assert.rejects(updatePhraseFollowUp("offline-phrase", { explanation: "接続失敗" }), /offline network failure/);
    assert.equal(requests.length, 1);
    networkFailure = false;
  });

  await context.test("skips an empty phrase identifier without a request", async () => {
    requests.length = 0;
    assert.equal(await updatePhraseFollowUp("", { explanation: "保存しない" }), false);
    assert.equal(requests.length, 0);
  });
});
