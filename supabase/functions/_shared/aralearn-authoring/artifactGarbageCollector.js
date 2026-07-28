import { supabaseServerHeaders } from "./supabaseEnvironment.js";

function storageHeaders(serverApiKey) {
  return supabaseServerHeaders(serverApiKey, { contentType: false });
}

function objectUrl(supabaseUrl, artifact) {
  const path = String(artifact.objectKey).split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(artifact.bucket)}/${path}`;
}

export class ArtifactGarbageCollector {
  constructor({
    rpc,
    supabaseUrl,
    serverApiKey,
    fetchImpl = globalThis.fetch,
    batchSize = 25
  }) {
    this.rpc = rpc;
    this.supabaseUrl = String(supabaseUrl).replace(/\/+$/u, "");
    this.serverApiKey = serverApiKey;
    this.fetchImpl = fetchImpl;
    this.batchSize = batchSize;
  }

  async collect({
    olderThan = "7 days",
    terminalOlderThan = "30 days"
  } = {}) {
    const released = await this.rpc("release_expired_authoring_artifact_links_v3", {
      p_older_than: terminalOlderThan,
      p_limit: this.batchSize
    }, { timeoutMs: 8_000, deadlineAt: Date.now() + 9_000 });
    const releaseResult = Array.isArray(released) ? released[0] || {} : released || {};
    const claimToken = globalThis.crypto.randomUUID();
    const claimed = await this.rpc("claim_unreferenced_artifacts_v3", {
      p_claim_token: claimToken,
      p_older_than: olderThan,
      p_limit: this.batchSize
    }, { timeoutMs: 8_000, deadlineAt: Date.now() + 9_000 });
    const artifacts = Array.isArray(claimed) ? claimed : [];
    let deleted = 0;
    for (const artifact of artifacts) {
      const url = objectUrl(this.supabaseUrl, artifact);
      let response = await this.fetchImpl(url, {
        method: "DELETE",
        headers: storageHeaders(this.serverApiKey)
      });
      let objectAbsent = response.ok || response.status === 404;
      if (!objectAbsent) {
        response = await this.fetchImpl(url, {
          method: "HEAD",
          headers: storageHeaders(this.serverApiKey)
        });
        objectAbsent = response.status === 404;
      }
      await this.rpc("complete_artifact_gc_v3", {
        p_claim_token: claimToken,
        p_hash: artifact.hash,
        p_object_absent: objectAbsent
      }, { timeoutMs: 5_000, deadlineAt: Date.now() + 6_000 });
      if (objectAbsent) deleted += 1;
    }
    return {
      status: artifacts.length === this.batchSize ? "partial" : "completed",
      releasedLinks: Number(releaseResult.releasedLinks || 0),
      claimed: artifacts.length,
      deleted
    };
  }
}
