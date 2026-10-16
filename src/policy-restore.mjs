import { isDeepStrictEqual } from "node:util";

function cloneJson(value, label) {
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    throw new TypeError(`${label} must be JSON data: ${error.message}`);
  }
  if (encoded === undefined) throw new TypeError(`${label} must be JSON data.`);
  return JSON.parse(encoded);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pointer(path) {
  return `/${path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function parsePointer(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value === "/") {
    throw new TypeError("restorePaths must contain non-root JSON Pointer paths.");
  }
  const parts = value.slice(1).split("/").map((part) => {
    if (/~(?![01])/u.test(part)) throw new TypeError(`Invalid JSON Pointer path: ${value}`);
    return part.replaceAll("~1", "/").replaceAll("~0", "~");
  });
  if (parts.some((part) => part === "")) throw new TypeError(`Invalid JSON Pointer path: ${value}`);
  return parts;
}

function getAtPath(value, path) {
  let current = value;
  for (const part of path) {
    if (!isRecord(current) || !Object.hasOwn(current, part)) return { exists: false };
    current = current[part];
  }
  return { exists: true, value: current };
}

function setAtPath(value, path, target) {
  let current = value;
  for (const part of path.slice(0, -1)) {
    if (!Object.hasOwn(current, part)) current[part] = {};
    if (!isRecord(current[part])) throw new TypeError(`Cannot restore nested policy path: ${pointer(path)}`);
    current = current[part];
  }
  const leaf = path.at(-1);
  if (target.exists) current[leaf] = cloneJson(target.value, "snapshot policy value");
  else delete current[leaf];
}

function selectedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new TypeError("restorePaths must explicitly list the policy paths to restore.");
  }
  const protectedRoots = new Set(["services", "serviceRules", "audit", "auditHistory", "auditLog"]);
  const parsed = paths.map((path) => ({ path, parts: parsePointer(path) }));
  for (const { path, parts } of parsed) {
    if (parts.some((part) => protectedRoots.has(part))) {
      throw new TypeError(`Policy path is protected from restore: ${path}`);
    }
  }
  parsed.sort((a, b) => a.path.localeCompare(b.path));
  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1].parts;
    const current = parsed[index].parts;
    if (previous.every((part, partIndex) => current[partIndex] === part)) {
      throw new TypeError("restorePaths must not contain duplicate or overlapping paths.");
    }
  }
  return parsed;
}

function diffPolicies(current, target, path = []) {
  const changes = [];
  const currentIsRecord = isRecord(current);
  const targetIsRecord = isRecord(target);

  if (currentIsRecord && targetIsRecord) {
    const keys = [...new Set([...Object.keys(current), ...Object.keys(target)])].sort();
    for (const key of keys) {
      const currentHas = Object.hasOwn(current, key);
      const targetHas = Object.hasOwn(target, key);
      const nextPath = [...path, key];
      if (!currentHas) {
        changes.push({ path: pointer(nextPath), operation: "add", after: cloneJson(target[key], "policy value") });
      } else if (!targetHas) {
        changes.push({ path: pointer(nextPath), operation: "remove", before: cloneJson(current[key], "policy value") });
      } else {
        changes.push(...diffPolicies(current[key], target[key], nextPath));
      }
    }
    return changes;
  }

  if (!isDeepStrictEqual(current, target)) {
    changes.push({
      path: pointer(path),
      operation: "replace",
      before: cloneJson(current, "policy value"),
      after: cloneJson(target, "policy value"),
    });
  }
  return changes;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Display the difference between a verified pre-incident copy and the current
 * test policy, then optionally restore that copy to a test-only policy store.
 */
export async function restoreTestPolicy({
  snapshot,
  intrusionAt,
  verifySnapshot,
  testPolicy,
  restorePaths,
  presentPreview,
  confirmRestore,
}) {
  if (typeof verifySnapshot !== "function") throw new TypeError("verifySnapshot(snapshot) is required.");
  if (!testPolicy || testPolicy.environment !== "test"
    || typeof testPolicy.read !== "function" || typeof testPolicy.replace !== "function") {
    throw new TypeError("A test-only policy store with read() and replace(policy) is required.");
  }
  if (typeof presentPreview !== "function" || typeof confirmRestore !== "function") {
    throw new TypeError("presentPreview(preview) and confirmRestore(preview) are required.");
  }
  const pathsToRestore = selectedPaths(restorePaths);

  const saved = cloneJson(snapshot, "snapshot");
  if (!isRecord(saved) || typeof saved.version !== "string" || !saved.version.trim()
    || typeof saved.createdAt !== "string" || !isRecord(saved.policy)) {
    throw new TypeError("Snapshot must include a version, createdAt, and policy object.");
  }
  const snapshotTime = Date.parse(saved.createdAt);
  const incidentTime = Date.parse(intrusionAt);
  if (!Number.isFinite(snapshotTime) || !Number.isFinite(incidentTime) || snapshotTime >= incidentTime) {
    throw new Error("The policy copy must have a valid timestamp before the intrusion.");
  }

  const isVerified = () => verifySnapshot(cloneJson(saved, "snapshot for verification"));
  if (await isVerified() !== true) {
    throw new Error("The pre-incident policy copy could not be verified; restore stopped.");
  }

  const current = cloneJson(await testPolicy.read(), "current test policy");
  if (!isRecord(current)) throw new TypeError("Current test policy must be a JSON object.");

  const changes = [];
  for (const { parts } of pathsToRestore) {
    const before = getAtPath(current, parts);
    const after = getAtPath(saved.policy, parts);
    if (!before.exists && after.exists) {
      changes.push({ path: pointer(parts), operation: "add", after: cloneJson(after.value, "policy value") });
    } else if (before.exists && !after.exists) {
      changes.push({ path: pointer(parts), operation: "remove", before: cloneJson(before.value, "policy value") });
    } else if (before.exists && after.exists) {
      changes.push(...diffPolicies(before.value, after.value, parts));
    }
  }
  const preview = deepFreeze({
    version: saved.version,
    createdAt: saved.createdAt,
    scope: changes.map(({ path }) => path),
    changes,
  });

  await presentPreview(preview);
  if (changes.length === 0) return { applied: false, preview };
  if (await confirmRestore(preview) !== true) return { applied: false, preview };

  if (await isVerified() !== true) {
    throw new Error("The pre-incident policy copy failed re-verification; restore stopped.");
  }

  const latest = cloneJson(await testPolicy.read(), "current test policy");
  if (!isDeepStrictEqual(latest, current)) {
    throw new Error("The test policy changed after preview; review a fresh preview before restoring.");
  }

  const restored = cloneJson(current, "current test policy");
  for (const { parts } of pathsToRestore) {
    setAtPath(restored, parts, getAtPath(saved.policy, parts));
  }
  await testPolicy.replace(restored);
  return { applied: true, preview };
}
