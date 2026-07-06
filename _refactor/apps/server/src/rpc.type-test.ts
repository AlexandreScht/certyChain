/**
 * Sonde de types RPC — jamais exécutée, jamais bundlée (l'entrée tsup est
 * server.ts, et le glob de tests ne matche que `*.test.ts`).
 *
 * Elle fait échouer `tsc --noEmit` si le schéma RPC cesse de circuler :
 * une route re-déclarée hors du style chaîné (voir la note dans app.ts)
 * disparaît du type `AppType` et casse ce fichier — avant de casser les fronts.
 */
import { hc } from "hono/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { MfaChallengeDTO } from "@certifychain/contract/dto";
import type { AppType } from "./app";

const probe = hc<AppType>("http://type-probe.invalid");

type Assert<T extends true> = T;

// /health est enregistrée et typée.
type HealthBody = InferResponseType<typeof probe.health.$get, 200>;
type _HealthOk = Assert<HealthBody extends { status: string } ? true : false>;

// POST /auth/school/login — l'entrée est inférée du validateur Zod…
type LoginInput = InferRequestType<typeof probe.auth.school.login.$post>;
type _LoginTakesCredentials = Assert<
  LoginInput extends { json: { email: string; password: string } } ? true : false
>;

// …et le corps 2xx est compatible avec le DTO du contrat.
type LoginBody = InferResponseType<typeof probe.auth.school.login.$post, 200>;
type _LoginIsMfaChallenge = Assert<LoginBody extends MfaChallengeDTO ? true : false>;

export {};
