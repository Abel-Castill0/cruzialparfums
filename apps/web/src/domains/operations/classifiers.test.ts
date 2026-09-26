import {expect,it} from "vitest";
import {workerState,launchBlockerLabel} from "./classifiers";
it("classifies never run, stale daily heartbeat and failed runs honestly",()=>{expect(workerState(null)).toBe("never_run");expect(workerState({last_started_at:"2026-09-25T00:00:00Z",last_finished_at:"2026-09-25T00:01:00Z",status:"ok"},Date.parse("2026-09-27T00:00:00Z"))).toBe("stale");expect(workerState({last_started_at:"2026-09-25T00:00:00Z",status:"failed"})).toBe("failed");});
it("distinguishes running from a crashed worker",()=>expect(workerState({last_started_at:"2026-09-25T00:00:00Z",status:"running"},Date.parse("2026-09-25T00:06:00Z"))).toBe("stale"));
it("explains factual blockers without exposing settings values",()=>expect(launchBlockerLabel("legal.ruc")).toBe("RUC"));
