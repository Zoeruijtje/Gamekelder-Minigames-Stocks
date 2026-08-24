import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lower = (value: number, best: number, worst: number) => Number.isFinite(value)
  ? clamp(1 - ((value - best) / Math.max(worst - best, 0.0001)), 0, 1)
  : 0;

function serviceKey(): string {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Service role key unavailable");
  return key;
}

function scoreOne(game: string, config: any, input: any) {
  if (game === "reaction") {
    const ms = Number(input?.reactionMs);
    const valid = Number.isFinite(ms) && ms >= 80 && ms <= 2500 && !input?.falseStart;
    const value = valid ? ms : 999;
    return {
      normalized: lower(value, 150, 650),
      raw: { reactionMs: value, invalid: !valid },
      tie: value,
      label: valid ? `${Math.round(value)} ms` : "False start / no result",
    };
  }

  if (game === "stop-clock") {
    const elapsed = Number(input?.elapsedMs);
    const valid = Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 30000;
    const error = valid ? Math.abs(elapsed - Number(config.targetMs ?? 5000)) : 999999;
    return {
      normalized: lower(error, 0, 1800),
      raw: { elapsedMs: valid ? elapsed : null, error },
      tie: error,
      label: valid ? `${(elapsed / 1000).toFixed(3)} s · ${Math.round(error)} ms off` : "No result",
    };
  }

  if (game === "memory-grid") {
    const selected = new Set<number>((input?.selected ?? []).map(Number));
    const target = new Set<number>((config.pattern ?? []).map(Number));
    const hits = [...target].filter((cell) => selected.has(cell)).length;
    const falseHits = [...selected].filter((cell) => !target.has(cell)).length;
    return {
      normalized: clamp((hits - falseHits * 0.55) / Math.max(target.size, 1), 0, 1),
      raw: { hits, falseHits },
      tie: falseHits,
      label: `${hits}/${target.size} correct${falseHits ? ` · ${falseHits} false` : ""}`,
    };
  }

  if (game === "closest-wins") {
    const answer = Number(input?.answer);
    const truth = Number(config.question?.answer ?? 0);
    const error = Number.isFinite(answer)
      ? Math.abs(answer - truth) / Math.max(Math.abs(truth), 1)
      : 1;
    return {
      normalized: clamp(1 - Math.log10(1 + error * 9), 0, 1),
      raw: { answer: Number.isFinite(answer) ? answer : null, error },
      tie: error,
      label: Number.isFinite(answer) ? `${(error * 100).toFixed(1)}% off` : "No answer",
    };
  }

  if (game === "higher-lower") {
    const answers = input?.answers ?? [];
    let correct = 0;
    (config.pairs ?? []).forEach((pair: any, index: number) => {
      const truth = Number(pair.right[1]) > Number(pair.left[1]) ? "higher" : "lower";
      if (answers[index] === truth) correct += 1;
    });
    return {
      normalized: correct / Math.max((config.pairs ?? []).length, 1),
      raw: { correct },
      tie: Number(input?.elapsedMs ?? 999999),
      label: `${correct}/${(config.pairs ?? []).length} correct`,
    };
  }

  return { normalized: 0, raw: {}, tie: 999999, label: "No valid result" };
}

