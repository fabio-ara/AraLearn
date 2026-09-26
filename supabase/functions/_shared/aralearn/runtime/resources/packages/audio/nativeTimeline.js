// Web Speech especifica segundos; Chromium ainda emite milissegundos. A unidade
// é reconhecida pelos próprios eventos, sem depender do nome/versão do navegador.
// O relógio serve só para conferir a unidade: não inventa progresso sem evento.
export function createNativeSpeechTimeline() {
  let origin = null;
  let factor = null;
  let pausedAt = null;
  let excluded = 0;
  let seconds = 0;
  return {
    update(event, phase = "boundary") {
      const raw = event?.elapsedTime;
      const stamp = event?.timeStamp;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 ||
          typeof stamp !== "number" || !Number.isFinite(stamp)) return null;
      if (phase === "start") {
        origin = { raw, stamp };
        return 0;
      }
      if (!origin) return null;
      const wallSeconds = (stamp - origin.stamp) / 1000;
      const rawDelta = raw - origin.raw;
      if (factor === null && wallSeconds >= 0.05 && rawDelta > 0) {
        const ratio = rawDelta / wallSeconds;
        if (ratio >= 0.2 && ratio <= 5) factor = 1;
        else if (ratio >= 200 && ratio <= 5000) factor = 0.001;
      }
      if (phase === "resume" && pausedAt !== null) {
        excluded += Math.max(0, raw - pausedAt);
        pausedAt = null;
      }
      if (phase === "pause" && pausedAt === null) pausedAt = raw;
      if (factor === null || rawDelta < 0 || rawDelta * factor > wallSeconds + 1) return null;
      const next = ((pausedAt ?? raw) - origin.raw - excluded) * factor;
      if (next < seconds) return null;
      seconds = next;
      return seconds;
    }
  };
}
