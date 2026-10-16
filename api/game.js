// Relay for FIBA LiveStats (Genius Sports). The feed doesn't allow browsers on other sites to read it,
// so the page asks this function instead: GET /api/game?id=2882445
// It returns team names, score, clock and a trimmed play-by-play (shots, free throws, rebounds,
// turnovers, timeouts) in the compact format the page decodes.

const FEED = id => `https://fibalivestats.dcd.shared.geniussports.com/data/${id}/data.json`;
const KEEP = { '2pt': '2', '3pt': '3', freethrow: '1', rebound: 'R', turnover: 'T', timeout: 'X' };
const QUAL = { fastbreak: 'f', '2ndchance': 's', pointsinthepaint: 'p', fromturnover: 't' };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const id = String((req.query && req.query.id) || '').replace(/\D/g, '');
  if (!id) {
    res.status(400).json({ error: 'Add a LiveStats game number, for example /api/game?id=2882445' });
    return;
  }

  let j;
  try {
    const r = await fetch(`${FEED(id)}?_=${Date.now()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (89ers Courtside)' },
    });
    if (r.status === 404) {
      res.status(404).json({ error: 'LiveStats has no data for this game yet. It usually appears shortly before tip-off.' });
      return;
    }
    if (!r.ok) {
      res.status(502).json({ error: `LiveStats answered ${r.status}` });
      return;
    }
    j = await r.json();
  } catch (e) {
    res.status(502).json({ error: 'Could not reach LiveStats' });
    return;
  }

  // The feed lists play-by-play newest first; the page wants oldest first.
  const pbp = Array.isArray(j.pbp) ? j.pbp.slice().reverse() : [];
  const ev = [];
  for (const p of pbp) {
    let c = KEEP[p.actionType];
    if (!c) continue;
    if (c === 'R') c = p.subType === 'offensive' ? 'O' : 'D';
    const q = (p.qualifier || []).map(z => QUAL[z] || '').join('');
    const ot = p.periodType && p.periodType !== 'REGULAR' ? 'o' : '';
    ev.push([p.period, ot, p.gt, p.tno, c, p.success ? 1 : 0, q].join(','));
  }

  const team = t => {
    const m = (j.tm && j.tm[t]) || {};
    return { name: m.name || `Team ${t}`, short: m.shortName || m.name || '', code: m.code || `T${t}`, score: m.score ?? 0 };
  };

  res.status(200).json({
    id,
    clock: j.clock || '10:00',
    period: j.period || 1,
    inOT: j.inOT || 0,
    periodLength: j.periodLength || 10,
    ended: pbp.some(p => p.actionType === 'game' && p.subType === 'end'),
    t1: team('1'),
    t2: team('2'),
    ev: ev.join(';'),
  });
};
