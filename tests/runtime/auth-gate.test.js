import assert from "node:assert/strict";
import test from "node:test";

import { renderAuthGate } from "../../src/ui/AuthGate.js";

function authFixture({ error, recoveryMode = false } = {}) {
  const status = { textContent: "", dataset: {} };
  const listeners = new Map();
  const modeListeners = new Map();
  const emailInput = {
    value: "pessoa@example.test",
    checkValidity() { return true; },
    reportValidity() {}
  };
  const form = {
    values: new Map([
      ["email", "pessoa@example.test"],
      ["password", "senha-segura"],
      ["passwordConfirmation", "senha-segura"]
    ]),
    addEventListener(type, listener) { listeners.set(type, listener); },
    querySelector() { return { disabled: false }; },
    querySelectorAll() { return []; },
    elements: { namedItem(name) { return name === "email" ? emailInput : null; } }
  };
  const resend = {
    disabled: false,
    addEventListener(type, listener) { listeners.set("resend", listener); }
  };
  const root = {
    innerHTML: "",
    querySelector(selector) {
      if (selector === "[data-auth-status]") return status;
      if (selector === "[data-auth-form]") return form;
      if (selector === "[data-auth-resend]" && this.innerHTML.includes("data-auth-resend")) {
        return resend;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector !== "[data-auth-mode]") return [];
      return [...this.innerHTML.matchAll(/data-auth-mode="([^"]+)"/gu)].map((match) => ({
        dataset: { authMode: match[1] },
        addEventListener(type, listener) { modeListeners.set(match[1], listener); }
      }));
    }
  };
  const calls = [];
  const fail = (operation) => async () => {
    calls.push(operation);
    throw error;
  };
  const authClient = {
    recoveryMode,
    signIn: fail("signIn"),
    signUp: fail("signUp"),
    requestPasswordReset: fail("requestPasswordReset"),
    updatePassword: fail("updatePassword"),
    resendConfirmation: fail("resendConfirmation")
  };
  return { root, status, form, listeners, modeListeners, authClient, calls };
}

async function submit(fixture) {
  await fixture.listeners.get("submit")({
    preventDefault() {},
    currentTarget: fixture.form
  });
}

async function withFormData(run) {
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values.get(name); }
  };
  try {
    await run();
  } finally {
    globalThis.FormData = NativeFormData;
  }
}

test("login troca erro técnico por orientação contextual", async () => {
  const fixture = authFixture({
    error: Object.assign(new Error("Email not confirmed"), { status: 400 })
  });
  await withFormData(async () => {
    renderAuthGate({ root: fixture.root, authClient: fixture.authClient });
    await submit(fixture);
  });

  assert.equal(
    fixture.status.textContent,
    "Não foi possível entrar. Confira o e-mail e a senha."
  );
  assert.doesNotMatch(fixture.status.textContent, /Email not confirmed|400/iu);
});

test("cada fluxo de acesso explica a operação que falhou", async (t) => {
  for (const scenario of [
    {
      name: "cadastro",
      mode: "signup",
      error: Object.assign(new Error("User already registered"), { status: 422 }),
      expected: "Não foi possível criar a conta."
    },
    {
      name: "recuperação",
      mode: "recover",
      error: Object.assign(new Error("Email not confirmed"), { status: 400 }),
      expected: "Não foi possível enviar a recuperação."
    },
    {
      name: "atualização de senha",
      recoveryMode: true,
      error: Object.assign(
        new Error("Password should be at least 6 characters"),
        { status: 422 }
      ),
      expected: "Não foi possível salvar a nova senha."
    }
  ]) {
    await t.test(scenario.name, async () => {
      const fixture = authFixture({
        error: scenario.error,
        recoveryMode: scenario.recoveryMode
      });
      await withFormData(async () => {
        renderAuthGate({ root: fixture.root, authClient: fixture.authClient });
        if (scenario.mode) fixture.modeListeners.get(scenario.mode)();
        await submit(fixture);
      });
      assert.equal(fixture.status.textContent, scenario.expected);
      assert.doesNotMatch(
        fixture.status.textContent,
        /Email not confirmed|User already registered|Password should|400|422/iu
      );
    });
  }

  await t.test("reenvio de confirmação", async () => {
    const fixture = authFixture({
      error: Object.assign(new Error("Email not confirmed"), { status: 400 })
    });
    renderAuthGate({ root: fixture.root, authClient: fixture.authClient });
    fixture.modeListeners.get("signup")();
    await fixture.listeners.get("resend")({ currentTarget: { disabled: false } });
    assert.equal(fixture.status.textContent, "Não foi possível reenviar a confirmação.");
    assert.doesNotMatch(fixture.status.textContent, /Email not confirmed|400/iu);
  });
});

test("divergência entre senhas é validada localmente antes do provedor", async () => {
  const fixture = authFixture({ recoveryMode: true, error: new Error("Provider failure") });
  fixture.form.values.set("passwordConfirmation", "senha-diferente");
  await withFormData(async () => {
    renderAuthGate({ root: fixture.root, authClient: fixture.authClient });
    await submit(fixture);
  });

  assert.equal(fixture.status.textContent, "As duas senhas precisam ser iguais.");
  assert.deepEqual(fixture.calls, []);
});
