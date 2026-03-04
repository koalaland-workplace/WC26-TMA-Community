import http from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 8787);

const DAILY_KICK_CAP = 2500;
const DEFAULT_SPIN_DAILY_CAP = 10;
const QUIZ_RULES = { easy: 2, medium: 2, hard: 1 };
const SPIN_REWARDS = [
  { id: 'k50', label: '50 KICK', chance: 30, type: 'kick', value: 50 },
  { id: 'k100', label: '100 KICK', chance: 25, type: 'kick', value: 100 },
  { id: 'k200', label: '200 KICK', chance: 10, type: 'kick', value: 200 },
  { id: 'q2x', label: '2x Quiz today', chance: 10, type: 'quiz_boost', value: 2 },
  { id: 'r3x', label: '3x Referral today', chance: 5, type: 'ref_boost', value: 3 },
  { id: 'ticket', label: 'Rising Box Ticket', chance: 5, type: 'ticket', value: 1 },
  { id: 'nothing', label: 'Nothing', chance: 15, type: 'none', value: 0 }
];

const QUIZ_BANK = [
  {
    id: 'q-e-1',
    diff: 'easy',
    pts: 50,
    text: 'Who won the FIFA World Cup in 2018?',
    opts: ['France', 'Croatia', 'Brazil', 'Germany'],
    correct: 0
  },
  {
    id: 'q-e-2',
    diff: 'easy',
    pts: 50,
    text: 'Which country hosted the FIFA World Cup in 2022?',
    opts: ['Qatar', 'Russia', 'Brazil', 'South Africa'],
    correct: 0
  },
  {
    id: 'q-e-3',
    diff: 'easy',
    pts: 50,
    text: 'Lionel Messi represents which country?',
    opts: ['Argentina', 'Spain', 'Portugal', 'Uruguay'],
    correct: 0
  },
  {
    id: 'q-e-4',
    diff: 'easy',
    pts: 50,
    text: 'Kylian Mbappe represents which country?',
    opts: ['France', 'Belgium', 'England', 'Germany'],
    correct: 0
  },
  {
    id: 'q-e-5',
    diff: 'easy',
    pts: 50,
    text: 'Which nation has won the most FIFA World Cup titles?',
    opts: ['Brazil', 'Germany', 'Italy', 'Argentina'],
    correct: 0
  },

  {
    id: 'q-m-1',
    diff: 'medium',
    pts: 100,
    text: 'Which team won UEFA Euro 2024?',
    opts: ['Spain', 'England', 'France', 'Italy'],
    correct: 0
  },
  {
    id: 'q-m-2',
    diff: 'medium',
    pts: 100,
    text: 'Which team won Copa America 2021?',
    opts: ['Argentina', 'Brazil', 'Uruguay', 'Chile'],
    correct: 0
  },
  {
    id: 'q-m-3',
    diff: 'medium',
    pts: 100,
    text: 'Who won the UEFA Champions League in 2023-24?',
    opts: ['Real Madrid', 'Manchester City', 'Inter', 'Bayern Munich'],
    correct: 0
  },
  {
    id: 'q-m-4',
    diff: 'medium',
    pts: 100,
    text: 'What is the listed position of Kevin De Bruyne?',
    opts: ['Midfielder', 'Forward', 'Defender', 'Goalkeeper'],
    correct: 0
  },
  {
    id: 'q-m-5',
    diff: 'medium',
    pts: 100,
    text: 'Which nation won FIFA World Cup 2014?',
    opts: ['Germany', 'Argentina', 'Brazil', 'Spain'],
    correct: 0
  },

  {
    id: 'q-h-1',
    diff: 'hard',
    pts: 200,
    text: 'Who holds the record for most FIFA World Cup goals?',
    opts: ['Miroslav Klose', 'Ronaldo Nazario', 'Lionel Messi', 'Kylian Mbappe'],
    correct: 0
  },
  {
    id: 'q-h-2',
    diff: 'hard',
    pts: 200,
    text: 'How many FIFA World Cup titles does Brazil have?',
    opts: ['5', '4', '6', '3'],
    correct: 0
  },
  {
    id: 'q-h-3',
    diff: 'hard',
    pts: 200,
    text: 'Which one is a club competition (not national teams)?',
    opts: ['UEFA Champions League', 'FIFA World Cup', 'UEFA Euro', 'Copa America'],
    correct: 0
  },
  {
    id: 'q-h-4',
    diff: 'hard',
    pts: 200,
    text: 'How many World Cup titles does Argentina have?',
    opts: ['3', '2', '4', '1'],
    correct: 0
  },
  {
    id: 'q-h-5',
    diff: 'hard',
    pts: 200,
    text: 'How many World Cup titles does France have?',
    opts: ['2', '1', '3', '4'],
    correct: 0
  }
];

