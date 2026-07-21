function requestResult(request, operation) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error || new Error(`Falha no IndexedDB durante ${operation}.`)),
      { once: true }
    );
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error || new Error("Transação relacional abortada.")),
      { once: true }
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error || new Error("Falha na transação relacional.")),
      { once: true }
    );
  });
}

export class RelationalTransaction {
  #transaction;
  #storeNames;
  #completion;
  #finished = false;

  constructor(transaction, storeNames = []) {
    if (!transaction || typeof transaction.objectStore !== "function") {
      throw new TypeError("Transação IndexedDB inválida.");
    }
    this.#transaction = transaction;
    this.#storeNames = new Set(Array.from(storeNames, String));
    this.#completion = transactionResult(transaction).finally(() => {
      this.#finished = true;
    });
  }

  get mode() {
    return this.#transaction.mode;
  }

  get storeNames() {
    return [...this.#storeNames];
  }

  #store(storeName) {
    const normalizedName = String(storeName || "");
    if (!this.#storeNames.has(normalizedName)) {
      throw new Error(`Object store fora da transação: "${normalizedName}".`);
    }
    if (this.#finished) {
      throw new Error("A transação relacional já foi encerrada.");
    }
    return this.#transaction.objectStore(normalizedName);
  }

  get(storeName, key) {
    return requestResult(this.#store(storeName).get(key), `ler ${storeName}`);
  }

  getAll(storeName, query = undefined, count = undefined) {
    const store = this.#store(storeName);
    const request = count === undefined ? store.getAll(query) : store.getAll(query, count);
    return requestResult(request, `listar ${storeName}`);
  }

  getAllByIndex(storeName, indexName, query = undefined, count = undefined) {
    const index = this.#store(storeName).index(indexName);
    const request = count === undefined ? index.getAll(query) : index.getAll(query, count);
    return requestResult(request, `consultar ${storeName}.${indexName}`);
  }

  count(storeName, query = undefined) {
    return requestResult(this.#store(storeName).count(query), `contar ${storeName}`);
  }

  countByIndex(storeName, indexName, query = undefined) {
    return requestResult(
      this.#store(storeName).index(indexName).count(query),
      `contar ${storeName}.${indexName}`
    );
  }

  put(storeName, value, key = undefined) {
    const store = this.#store(storeName);
    const request = key === undefined ? store.put(value) : store.put(value, key);
    return requestResult(request, `gravar ${storeName}`);
  }

  async putMany(storeName, values = []) {
    if (!Array.isArray(values)) {
      throw new TypeError("putMany exige uma lista de linhas.");
    }
    return Promise.all(values.map((value) => this.put(storeName, value)));
  }

  queuePutMany(storeName, values = []) {
    if (!Array.isArray(values)) {
      throw new TypeError("queuePutMany exige uma lista de linhas.");
    }
    const store = this.#store(storeName);
    values.forEach((value) => store.put(value));
    return values.length;
  }

  add(storeName, value, key = undefined) {
    const store = this.#store(storeName);
    const request = key === undefined ? store.add(value) : store.add(value, key);
    return requestResult(request, `adicionar em ${storeName}`);
  }

  queueAddMany(storeName, values = []) {
    if (!Array.isArray(values)) {
      throw new TypeError("queueAddMany exige uma lista de linhas.");
    }
    const store = this.#store(storeName);
    values.forEach((value) => store.add(value));
    return values.length;
  }

  delete(storeName, key) {
    return requestResult(this.#store(storeName).delete(key), `excluir de ${storeName}`);
  }

  clear(storeName) {
    return requestResult(this.#store(storeName).clear(), `limpar ${storeName}`);
  }

  abort() {
    if (!this.#finished) {
      this.#transaction.abort();
    }
  }

  commit() {
    if (!this.#finished && typeof this.#transaction.commit === "function") {
      this.#transaction.commit();
    }
  }

  done() {
    return this.#completion;
  }
}
