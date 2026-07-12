/** Signature de webhook Stripe — la porte avant tout déclenchement payé. */
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../../../apps/server/src/lib/stripe";

const SECRET = "whsec_jest_secret";
const NOW = 1_770_000_000;

function sign(body: string, secret: string, ts: number): string {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

const event = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });

describe("verifyWebhookSignature", () => {
  it("accepte une signature valide et parse l'événement", () => {
    const header = `t=${NOW},v1=${sign(event, SECRET, NOW)}`;
    const parsed = verifyWebhookSignature(event, header, SECRET, 300, NOW);
    expect(parsed?.type).toBe("checkout.session.completed");
  });

  it("refuse un corps altéré", () => {
    const header = `t=${NOW},v1=${sign(event, SECRET, NOW)}`;
    expect(verifyWebhookSignature(`${event} `, header, SECRET, 300, NOW)).toBeNull();
  });

  it("refuse un mauvais secret", () => {
    const header = `t=${NOW},v1=${sign(event, "whsec_autre", NOW)}`;
    expect(verifyWebhookSignature(event, header, SECRET, 300, NOW)).toBeNull();
  });

  it("refuse un timestamp périmé (anti-rejeu)", () => {
    const old = NOW - 3600;
    const header = `t=${old},v1=${sign(event, SECRET, old)}`;
    expect(verifyWebhookSignature(event, header, SECRET, 300, NOW)).toBeNull();
  });

  it("refuse header absent / v1 absent / secret vide", () => {
    expect(verifyWebhookSignature(event, undefined, SECRET, 300, NOW)).toBeNull();
    expect(verifyWebhookSignature(event, `t=${NOW}`, SECRET, 300, NOW)).toBeNull();
    const header = `t=${NOW},v1=${sign(event, SECRET, NOW)}`;
    expect(verifyWebhookSignature(event, header, "", 300, NOW)).toBeNull();
  });

  it("accepte si AU MOINS une signature v1 correspond (rotation de secret)", () => {
    const good = sign(event, SECRET, NOW);
    const header = `t=${NOW},v1=${"0".repeat(64)},v1=${good}`;
    expect(verifyWebhookSignature(event, header, SECRET, 300, NOW)?.id).toBe("evt_1");
  });

  it("refuse un JSON invalide même bien signé", () => {
    const bad = "{not json";
    const header = `t=${NOW},v1=${sign(bad, SECRET, NOW)}`;
    expect(verifyWebhookSignature(bad, header, SECRET, 300, NOW)).toBeNull();
  });
});
