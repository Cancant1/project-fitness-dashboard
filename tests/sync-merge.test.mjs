import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { TextDecoder, TextEncoder } from "node:util";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const babelSandbox = { console };
babelSandbox.window = babelSandbox;
babelSandbox.self = babelSandbox;
babelSandbox.globalThis = babelSandbox;
vm.createContext(babelSandbox);
vm.runInContext(
  await fs.readFile(path.join(root, "vendor/babel.min.js"), "utf8"),
  babelSandbox,
  { filename: "vendor/babel.min.js" }
);

const stateSource = await fs.readFile(path.join(root, "components/state.jsx"), "utf8");
const testExports = `
window.__syncMergeTests = {
  stateSessionSetCount,
  betterLoggedSession,
  mergeLoggedSessions,
  mergeSessionPlanTombstones,
  mergeSessionPlans,
  mergeRemoteAndLocalState,
  sanitizeProfileForPush,
  fetchGithubState
};`;
const compiled = babelSandbox.Babel.transform(`${stateSource}\n${testExports}`, {
  filename: "components/state.jsx",
  sourceType: "script",
  presets: [
    ["env", { modules: false, targets: { node: "18" } }],
    ["react", { runtime: "classic" }]
  ]
}).code;

const storage = new Map();
const runtime = {
  console,
  structuredClone: value => JSON.parse(JSON.stringify(value)),
  TextEncoder,
  TextDecoder,
  btoa: value => Buffer.from(value, "binary").toString("base64"),
  atob: value => Buffer.from(value, "base64").toString("binary"),
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value))
  },
  React: {
    createContext: () => ({ Provider: () => null }),
    useState: () => [null, () => {}],
    useEffect: () => {},
    useContext: () => null,
    useRef: value => ({ current: value }),
    createElement: () => null
  }
};
runtime.window = runtime;
runtime.self = runtime;
runtime.globalThis = runtime;
runtime.RepsData = {
  normalizeDayKey: value => value ? String(value).slice(0, 3) : null,
  plannedDateForSession: session => session.plannedDate || session.date || null,
  dayName: () => "Mon"
};
vm.createContext(runtime);
vm.runInContext(compiled, runtime, { filename: "components/state.jsx" });

const {
  stateSessionSetCount,
  betterLoggedSession,
  mergeLoggedSessions,
  mergeSessionPlanTombstones,
  mergeSessionPlans,
  mergeRemoteAndLocalState,
  sanitizeProfileForPush
} = runtime.__syncMergeTests;

const session = (sets, updatedAt) => ({
  id: "push-2026-06-08",
  date: "2026-06-08",
  plannedDate: "2026-06-08",
  routineDay: "Mon",
  split: "Push",
  status: "performed",
  performedSetCount: sets.length,
  entries: [{ exercise: "DB Incline Press", sets }],
  updatedAt
});

const weightOnly = session([
  { set: 1, weight: 35, unit: "kg", reps: null, repsNumber: null },
  { set: 2, weight: 35, unit: "kg", reps: null, repsNumber: null }
], "2026-06-08T10:00:00.000Z");
const withReps = session([
  { set: 1, weight: 35, unit: "kg", reps: 8, repsNumber: 8 },
  { set: 2, weight: 35, unit: "kg", reps: 7, repsNumber: 7 }
], "2026-06-08T09:00:00.000Z");

assert.equal(stateSessionSetCount(weightOnly), 0, "weight-only rows must not count as performed sets");
assert.equal(stateSessionSetCount(withReps), 2);
assert.equal(betterLoggedSession(weightOnly, withReps), withReps, "real reps must beat a weight-only session");
assert.equal(mergeLoggedSessions([weightOnly], [withReps])[0], withReps);

const staleDesktopPlan = {
  routineDay: "Mon",
  plannedDate: "2026-06-08",
  setsByExercise: {
    "p-Mon-0": [
      { weight: "35", reps: "", _edited: true },
      { weight: "35", reps: "", _edited: true }
    ]
  },
  updatedAt: "2026-06-08T10:00:00.000Z"
};
const newerPhonePlan = {
  routineDay: "Mon",
  plannedDate: "2026-06-08",
  setsByExercise: {
    "p-Mon-0": [
      { weight: "35", reps: "8", _edited: true },
      { weight: "35", reps: "7", _edited: true }
    ]
  },
  updatedAt: "2026-06-08T10:05:00.000Z"
};
const date = "2026-06-08";

