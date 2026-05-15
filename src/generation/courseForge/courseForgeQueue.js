function normalizeConcurrency(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export async function runCourseForgeQueue(tasks = [], { maxConcurrency = 1, stopOnError = false } = {}) {
  const items = Array.isArray(tasks) ? tasks.slice() : [];
  const results = new Array(items.length);
  const concurrency = normalizeConcurrency(maxConcurrency);
  let cursor = 0;
  let failed = false;

  async function worker() {
    while (cursor < items.length) {
      if (stopOnError && failed) {
        return;
      }
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await items[index]() };
      } catch (error) {
        failed = true;
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return {
    ok: results.every((item) => item?.ok !== false),
    results
  };
}
