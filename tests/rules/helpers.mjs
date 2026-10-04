// Shared setup for the Firestore rules tests. Run with: npm run test:rules (starts the local emulator).
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, setLogLevel } from "firebase/firestore";

setLogLevel("silent"); // denied writes are expected in these tests

export async function startEnv() {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  return initializeTestEnvironment({
    projectId: "demo-lunker-tests", // separate from the "demo-lunker" data the app uses with ?emulator
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host, port: Number(port) },
  });
}

/* A league owned by "owner", with "admin2" as a second admin and "member" as an ordinary member. */
export async function seedLeague(env, { code = "WALLEYE-1234" } = {}) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "config/league"), { name: "Test League", ownerUid: "owner", admins: ["owner", "admin2"], createdAt: 1 });
    await setDoc(doc(db, "config/invite"), { code });
    for (const id of ["owner", "admin2", "member"]) {
      await setDoc(doc(db, "members", id), { displayName: id, joinedAt: 1, suspended: false });
    }
  });
}

export const as = (env, uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
