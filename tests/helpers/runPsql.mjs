import { spawn } from "node:child_process";

function databaseError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function seconds(milliseconds) {
  return (milliseconds / 1000).toFixed(3).replace(/(?:\.0+|0+)$/u, "");
}

function databaseSpec(databaseUrl, password, {
  dockerContainer,
  processTimeoutMs,
  killGraceMs
}) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw databaseError("invalid_database_session", "Conexão PostgreSQL inválida.");
  }
  const username = decodeURIComponent(parsed.username || "");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, "")) || "postgres";
  const resolvedPassword = password || decodeURIComponent(parsed.password || "");
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol) ||
      !parsed.hostname || !username || !resolvedPassword) {
    throw databaseError("invalid_database_session", "Conexão PostgreSQL incompleta.");
  }
  const common = [
    "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
    "--username", username, "--dbname", database
  ];
  if (dockerContainer) {
    return {
      command: "docker",
      argumentsList: [
        "exec", "-i", "-e", "PGPASSWORD", dockerContainer,
        "timeout", "-s", "TERM", "-k", seconds(killGraceMs),
        seconds(processTimeoutMs + killGraceMs), "psql", ...common
      ],
      environment: { ...process.env, PGPASSWORD: resolvedPassword }
    };
  }
  return {
    command: "psql",
    argumentsList: [
      "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
      "--host", parsed.hostname, "--port", parsed.port || "5432",
      "--username", username, "--dbname", database
    ],
    environment: { ...process.env, PGPASSWORD: resolvedPassword }
  };
}

export function runPsql(input, {
  databaseUrl,
  password,
  dockerContainer = null,
  processTimeoutMs = 12 * 60 * 1000,
  killGraceMs = 5_000
} = {}) {
  if (!Number.isInteger(processTimeoutMs) || processTimeoutMs < 1 ||
      processTimeoutMs > 30 * 60 * 1000 || !Number.isInteger(killGraceMs) ||
      killGraceMs < 1 || killGraceMs > 30_000) {
    throw databaseError("invalid_database_timeout", "Limite do processo PostgreSQL inválido.");
  }
  const spec = databaseSpec(databaseUrl, password, {
    dockerContainer,
    processTimeoutMs,
    killGraceMs
  });
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.argumentsList, {
      env: spec.environment,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout = [];
    let stderrBytes = 0;
    let closed = false;
    let timeoutError = null;
    let forceTimer = null;
    const processTimer = setTimeout(() => {
      timeoutError = databaseError(
        "database_process_timeout",
        "PostgreSQL excedeu o limite da operação."
      );
      child.stdin.destroy();
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
    }, processTimeoutMs);
    const finish = () => {
      clearTimeout(processTimer);
      if (forceTimer) clearTimeout(forceTimer);
    };
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 1024 * 1024 && !timeoutError) {
        timeoutError = databaseError(
          "database_error_output_limit",
          "Resposta de erro do PostgreSQL excedeu o limite."
        );
        child.stdin.destroy();
        child.kill("SIGTERM");
      }
    });
    child.once("error", () => {
      if (closed) return;
      closed = true;
      finish();
      reject(timeoutError || databaseError(
        "database_session_unavailable",
        "Sessão PostgreSQL indisponível."
      ));
    });
    child.once("close", (code) => {
      if (closed) return;
      closed = true;
      finish();
      if (timeoutError) reject(timeoutError);
      else if (code !== 0) reject(databaseError(
        "database_command_failed",
        "PostgreSQL recusou a operação."
      ));
      else resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.once("error", () => {});
    child.stdin.end(input);
  });
}