function scoreGroup(game: string, config: any, submissions: Record<string, any>, ids: string[]) {
  if (game === "minority-rules") {
    const counts: Record<string, number> = { A: 0, B: 0 };
    Object.values(submissions).forEach((submission: any) => {
      if (submission?.choice === "A" || submission?.choice === "B") counts[submission.choice] += 1;
    });
    const tied = counts.A === counts.B;
    const winner = tied ? null : counts.A < counts.B ? "A" : "B";
    return ids.map((id) => {
      const choice = submissions[id]?.choice;
      const normalized = tied ? 0.5 : choice === winner ? 1 : 0;
      return {
        user_id: id,
        normalized,
        raw: { choice, counts },
        tie: 0,
        label: tied ? "Perfect tie" : choice === winner ? "Minority winner" : "Majority",
      };
    });
  }

  if (game === "prisoners-dilemma") {
    const matrix = config.matrix ?? { CC: 3, BC: 5, CB: 0, BB: 1 };
    const ordered = [...ids].sort();
    const results: any[] = [];
    for (let index = 0; index < ordered.length; index += 2) {
      const left = ordered[index];
      const right = ordered[index + 1] ?? ordered[0];
      const leftChoice = submissions[left]?.choice === "betray" ? "B" : "C";
      const rightChoice = submissions[right]?.choice === "betray" ? "B" : "C";
      const leftPoints = Number(matrix[`${leftChoice}${rightChoice}`] ?? 0);
      const rightPoints = Number(matrix[`${rightChoice}${leftChoice}`] ?? 0);
      results.push({
        user_id: left,
        normalized: leftPoints / 5,
        raw: { points: leftPoints, choice: leftChoice, opponent: right },
        tie: 0,
        label: `${leftPoints} points`,
      });
      if (right !== left) {
        results.push({
          user_id: right,
          normalized: rightPoints / 5,
          raw: { points: rightPoints, choice: rightChoice, opponent: left },
          tie: 0,
          label: `${rightPoints} points`,
        });
      }
    }
    return results;
  }

  if (game === "prediction-desk") {
    const winner = Object.entries(config.hiddenSignals ?? {})
      .sort((left: any, right: any) => Number(right[1]) - Number(left[1]))[0]?.[0];
    return ids.map((id) => {
      const prediction = submissions[id]?.predictionId;
      const correct = prediction === winner;
      return {
        user_id: id,
        normalized: correct ? 1 : 0.15,
        raw: { prediction, winner },
        tie: 0,
        label: correct ? "Correct prediction" : "Prediction missed",
      };
    });
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return out({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization = request.headers.get("Authorization") ?? "";
    const userClient = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return out({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey());
    const db = admin.schema("friend_exchange");
    const { round_id: roundId, force = false } = await request.json();
    if (!roundId) throw new Error("round_id is required");

    const { data: round, error: roundError } = await db
      .from("rounds")
      .select("*")
      .eq("id", roundId)
      .single();
    if (roundError) throw roundError;
    if (round.settled_at) return out({ round_id: roundId, duplicate: true });

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("*")
      .eq("id", round.session_id)
      .single();
    if (sessionError) throw sessionError;

    const { data: room, error: roomError } = await db
      .from("rooms")
      .select("*")
      .eq("id", session.room_id)
      .single();
    if (roomError) throw roomError;

    const { data: membership } = await db
      .from("room_members")
      .select("role")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (room.host_id !== user.id && !["host", "cohost"].includes(membership?.role)) {
      return out({ error: "Host permission required" }, 403);
    }
    if (!["game", "settling"].includes(round.status)) {
      return out({ error: `Round cannot settle from ${round.status}` }, 409);
    }

    const { data: members, error: membersError } = await db
      .from("room_members")
      .select("user_id")
      .eq("room_id", room.id)
      .neq("role", "spectator");
    if (membersError) throw membersError;
    const ids = members.map((member) => member.user_id);

    const { data: submissions, error: submissionsError } = await db
      .from("round_submissions")
      .select("user_id,payload")
      .eq("round_id", roundId);
    if (submissionsError) throw submissionsError;
    const missing = ids.length - submissions.length;
    const deadlinePassed = round.locks_at && Date.now() >= new Date(round.locks_at).getTime();
    if (missing > 0 && !force) {
      return out({ error: "Not all players have submitted", missing_submission_count: missing }, 409);
    }
    if (missing > 0 && force && !deadlinePassed) {
      return out({ error: "Forced settlement is only allowed after the deadline" }, 409);
    }

    const { data: ratings, error: ratingsError } = await db
      .from("game_ratings")
      .select("user_id,category,rating")
      .in("user_id", ids);
    if (ratingsError) throw ratingsError;

    const ratingMap: Record<string, Record<string, number>> = Object.fromEntries(
      ids.map((id) => [id, {}]),
    );
    ratings.forEach((rating) => {
      ratingMap[rating.user_id][rating.category] = rating.rating;
    });

    const submissionMap = Object.fromEntries(
      submissions.map((submission) => [submission.user_id, submission.payload]),
    );
    ids.forEach((id) => {
      if (!submissionMap[id]) submissionMap[id] = {};
    });

    const groupScores = scoreGroup(round.game_type, round.config, submissionMap, ids);
    const scores = groupScores ?? ids.map((id) => ({
      user_id: id,
      ...scoreOne(round.game_type, round.config, submissionMap[id]),
    }));
    scores.sort((left, right) => right.normalized - left.normalized || left.tie - right.tie);
    scores.forEach((score, index) => {
      score.rank = index + 1;
    });

    const categoryRatings = ids.map((id) => ratingMap[id][round.category] ?? 1000);
    const averageRating = categoryRatings.reduce((sum, value) => sum + value, 0)
      / Math.max(categoryRatings.length, 1);
    const expected = Object.fromEntries(ids.map((id) => [
      id,
      1 / (1 + 10 ** ((averageRating - (ratingMap[id][round.category] ?? 1000)) / 180)),
    ]));

    const factor = session.settings?.volatility === "chaos"
      ? 1.35
      : session.settings?.volatility === "calm"
        ? 0.72
        : 1;
    const cap = session.settings?.volatility === "chaos"
      ? 0.18
      : session.settings?.volatility === "calm"
        ? 0.08
        : 0.12;

    const rawMoves = scores.map((score) => {
      const actual = ids.length <= 1 ? 1 : 1 - ((score.rank - 1) / (ids.length - 1));
      const surprise = actual - expected[score.user_id];
      return {
        user_id: score.user_id,
        actual,
        expected: expected[score.user_id],
        raw: (
          surprise * 0.22
          + (actual - 0.5) * 0.025
          + (score.normalized - 0.5) * 0.025
        ) * factor,
      };
    });
    const mean = rawMoves.reduce((sum, item) => sum + item.raw, 0)
      / Math.max(rawMoves.length, 1);
    const moves = rawMoves.map((item) => ({
      user_id: item.user_id,
      return: Math.round(clamp(item.raw - mean, -cap, cap) * 10000) / 10000,
      reason: round.game_type,
    }));
    const moveById = Object.fromEntries(moves.map((move) => [move.user_id, move]));

    const results = scores.map((score) => ({
      user_id: score.user_id,
      rank: score.rank,
      normalized_score: score.normalized,
      raw_score: { ...score.raw, label: score.label },
      expected_percentile: expected[score.user_id],
      actual_percentile: ids.length <= 1 ? 1 : 1 - ((score.rank - 1) / (ids.length - 1)),
      stock_return: moveById[score.user_id].return,
      xp_awarded: Math.max(20, (ids.length - score.rank + 1) * 50),
    }));
    const ratingUpdates = results.map((result) => ({
      user_id: result.user_id,
      category: round.category,
      delta: Math.round(42 * (result.actual_percentile - result.expected_percentile)),
    }));

    const { data: applied, error: applyError } = await db.rpc("apply_round_settlement", {
      p_round_id: roundId,
      p_results: results,
      p_moves: moves,
      p_algorithm_version: session.algorithm_version,
      p_rating_updates: ratingUpdates,
    });
    if (applyError) throw applyError;

    return out({ ...applied, results, moves });
  } catch (error) {
    return out({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