const sessions = new Map();

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function dayDiff(a, b) {
  if (!a || !b) return 999;
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function seededInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFromSeed(seed) {
  let a = seed || 123456789;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rand) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function pickNByDiff(diff, n, rand) {
  const pool = QUIZ_BANK.filter((q) => q.diff === diff);
  return shuffled(pool, rand).slice(0, n);
}

function buildQuizDailySet(session) {
  const today = dayKey();
  const rand = rngFromSeed(seededInt(`quiz:${today}:${session.sessionId}`));
  const selected = [
    ...pickNByDiff('easy', QUIZ_RULES.easy, rand),
    ...pickNByDiff('medium', QUIZ_RULES.medium, rand),
    ...pickNByDiff('hard', QUIZ_RULES.hard, rand)
  ];
  return shuffled(selected, rand).map((q) => ({
    id: q.id,
    diff: q.diff,
    pts: q.pts,
    text: q.text,
    opts: q.opts.slice(),
    correct: q.correct
  }));
}

function createSession(sessionId) {
  const today = dayKey();
  return {
    sessionId,
    kick: 24350,
    economy: {
      day: today,
      dailyEarned: 0
    },
    quiz: {
      day: '',
      questions: [],
      answers: {},
      streak: 0,
      lastQuizDay: '',
      boostDay: '',
      boostMult: 1
    },
    spin: {
      day: today,
      used: 0,
      invite: 0,
      share: 0,
      tickets: 0,
      cap: DEFAULT_SPIN_DAILY_CAP
    },
    referral: {
      boostDay: '',
      boostMult: 1,
      f1Registered: 7,
      f1Active7: 3,
      f2Registered: 25,
      f2Active7: 16
    },
    penalty: {
      day: today,
      soloPlays: 0,
      matches: {}
    }
  };
}

function ensureToday(session) {
  const today = dayKey();

  if (session.economy.day !== today) {
    session.economy.day = today;
    session.economy.dailyEarned = 0;
  }

  if (session.quiz.lastQuizDay && dayDiff(session.quiz.lastQuizDay, today) > 1) {
    session.quiz.streak = 0;
  }

  if (session.quiz.boostDay !== today) {
    session.quiz.boostDay = '';
    session.quiz.boostMult = 1;
  }

  if (session.referral.boostDay !== today) {
    session.referral.boostDay = '';
    session.referral.boostMult = 1;
  }

  if (session.spin.day !== today) {
    session.spin.day = today;
    session.spin.used = 0;
    session.spin.invite = 0;
    session.spin.share = 0;
  }

  if (session.penalty.day !== today) {
    session.penalty.day = today;
    session.penalty.soloPlays = 0;
    session.penalty.matches = {};
  }

  if (session.quiz.day !== today) {
    session.quiz.day = today;
    session.quiz.questions = buildQuizDailySet(session);
    session.quiz.answers = {};
  }
}

function getSession(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  if (!sessions.has(sid)) sessions.set(sid, createSession(sid));
  const s = sessions.get(sid);
  ensureToday(s);
  return s;
}

function applyKick(session, delta) {
  let applied = Number(delta || 0);
  if (!Number.isFinite(applied) || applied === 0) return 0;

  ensureToday(session);

  if (applied > 0) {
    const remain = Math.max(0, DAILY_KICK_CAP - session.economy.dailyEarned);
    if (remain <= 0) {
      applied = 0;
    } else {
      applied = Math.min(applied, remain);
      session.economy.dailyEarned += applied;
    }
  }

  if (applied < 0) {
    session.kick = Math.max(0, session.kick + applied);
  } else if (applied > 0) {
    session.kick += applied;
  }

  return applied;
}

function spinCap(session) {
  const hardCap = Math.max(1, Math.floor(Number(session.spin.cap || DEFAULT_SPIN_DAILY_CAP)));
  const invite = Math.max(0, Math.floor(Number(session.spin.invite || 0)));
  const share = Math.max(0, Math.floor(Number(session.spin.share || 0)));
  return Math.min(hardCap, 1 + invite + share);
}

function spinLeft(session) {
  return Math.max(0, spinCap(session) - Math.max(0, Number(session.spin.used || 0)));
}

function pickSpinReward() {
  const r = Math.random() * 100;
  let acc = 0;
  for (let i = 0; i < SPIN_REWARDS.length; i += 1) {
    acc += SPIN_REWARDS[i].chance;
    if (r <= acc) return SPIN_REWARDS[i];
  }
  return SPIN_REWARDS[SPIN_REWARDS.length - 1];
}

function getSoloShotRate(plays) {
  return Math.max(0.05, 0.75 - Math.max(0, Number(plays || 0)) * 0.10);
}

function penaltyMaxShots(match) {
  return match.regShots + match.sdShots;
}

function penaltySyncScores(match) {
  match.meScore = 0;
  match.oppScore = 0;
  for (let i = 0; i < match.myIdx; i += 1) if (match.mySeq[i]) match.meScore += 1;
  for (let j = 0; j < match.oppIdx; j += 1) if (match.oppSeq[j]) match.oppScore += 1;
}

function penaltyEvaluate(match) {
  penaltySyncScores(match);
  const reg = match.regShots;
  const sd = match.sdShots;
  const myReg = Math.min(match.myIdx, reg);
  const oppReg = Math.min(match.oppIdx, reg);

  if (myReg < reg || oppReg < reg) {
    match.done = false;
    return;
  }

  if (!match.suddenActive) {
    if (match.meScore === match.oppScore) {
      match.suddenActive = true;
      match.done = false;
      return;
    }
    match.done = true;
    return;
  }

  const sdMy = Math.max(0, match.myIdx - reg);
  const sdOpp = Math.max(0, match.oppIdx - reg);
  if (sdMy !== sdOpp) {
    match.done = false;
    return;
  }
  if (match.meScore !== match.oppScore) {
    match.done = true;
    return;
  }
  if (sdMy >= sd) {
    match.done = true;
    return;
  }
  match.done = false;
}

function penaltyExpectedActor(match) {
  penaltyEvaluate(match);
  if (match.done) return null;

  const maxShots = penaltyMaxShots(match);
  if (match.myIdx >= maxShots && match.oppIdx >= maxShots) return null;
  if (match.myIdx >= maxShots) return 'opp';
  if (match.oppIdx >= maxShots) return 'me';

  if (match.suddenActive) {
    const mySd = Math.max(0, match.myIdx - match.regShots);
    const oppSd = Math.max(0, match.oppIdx - match.regShots);
    if (mySd === oppSd) return match.meFirst ? 'me' : 'opp';
    return mySd < oppSd ? 'me' : 'opp';
  }

  if (match.myIdx === match.oppIdx) return match.meFirst ? 'me' : 'opp';
  return match.myIdx < match.oppIdx ? 'me' : 'opp';
}

function quizClientQuestion(q, index) {
  return {
    id: q.id,
    index,
    diff: q.diff,
    pts: q.pts,
    text: q.text,
    opts: q.opts
  };
}

function sessionView(session) {
  const today = dayKey();
  return {
    sessionId: session.sessionId,
    dayKey: today,
    kick: session.kick,
    dailyEarned: session.economy.dailyEarned,
    quizBoostDay: session.quiz.boostDay,
    quizBoostMult: session.quiz.boostDay === today ? session.quiz.boostMult : 1,
    refBoostDay: session.referral.boostDay,
    refBoostMult: session.referral.boostDay === today ? session.referral.boostMult : 1,
    spin: {
      day: session.spin.day,
      used: session.spin.used,
      invite: session.spin.invite,
      share: session.spin.share,
      tickets: session.spin.tickets,
      cap: spinCap(session),
      left: spinLeft(session)
    },
    penalty: {
      day: session.penalty.day,
      soloPlays: session.penalty.soloPlays,
      soloFreeLeft: Math.max(0, 3 - session.penalty.soloPlays),
      soloShotRateNow: getSoloShotRate(session.penalty.soloPlays)
    },
    referral: {
      boostMult: session.referral.boostDay === today ? session.referral.boostMult : 1,
      f1Registered: session.referral.f1Registered,
      f1Active7: session.referral.f1Active7,
      f2Registered: session.referral.f2Registered,
      f2Active7: session.referral.f2Active7
    }
  };
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 2_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!buf) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(buf));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    writeJson(res, 200, { ok: true });
    return;
  }

  const u = new URL(req.url || '/', 'http://localhost');
  const path = u.pathname;

  if (path === '/health') {
    writeJson(res, 200, { ok: true, service: 'wc26-telecampaign-backend' });
    return;
  }

  try {
    if (req.method === 'POST' && path === '/api/session/init') {
      const body = await readJson(req);
      let sessionId = String(body.sessionId || '').trim();
      if (!sessionId) sessionId = randomUUID();
      const session = getSession(sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      writeJson(res, 200, { ok: true, state: sessionView(session) });
      return;
    }

    if (req.method === 'POST' && path === '/api/session/sync') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      if (Number.isFinite(Number(body.kick))) {
        session.kick = Math.max(0, Math.floor(Number(body.kick)));
      }
      if (Number.isFinite(Number(body.dailyEarned))) {
        session.economy.dailyEarned = Math.max(0, Math.floor(Number(body.dailyEarned)));
      }
      writeJson(res, 200, { ok: true, state: sessionView(session) });
      return;
    }

    if (req.method === 'GET' && path === '/api/referral/state') {
      const session = getSession(u.searchParams.get('sessionId'));
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      writeJson(res, 200, {
        ok: true,
        referral: sessionView(session).referral
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/referral/boost') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      const today = dayKey();
      const mult = Math.max(1, Math.floor(Number(body.mult || 3)));
      session.referral.boostDay = today;
      session.referral.boostMult = Math.max(session.referral.boostMult || 1, mult);
      writeJson(res, 200, {
        ok: true,
        referral: sessionView(session).referral
      });
      return;
    }

    if (req.method === 'GET' && path === '/api/quiz/daily') {
      const session = getSession(u.searchParams.get('sessionId'));
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      const today = dayKey();
      const doneToday = session.quiz.lastQuizDay === today;
      const answered = session.quiz.answers || {};
      const score = Object.values(answered).filter((a) => a.correct).length;
      writeJson(res, 200, {
        ok: true,
        quiz: {
          day: today,
          doneToday,
          streak: session.quiz.streak,
          quizBoostMult: session.quiz.boostDay === today ? session.quiz.boostMult : 1,
          score,
          answeredCount: Object.keys(answered).length,
          questions: session.quiz.questions.map((q, idx) => quizClientQuestion(q, idx))
        },
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/quiz/answer') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      const index = Math.floor(Number(body.index));
      const choice = Math.floor(Number(body.choice));
      if (!Number.isInteger(index) || index < 0 || index >= session.quiz.questions.length) {
        writeJson(res, 400, { ok: false, error: 'invalid_index' });
        return;
      }

      const q = session.quiz.questions[index];
      const prev = session.quiz.answers[index];
      if (prev) {
        const scorePrev = Object.values(session.quiz.answers).filter((a) => a.correct).length;
        writeJson(res, 200, {
          ok: true,
          result: {
            index,
            correct: !!prev.correct,
            correctIndex: q.correct,
            deltaApplied: 0,
            alreadyAnswered: true,
            score: scorePrev,
            answeredCount: Object.keys(session.quiz.answers).length
          },
          economy: {
            kick: session.kick,
            dailyEarned: session.economy.dailyEarned
          }
        });
        return;
      }

      const isCorrect = choice === q.correct;
      const today = dayKey();
      const doneToday = session.quiz.lastQuizDay === today;
      const boost = session.quiz.boostDay === today ? Math.max(1, session.quiz.boostMult || 1) : 1;

      let deltaApplied = 0;
      if (isCorrect && !doneToday) {
        deltaApplied = applyKick(session, q.pts * boost);
      }

      session.quiz.answers[index] = {
        choice,
        correct: isCorrect,
        answeredAt: Date.now()
      };

      const score = Object.values(session.quiz.answers).filter((a) => a.correct).length;
      writeJson(res, 200, {
        ok: true,
        result: {
          index,
          correct: isCorrect,
          correctIndex: q.correct,
          deltaApplied,
          score,
          answeredCount: Object.keys(session.quiz.answers).length,
          doneToday
        },
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/quiz/finalize') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }

      const today = dayKey();
      const answeredCount = Object.keys(session.quiz.answers || {}).length;
      const requiredCount = session.quiz.questions.length;
      const completedToday = answeredCount >= requiredCount;
      let bonusApplied = 0;
      if (completedToday && session.quiz.lastQuizDay !== today) {
        const prev = session.quiz.lastQuizDay;
        if (prev && dayDiff(prev, today) === 1) session.quiz.streak += 1;
        else session.quiz.streak = 1;

        session.quiz.lastQuizDay = today;

        let bonus = 0;
        if (session.quiz.streak === 3) bonus = 50;
        else if (session.quiz.streak === 7) bonus = 150;
        else if (session.quiz.streak === 14) bonus = 300;
        if (bonus > 0) bonusApplied = applyKick(session, bonus);
      }

      writeJson(res, 200, {
        ok: true,
        quiz: {
          doneToday: completedToday && session.quiz.lastQuizDay === today,
          completedToday,
          answeredCount,
          requiredCount,
          streak: session.quiz.streak,
          bonusApplied
        },
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    if (req.method === 'GET' && path === '/api/spin/state') {
      const session = getSession(u.searchParams.get('sessionId'));
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      const view = sessionView(session);
      writeJson(res, 200, {
        ok: true,
        spin: view.spin,
        boosts: {
          quizBoostMult: view.quizBoostMult,
          refBoostMult: view.refBoostMult
        },
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/spin/unlock') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      if (spinCap(session) >= Math.max(1, Math.floor(Number(session.spin.cap || DEFAULT_SPIN_DAILY_CAP)))) {
        writeJson(res, 409, { ok: false, error: 'spin_cap_reached' });
        return;
      }
      const type = String(body.type || '').trim();
      if (type !== 'invite' && type !== 'share') {
        writeJson(res, 400, { ok: false, error: 'invalid_unlock_type' });
        return;
      }
      if (type === 'invite') session.spin.invite += 1;
      if (type === 'share') session.spin.share += 1;
      const view = sessionView(session);
      writeJson(res, 200, { ok: true, spin: view.spin });
      return;
    }

    if (req.method === 'POST' && path === '/api/spin/reset-test') {
      const body = await readJson(req);
      const cap = Math.max(1, Math.min(20, Math.floor(Number(body.left || 10))));
      const sid = String(body.sessionId || '').trim();

      if (!sid) {
        let count = 0;
        for (const session of sessions.values()) {
          ensureToday(session);
          session.spin.cap = cap;
          session.spin.used = 0;
          session.spin.invite = Math.max(0, cap - 1);
          session.spin.share = 0;
          count += 1;
        }
        writeJson(res, 200, { ok: true, resetAll: true, resetCount: count, left: cap });
        return;
      }

      const session = getSession(sid);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      session.spin.cap = cap;
      session.spin.used = 0;
      session.spin.invite = Math.max(0, cap - 1);
      session.spin.share = 0;
      const view = sessionView(session);
      writeJson(res, 200, {
        ok: true,
        spin: view.spin,
        boosts: {
          quizBoostMult: view.quizBoostMult,
          refBoostMult: view.refBoostMult
        },
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/spin/roll') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      if (spinLeft(session) <= 0) {
        writeJson(res, 409, { ok: false, error: 'no_spins_left' });
        return;
      }

      session.spin.used += 1;
      const reward = pickSpinReward();
      const today = dayKey();
      let deltaApplied = 0;

      if (reward.type === 'kick') {
        deltaApplied = applyKick(session, reward.value);
      } else if (reward.type === 'quiz_boost') {
        session.quiz.boostDay = today;
        session.quiz.boostMult = Math.max(2, session.quiz.boostMult || 1);
      } else if (reward.type === 'ref_boost') {
        session.referral.boostDay = today;
        session.referral.boostMult = Math.max(3, session.referral.boostMult || 1);
      } else if (reward.type === 'ticket') {
        session.spin.tickets += 1;
      }

      const view = sessionView(session);
      writeJson(res, 200, {
        ok: true,
        reward,
        deltaApplied,
        spin: view.spin,
        boosts: {
          quizBoostMult: view.quizBoostMult,
          refBoostMult: view.refBoostMult
        },
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    if (req.method === 'GET' && path === '/api/penalty/daily') {
      const session = getSession(u.searchParams.get('sessionId'));
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }
      writeJson(res, 200, {
        ok: true,
        penalty: sessionView(session).penalty,
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/penalty/start') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }

      const mode = body.mode === 'pvp' ? 'pvp' : 'solo';
      let entryFeeApplied = 0;
      let soloShotRateNow = getSoloShotRate(session.penalty.soloPlays);

      if (mode === 'solo') {
        const freeLeft = Math.max(0, 3 - session.penalty.soloPlays);
        if (freeLeft <= 0) {
          if (session.kick < 500) {
            writeJson(res, 409, { ok: false, error: 'insufficient_kick_for_solo_entry' });
            return;
          }
          entryFeeApplied = applyKick(session, -500);
        }
        session.penalty.soloPlays += 1;
      }

      const matchId = randomUUID();
      const match = {
        id: matchId,
        mode,
        regShots: 5,
        sdShots: 5,
        suddenActive: false,
        meFirst: Math.random() < 0.5,
        mySeq: [],
        oppSeq: [],
        myIdx: 0,
        oppIdx: 0,
        meScore: 0,
        oppScore: 0,
        soloShotRate: soloShotRateNow,
        done: false,
        createdAt: Date.now()
      };
      session.penalty.matches[matchId] = match;

      writeJson(res, 200, {
        ok: true,
        match: {
          matchId,
          mode,
          meFirst: match.meFirst,
          suddenActive: false,
          meScore: 0,
          oppScore: 0,
          myIdx: 0,
          oppIdx: 0,
          soloShotRateNow
        },
        entryFeeApplied,
        penalty: sessionView(session).penalty,
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/penalty/shot') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }

      const matchId = String(body.matchId || '');
      const actor = body.actor === 'opp' ? 'opp' : 'me';
      const match = session.penalty.matches[matchId];
      if (!match) {
        writeJson(res, 404, { ok: false, error: 'match_not_found' });
        return;
      }

      penaltyEvaluate(match);
      if (match.done) {
        writeJson(res, 409, { ok: false, error: 'match_already_done' });
        return;
      }

      const expected = penaltyExpectedActor(match);
      if (expected && expected !== actor) {
        writeJson(res, 409, {
          ok: false,
          error: 'wrong_turn',
          expectedActor: expected
        });
        return;
      }

      const maxShots = penaltyMaxShots(match);
      if (actor === 'me' && match.myIdx >= maxShots) {
        writeJson(res, 409, { ok: false, error: 'my_shots_exhausted' });
        return;
      }
      if (actor === 'opp' && match.oppIdx >= maxShots) {
        writeJson(res, 409, { ok: false, error: 'opp_shots_exhausted' });
        return;
      }

      const onTarget = !!body.onTarget;
      const keeperCovered = !!body.keeperCovered;
      const auto = !!body.auto;

      let scored = false;
      if (actor === 'me') {
        if (match.mode === 'solo') {
          scored = onTarget && Math.random() < match.soloShotRate;
        } else {
          scored = onTarget;
        }
        match.mySeq.push(scored);
        match.myIdx += 1;
      } else {
        if (match.mode === 'solo') {
          let saveChance = 0.25;
          if (auto) saveChance *= 0.6;
          const saved = Math.random() < saveChance;
          scored = !saved;
        } else {
          const saved = !auto && keeperCovered;
          scored = !saved;
        }
        match.oppSeq.push(scored);
        match.oppIdx += 1;
      }

      penaltyEvaluate(match);

      writeJson(res, 200, {
        ok: true,
        shot: {
          actor,
          scored,
          done: match.done,
          suddenActive: match.suddenActive,
          meScore: match.meScore,
          oppScore: match.oppScore,
          myIdx: match.myIdx,
          oppIdx: match.oppIdx,
          mySeq: match.mySeq,
          oppSeq: match.oppSeq
        }
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/penalty/finalize') {
      const body = await readJson(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 400, { ok: false, error: 'invalid_session' });
        return;
      }

      const matchId = String(body.matchId || '');
      const match = session.penalty.matches[matchId];
      if (!match) {
        writeJson(res, 404, { ok: false, error: 'match_not_found' });
        return;
      }

      penaltyEvaluate(match);

      let result = 'draw';
      if (match.meScore > match.oppScore) result = 'win';
      else if (match.meScore < match.oppScore) result = 'loss';

      let delta = 0;
      if (result === 'win') delta = 2000;
      else if (result === 'loss' && match.mode === 'pvp') delta = -2500;

      const deltaApplied = delta === 0 ? 0 : applyKick(session, delta);

      delete session.penalty.matches[matchId];

      writeJson(res, 200, {
        ok: true,
        result,
        deltaApplied,
        final: {
          meScore: match.meScore,
          oppScore: match.oppScore,
          mode: match.mode
        },
        penalty: sessionView(session).penalty,
        economy: {
          kick: session.kick,
          dailyEarned: session.economy.dailyEarned
        }
      });
      return;
    }

    writeJson(res, 404, {
      ok: false,
      error: 'not_found',
      endpoints: [
        'POST /api/session/init',
        'POST /api/session/sync',
        'GET /api/referral/state',
        'POST /api/referral/boost',
        'GET /api/quiz/daily',
        'POST /api/quiz/answer',
        'POST /api/quiz/finalize',
        'GET /api/spin/state',
        'POST /api/spin/unlock',
        'POST /api/spin/reset-test',
        'POST /api/spin/roll',
        'GET /api/penalty/daily',
        'POST /api/penalty/start',
        'POST /api/penalty/shot',
        'POST /api/penalty/finalize',
        'GET /health'
      ]
    });
  } catch (err) {
    writeJson(res, 500, {
      ok: false,
      error: 'server_error',
      message: err && err.message ? err.message : 'unknown_error'
    });
  }
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`WC26 backend listening on :${port}`);
});
