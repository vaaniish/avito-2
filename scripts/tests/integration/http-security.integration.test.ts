import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, test } from "node:test";
import cors from "cors";
import express from "express";
import {
  applyToMutationMethods,
  createJsonRateLimit,
  isCorsOriginAllowed,
  parseCorsAllowedOrigins,
} from "../../../backend/src/lib/http-security";

const servers = new Set<Server>();

after(async () => {
  await Promise.all(
    Array.from(servers).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
  servers.clear();
});

async function listen(app: express.Express): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");
    servers.add(server);
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve http-security test server address"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("http security integration: mutation rate limit throttles POST and leaves GET alone", async () => {
  const app = express();
  app.use(
    "/limited",
    applyToMutationMethods(
      createJsonRateLimit({
        windowMs: 60_000,
        max: 2,
        message: "Too many checkout requests. Please try again later.",
      }),
    ),
  );
  app.get("/limited", (_req, res) => {
    res.json({ ok: true, method: "GET" });
  });
  app.post("/limited", (_req, res) => {
    res.json({ ok: true, method: "POST" });
  });

  const baseUrl = await listen(app);

  for (let index = 0; index < 3; index += 1) {
    const getResponse = await fetch(`${baseUrl}/limited`);
    assert.equal(getResponse.status, 200);
  }

  const firstPost = await fetch(`${baseUrl}/limited`, { method: "POST" });
  const secondPost = await fetch(`${baseUrl}/limited`, { method: "POST" });
  const thirdPost = await fetch(`${baseUrl}/limited`, { method: "POST" });

  assert.equal(firstPost.status, 200);
  assert.equal(secondPost.status, 200);
  assert.equal(thirdPost.status, 429);
  assert.deepEqual(await thirdPost.json(), {
    error: "Too many checkout requests. Please try again later.",
  });
});

test("http security integration: CORS allowlist grants configured origin and rejects others", async () => {
  const app = express();
  const allowedOrigins = parseCorsAllowedOrigins("https://allowed.example");
  app.use(
    cors({
      origin(origin, callback) {
        if (isCorsOriginAllowed(origin, allowedOrigins)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed by CORS"));
      },
    }),
  );
  app.get("/ping", (_req, res) => {
    res.json({ ok: true });
  });

  const baseUrl = await listen(app);
  const allowedResponse = await fetch(`${baseUrl}/ping`, {
    headers: {
      Origin: "https://allowed.example",
    },
  });
  assert.equal(allowedResponse.status, 200);
  assert.equal(
    allowedResponse.headers.get("access-control-allow-origin"),
    "https://allowed.example",
  );

  const blockedResponse = await fetch(`${baseUrl}/ping`, {
    headers: {
      Origin: "https://blocked.example",
    },
  });
  assert.equal(blockedResponse.status, 500);
});