assert.equal(
  mergeSessionPlans({ [date]: newerPhonePlan }, { [date]: staleDesktopPlan }, {})[date],
  newerPhonePlan,
  "a stale browser must not overwrite a newer in-workout draft"
);

const tombstones = mergeSessionPlanTombstones(
  {},
  { [date]: "2026-06-08T10:10:00.000Z" }
);
assert.deepEqual(
  Object.keys(mergeSessionPlans({ [date]: newerPhonePlan }, {}, tombstones)),
  [],
  "a finished session tombstone must prevent an old remote draft from returning"
);

const stateWith = (profilePatch) => ({
  activeProfileId: "profile",
  profiles: [{
    id: "profile",
    name: "Profile",
    routines: [{
      id: "routine",
      days: [{ day: "Mon", exercises: [{ name: "DB Incline Press" }] }]
    }],
    activeRoutineId: "routine",
    ...profilePatch
  }]
});
const integratedMerge = mergeRemoteAndLocalState(
  stateWith({
    loggedSessions: [weightOnly],
    sessionPlansByDate: { [date]: newerPhonePlan }
  }),
  stateWith({
    loggedSessions: [withReps],
    sessionPlansByDate: { [date]: staleDesktopPlan }
  })
);
const integratedProfile = integratedMerge.profiles[0];
assert.equal(integratedProfile.loggedSessions[0].entries[0].sets[0].repsNumber, 8);
assert.equal(
  JSON.stringify(integratedProfile.sessionPlansByDate[date]),
  JSON.stringify(newerPhonePlan)
);

const sanitized = sanitizeProfileForPush({
  routines: [{
    id: "routine",
    days: [{ day: "Mon", exercises: [{ name: "DB Incline Press" }] }]
  }],
  activeRoutineId: "routine",
  loggedSessions: [{
    ...withReps,
    updatedAt: "2026-06-08T10:10:00.000Z"
  }],
  sessionPlansByDate: { [date]: newerPhonePlan },
  sessionPlanTombstones: {}
});
assert.deepEqual(Object.keys(sanitized.sessionPlansByDate), []);
assert.ok(sanitized.sessionPlanTombstones[date]);

// --- GitHub pull: files over 1MB come back with empty content from the
// contents API and must be re-fetched through the git blobs API. ---
const { fetchGithubState } = runtime.__syncMergeTests;
const syncConfig = { owner: "m", repo: "r", branch: "main", path: "state/reps-app-state.json", token: "tok", clientId: "c1" };
const remoteEnvelope = {
  app: "reps-dashboard",
  schemaVersion: 1,
  state: { profiles: [{ id: "p1", name: "Mario", loggedSessions: [withReps] }], activeProfileId: "p1" }
};
const remoteB64 = Buffer.from(JSON.stringify(remoteEnvelope), "utf8").toString("base64");
const chunkedB64 = remoteB64.match(/.{1,60}/g).join("\n"); // blobs API wraps base64 lines

const fetchCalls = [];
runtime.fetch = async (url, opts = {}) => {
  fetchCalls.push(url);
  if (url.includes("/contents/")) {
    return { ok: true, status: 200, json: async () => ({ sha: "bigsha", size: 1500000, content: "", encoding: "none", git_url: "https://api.github.com/repos/m/r/git/blobs/bigsha" }) };
  }
  if (url.includes("/git/blobs/bigsha")) {
    return { ok: true, status: 200, json: async () => ({ sha: "bigsha", content: chunkedB64, encoding: "base64" }) };
  }
  return { ok: false, status: 500, text: async () => "unexpected url: " + url };
};
const largePull = await fetchGithubState(syncConfig);
assert.equal(largePull.sha, "bigsha");
assert.equal(largePull.state.profiles[0].loggedSessions[0].entries[0].sets[0].repsNumber, 8);
assert.equal(fetchCalls.length, 2, "large file pull must fall back to the blobs API");

runtime.fetch = async () => ({ ok: true, status: 200, json: async () => ({ sha: "small", size: 10, content: remoteB64, encoding: "base64" }) });
const smallPull = await fetchGithubState(syncConfig);
assert.equal(smallPull.sha, "small", "small file pull must keep working without a second request");

runtime.fetch = async () => ({ ok: true, status: 200, json: async () => ({ sha: "bad", size: 5, content: Buffer.from("{oops", "utf8").toString("base64"), encoding: "base64" }) });
await assert.rejects(() => fetchGithubState(syncConfig), /could not be parsed/, "corrupt remote file must raise a readable error");

console.log("sync merge regression tests passed");
