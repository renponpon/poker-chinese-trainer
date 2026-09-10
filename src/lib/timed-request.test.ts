import assert from "node:assert/strict";
import test from "node:test";
import { createTimedRequest, RequestStoppedError } from "./timed-request";

test("deadline ends even when the transport ignores cancellation", async () => {
  const request = createTimedRequest(10);
  await assert.rejects(request.run(() => new Promise(() => {})), (error: unknown) => error instanceof RequestStoppedError && error.code === "request_timeout");
});

test("cancel rejects once and a late response cannot replace the next request", async () => {
  const request = createTimedRequest();
  let finish: (value: string) => void = () => {};
  const pending = request.run(() => new Promise<string>((resolve) => { finish = resolve; }));
  request.cancel();
  await assert.rejects(pending, (error: unknown) => error instanceof RequestStoppedError && error.code === "request_cancelled");
  assert.equal(await createTimedRequest().run(async () => "new result"), "new result");
  finish("old result");
});

test("normal completion, errors, and cancellation before starting are preserved", async () => {
  assert.equal(await createTimedRequest().run(async () => 42), 42);
  await assert.rejects(createTimedRequest().run(async () => { throw new Error("provider error"); }), /provider error/);
  const request = createTimedRequest();
  request.cancel();
  await assert.rejects(request.run(async () => { throw new Error("must not start"); }), RequestStoppedError);
});
